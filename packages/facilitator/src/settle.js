import { createHash } from "node:crypto";
import { verifyPayment } from "./verify.js";
export class TimeoutUnknownOutcomeError extends Error {
    code = "TIMEOUT_UNKNOWN_OUTCOME";
    constructor(message = "Settlement timed out; transaction outcome is unknown") { super(message); this.name = "TimeoutUnknownOutcomeError"; }
}
function requestHash(request) {
    return createHash("sha256").update(JSON.stringify({ payload: request.paymentPayload ?? request.payload, requirements: request.paymentRequirements ?? request.requirements, payer: request.payer ?? null })).digest("hex");
}
function unknownOutcome(error) {
    if (error instanceof TimeoutUnknownOutcomeError)
        return true;
    if (!error || typeof error !== "object")
        return false;
    const candidate = error;
    return candidate.code === "ETIMEDOUT" || candidate.code === "TIMEOUT_UNKNOWN_OUTCOME" || candidate.name === "AbortError" || /timed? ?out|unknown outcome/i.test(String(candidate.message ?? ""));
}
export class Facilitator {
    options;
    records = new Map();
    lock = new Map();
    clock;
    constructor(options) {
        this.options = options;
        this.clock = options.clock ?? options.now ?? (() => Math.floor(Date.now() / 1000));
    }
    get optionsForVerification() { return this.options; }
    async settle(request) {
        if (!request.idempotency_key || !request.idempotency_key.trim()) {
            const record = this.newRecord("invalid", "rejected", "Idempotency key is required");
            return { ok: false, status: "rejected", record };
        }
        const hash = requestHash(request);
        return this.withKey(request.idempotency_key, () => this.settleExclusive(request, hash));
    }
    async settleExclusive(request, hash) {
        const existing = this.records.get(request.idempotency_key);
        if (existing) {
            if (existing.request_hash !== hash)
                return { ok: false, status: "rejected", record: { ...existing, error: "Idempotency key was reused for a different payment" } };
            return { ok: existing.status === "settled", status: "idempotent", record: { ...existing } };
        }
        const afterWait = this.records.get(request.idempotency_key);
        if (afterWait)
            return { ok: afterWait.status === "settled", status: "idempotent", record: { ...afterWait } };
        const verification = await verifyPayment(request, this.options);
        if (!verification.ok || !verification.nonce) {
            const record = this.newRecord(hash, "rejected", verification.error?.message ?? "Payment verification failed", request.idempotency_key);
            if (verification.payer)
                record.payer = verification.payer;
            this.records.set(request.idempotency_key, record);
            return { ok: false, status: "rejected", record: { ...record }, verification };
        }
        // Claim is atomic. Verification remains read-only; only this state-changing
        // path is allowed to consume a nonce.
        const claimed = await this.options.nonceStore.consume(verification.nonce);
        if (!claimed) {
            const record = this.newRecord(hash, "rejected", "Authorization nonce was consumed concurrently", request.idempotency_key);
            if (verification.payer)
                record.payer = verification.payer;
            record.nonce = verification.nonce;
            this.records.set(request.idempotency_key, record);
            return { ok: false, status: "rejected", record: { ...record }, verification };
        }
        const pending = { ...this.newRecord(hash, "unknown", undefined, request.idempotency_key), ...(verification.payer ? { payer: verification.payer } : {}), nonce: verification.nonce };
        try {
            const payload = (request.paymentPayload ?? request.payload);
            const requirements = (request.paymentRequirements ?? request.requirements);
            const submitted = await this.options.submitter.submit(payload, requirements);
            const settled = {
                ...pending,
                status: "settled",
                updated_at: this.clock(),
                txHash: submitted.txHash,
                ...(submitted.explorerUrl ? { explorerUrl: submitted.explorerUrl } : {}),
                ...(submitted.mode ? { mode: submitted.mode } : {}),
                ...(submitted.simulated !== undefined ? { simulated: submitted.simulated } : {}),
                ...(submitted.receipt !== undefined ? { receipt: submitted.receipt } : {}),
            };
            this.records.set(request.idempotency_key, settled);
            return { ok: true, status: "settled", record: { ...settled }, verification };
        }
        catch (error) {
            if (unknownOutcome(error)) {
                // Do not release the nonce and do not submit again: a timeout may have
                // succeeded on-chain. The idempotency key now has an unknown outcome.
                const maybeTxHash = error && typeof error === "object" && typeof error.txHash === "string"
                    ? error.txHash
                    : undefined;
                const unknown = {
                    ...pending,
                    status: "unknown",
                    updated_at: this.clock(),
                    ...(maybeTxHash ? { txHash: maybeTxHash } : {}),
                    error: error instanceof Error ? error.message : "Settlement outcome is unknown",
                };
                this.records.set(request.idempotency_key, unknown);
                return { ok: false, status: "unknown", record: { ...unknown }, verification };
            }
            await this.options.nonceStore.release?.(verification.nonce);
            const maybeTxHash = error && typeof error === "object" && typeof error.txHash === "string"
                ? error.txHash
                : undefined;
            const rejected = {
                ...pending,
                status: "rejected",
                updated_at: this.clock(),
                ...(maybeTxHash ? { txHash: maybeTxHash } : {}),
                error: error instanceof Error ? error.message : "Settlement failed",
            };
            this.records.set(request.idempotency_key, rejected);
            return { ok: false, status: "rejected", record: { ...rejected }, verification };
        }
    }
    getRecord(idempotencyKey) {
        const record = this.records.get(idempotencyKey);
        return record ? { ...record } : undefined;
    }
    newRecord(hash, status, error, idempotency_key = "") {
        const now = this.clock();
        return { idempotency_key, request_hash: hash, status, created_at: now, updated_at: now, ...(error ? { error } : {}) };
    }
    async withKey(key, operation) {
        const previous = this.lock.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => { release = resolve; });
        this.lock.set(key, current);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (this.lock.get(key) === current)
                this.lock.delete(key);
        }
    }
}
export function createSettlementHandler(options) {
    const facilitator = new Facilitator(options);
    return (request) => facilitator.settle(request);
}
export const createSettleHandler = createSettlementHandler;
