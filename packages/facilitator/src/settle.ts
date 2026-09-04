import { createHash } from "node:crypto";
import type { PaymentPayload, PaymentRequirements } from "@cathay/intent-sentinel-core";
import { verifyPayment, type VerifyOptions, type VerifyResult } from "./verify.js";

export interface TransferSubmitter {
  submit(payload: PaymentPayload, requirements: PaymentRequirements): Promise<{
    txHash: string;
    receipt?: unknown;
    mode?: "onchain" | "mock";
    simulated?: boolean;
    explorerUrl?: string;
  }>;
}

export class TimeoutUnknownOutcomeError extends Error {
  readonly code = "TIMEOUT_UNKNOWN_OUTCOME";
  constructor(message = "Settlement timed out; transaction outcome is unknown") { super(message); this.name = "TimeoutUnknownOutcomeError"; }
}

export type SettlementStatus = "settled" | "rejected" | "unknown";

export interface SettlementRecord {
  idempotency_key: string;
  request_hash: string;
  status: SettlementStatus;
  created_at: number;
  updated_at: number;
  txHash?: string;
  explorerUrl?: string;
  mode?: "onchain" | "mock";
  simulated?: boolean;
  receipt?: unknown;
  error?: string;
  payer?: string;
  nonce?: string;
}

export interface SettleRequest {
  payload?: unknown;
  requirements?: PaymentRequirements;
  paymentPayload?: unknown;
  paymentRequirements?: PaymentRequirements;
  idempotency_key: string;
  payer?: string;
  now?: number;
}

export interface SettleResult {
  ok: boolean;
  status: SettlementStatus | "idempotent";
  record: SettlementRecord;
  verification?: VerifyResult;
}

export interface FacilitatorOptions extends VerifyOptions {
  submitter: TransferSubmitter;
  clock?: () => number;
}

function requestHash(request: SettleRequest): string {
  return createHash("sha256").update(JSON.stringify({ payload: request.paymentPayload ?? request.payload, requirements: request.paymentRequirements ?? request.requirements, payer: request.payer ?? null })).digest("hex");
}

function unknownOutcome(error: unknown): boolean {
  if (error instanceof TimeoutUnknownOutcomeError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  return candidate.code === "ETIMEDOUT" || candidate.code === "TIMEOUT_UNKNOWN_OUTCOME" || candidate.name === "AbortError" || /timed? ?out|unknown outcome/i.test(String(candidate.message ?? ""));
}

export class Facilitator {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly lock = new Map<string, Promise<void>>();
  private readonly clock: () => number;

  constructor(private readonly options: FacilitatorOptions) {
    this.clock = options.clock ?? options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  get optionsForVerification(): VerifyOptions { return this.options; }

  async settle(request: SettleRequest): Promise<SettleResult> {
    if (!request.idempotency_key || !request.idempotency_key.trim()) {
      const record = this.newRecord("invalid", "rejected", "Idempotency key is required");
      return { ok: false, status: "rejected", record };
    }
    const hash = requestHash(request);
    return this.withKey(request.idempotency_key, () => this.settleExclusive(request, hash));
  }

  private async settleExclusive(request: SettleRequest, hash: string): Promise<SettleResult> {
    const existing = this.records.get(request.idempotency_key);
    if (existing) {
      if (existing.request_hash !== hash) return { ok: false, status: "rejected", record: { ...existing, error: "Idempotency key was reused for a different payment" } };
      return { ok: existing.status === "settled", status: "idempotent", record: { ...existing } };
    }
    const afterWait = this.records.get(request.idempotency_key);
    if (afterWait) return { ok: afterWait.status === "settled", status: "idempotent", record: { ...afterWait } };
    const verification = await verifyPayment(request, this.options);
    if (!verification.ok || !verification.nonce) {
      const record = this.newRecord(hash, "rejected", verification.error?.message ?? "Payment verification failed", request.idempotency_key);
      if (verification.payer) record.payer = verification.payer;
      this.records.set(request.idempotency_key, record);
      return { ok: false, status: "rejected", record: { ...record }, verification };
    }
    // Claim is atomic. Verification remains read-only; only this state-changing
    // path is allowed to consume a nonce.
    const claimed = await this.options.nonceStore.consume(verification.nonce);
    if (!claimed) {
      const record = this.newRecord(hash, "rejected", "Authorization nonce was consumed concurrently", request.idempotency_key);
      if (verification.payer) record.payer = verification.payer;
      record.nonce = verification.nonce;
      this.records.set(request.idempotency_key, record);
      return { ok: false, status: "rejected", record: { ...record }, verification };
    }
    const pending: SettlementRecord = { ...this.newRecord(hash, "unknown", undefined, request.idempotency_key), ...(verification.payer ? { payer: verification.payer } : {}), nonce: verification.nonce };
    try {
      const payload = (request.paymentPayload ?? request.payload) as PaymentPayload;
      const requirements = (request.paymentRequirements ?? request.requirements) as PaymentRequirements;
      const submitted = await this.options.submitter.submit(payload, requirements);
      const settled: SettlementRecord = {
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
    } catch (error) {
      if (unknownOutcome(error)) {
        // Do not release the nonce and do not submit again: a timeout may have
        // succeeded on-chain. The idempotency key now has an unknown outcome.
        const maybeTxHash = error && typeof error === "object" && typeof (error as { txHash?: unknown }).txHash === "string"
          ? (error as { txHash: string }).txHash
          : undefined;
        const unknown: SettlementRecord = {
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
      const maybeTxHash = error && typeof error === "object" && typeof (error as { txHash?: unknown }).txHash === "string"
        ? (error as { txHash: string }).txHash
        : undefined;
      const rejected: SettlementRecord = {
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

  getRecord(idempotencyKey: string): SettlementRecord | undefined {
    const record = this.records.get(idempotencyKey);
    return record ? { ...record } : undefined;
  }

  private newRecord(hash: string, status: SettlementStatus, error?: string, idempotency_key = ""): SettlementRecord {
    const now = this.clock();
    return { idempotency_key, request_hash: hash, status, created_at: now, updated_at: now, ...(error ? { error } : {}) };
  }

  private async withKey<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.lock.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.lock.set(key, current);
    await previous;
    try { return await operation(); } finally { release(); if (this.lock.get(key) === current) this.lock.delete(key); }
  }
}

export function createSettlementHandler(options: FacilitatorOptions) {
  const facilitator = new Facilitator(options);
  return (request: SettleRequest) => facilitator.settle(request);
}

export const createSettleHandler = createSettlementHandler;
