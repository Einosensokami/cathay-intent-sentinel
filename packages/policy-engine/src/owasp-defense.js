import { createHash } from "node:crypto";
export class InMemoryNonceRegistry {
    nonces = new Set();
    async isConsumed(nonce) { return this.nonces.has(nonce); }
    async consume(nonce) {
        if (this.nonces.has(nonce))
            return false;
        this.nonces.add(nonce);
        return true;
    }
}
export class InMemoryIntentLogger {
    entries = [];
    append(log) { this.entries.push({ ...log, reasons: [...log.reasons] }); }
}
export const OWASP_AGENTIC_CONTROLS = {
    ASI01: "Trusted task binding prevents goal hijacking",
    ASI02: "Merchant/payee allowlists and trust registry prevent tool misuse",
    ASI03: "Per-call, daily, task, and velocity budgets limit privilege abuse",
    ASI06: "Trusted task context is isolated from untrusted model context",
    ASI08: "Atomic nonce registry prevents authorization replay",
    ASI09: "Every decision has a stable intent hash and explainable reasons",
};
const CONTROL_FIELDS = new Set(["task_id", "resource", "payee", "max_amount", "asset_network", "expires_at"]);
export function intentHash(intent) {
    const canonical = JSON.stringify({
        task_id: intent.task_id,
        resource: intent.resource,
        payee: typeof intent.payee === "string" ? intent.payee.toLowerCase() : { address: intent.payee.address.toLowerCase(), merchant_url: intent.payee.merchant_url },
        max_amount: intent.max_amount,
        asset_network: intent.asset_network,
        expires_at: intent.expires_at,
        nonce: intent.nonce ?? "",
    });
    return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}
export function isolateTaskContext(context) {
    if ("trusted" in context) {
        const untrusted = context.untrusted;
        if (untrusted && typeof untrusted === "object") {
            const overlapping = Object.keys(untrusted).some((key) => CONTROL_FIELDS.has(key));
            if (overlapping)
                return { context: context.trusted, poisoned: true };
        }
        return { context: context.trusted, poisoned: false };
    }
    return { context, poisoned: false };
}
export class OwaspDefense {
    nonces;
    constructor(nonces) {
        this.nonces = nonces;
    }
    async inspect(intent, context, _usage) {
        const isolated = isolateTaskContext(context);
        const violations = [];
        // ASI01: only immutable, trusted task binding is accepted by the gate.
        if (isolated.poisoned)
            violations.push({ code: "CONTEXT_POISONED", message: "Untrusted context attempted to override policy fields" });
        // ASI08: check-only here; consuming is deliberately reserved for settlement.
        if (intent.nonce && await this.nonces.isConsumed(intent.nonce))
            violations.push({ code: "NONCE_REPLAY", message: "Payment nonce has already been consumed" });
        // ASI02, ASI03 and ASI06 are completed by the configured rules and gate.
        return { violations, intent_hash: intentHash(intent) };
    }
}
