import type { PaymentIntent, TaskContext, RuleViolation, UsageSnapshot } from "./rules.js";
export interface IsolatedTaskContext {
    trusted: TaskContext;
    untrusted?: unknown;
}
export interface NonceRegistry {
    isConsumed(nonce: string): Promise<boolean>;
    consume(nonce: string): Promise<boolean>;
}
export declare class InMemoryNonceRegistry implements NonceRegistry {
    private readonly nonces;
    isConsumed(nonce: string): Promise<boolean>;
    consume(nonce: string): Promise<boolean>;
}
export interface ExplainableIntentLog {
    intent_hash: string;
    task_id: string;
    decision: "allow" | "deny" | "requires_approval";
    reasons: readonly string[];
    timestamp: number;
}
export interface IntentLogger {
    append(log: ExplainableIntentLog): Promise<void> | void;
}
export declare class InMemoryIntentLogger implements IntentLogger {
    readonly entries: ExplainableIntentLog[];
    append(log: ExplainableIntentLog): void;
}
export interface DefenseResult {
    violations: RuleViolation[];
    intent_hash: string;
}
export declare const OWASP_AGENTIC_CONTROLS: {
    readonly ASI01: "Trusted task binding prevents goal hijacking";
    readonly ASI02: "Merchant/payee allowlists and trust registry prevent tool misuse";
    readonly ASI03: "Per-call, daily, task, and velocity budgets limit privilege abuse";
    readonly ASI06: "Trusted task context is isolated from untrusted model context";
    readonly ASI08: "Atomic nonce registry prevents authorization replay";
    readonly ASI09: "Every decision has a stable intent hash and explainable reasons";
};
export declare function intentHash(intent: PaymentIntent): string;
export declare function isolateTaskContext(context: TaskContext | IsolatedTaskContext): {
    context: TaskContext;
    poisoned: boolean;
};
export declare class OwaspDefense {
    private readonly nonces;
    constructor(nonces: NonceRegistry);
    inspect(intent: PaymentIntent, context: TaskContext | IsolatedTaskContext, _usage?: UsageSnapshot): Promise<DefenseResult>;
}
