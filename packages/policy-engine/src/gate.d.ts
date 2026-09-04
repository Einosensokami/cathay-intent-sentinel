import { ConfigurablePolicyRules, type PaymentIntent, type TaskContext, type PolicyRules, type RuleViolation, type UsageSnapshot } from "./rules.js";
import { type IsolatedTaskContext, type NonceRegistry, type IntentLogger } from "./owasp-defense.js";
import { type TrustRegistry } from "./trust-registry.js";
import { type ApprovalRequest, type HumanApprovalWorkflow } from "./escalation.js";
export interface PolicyDecision {
    allowed: boolean;
    status: "allow" | "deny" | "requires_approval";
    violations: readonly RuleViolation[];
    reasons: readonly string[];
    intent_hash: string;
    approval_request?: ApprovalRequest;
}
export interface UsageLedger {
    snapshot(taskId: string, now: number): Promise<UsageSnapshot>;
    record(taskId: string, amount: bigint, at: number): Promise<void>;
}
export declare class InMemoryUsageLedger implements UsageLedger {
    private dailySpent;
    private day;
    private readonly taskSpent;
    private readonly calls;
    snapshot(taskId: string, now: number): Promise<UsageSnapshot>;
    record(taskId: string, amount: bigint, at: number): Promise<void>;
    private resetIfNewDay;
}
export interface PolicyGateOptions {
    trustRegistry?: TrustRegistry;
    nonceRegistry?: NonceRegistry;
    usageLedger?: UsageLedger;
    logger?: IntentLogger;
    approvalWorkflow?: HumanApprovalWorkflow;
    now?: () => number;
}
export declare class PolicyGate {
    readonly rules: PolicyRules;
    readonly nonceRegistry: NonceRegistry;
    readonly usageLedger: UsageLedger;
    readonly trustRegistry: TrustRegistry;
    private readonly defense;
    private readonly logger;
    private readonly approvalWorkflow;
    private readonly now;
    private readonly lock;
    private readonly approvedIntents;
    constructor(rules: PolicyRules | ConstructorParameters<typeof ConfigurablePolicyRules>[0], options?: PolicyGateOptions);
    evaluate(intent: PaymentIntent, suppliedContext: TaskContext | IsolatedTaskContext): Promise<PolicyDecision>;
    recordSettlement(intent: PaymentIntent, settledAmount: string | bigint, at?: number): Promise<void>;
    private finish;
}
