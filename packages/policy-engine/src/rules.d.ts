export interface Payee {
    address: string;
    merchant_url: string;
}
export interface AssetNetwork {
    asset: string;
    network: string;
}
/** Policy-owned intent shape; it is structurally compatible with core intents
 * while also supporting the optional nonce/merchant URL policy dimensions. */
export interface PaymentIntent {
    task_id: string;
    resource: string;
    payee: string | Payee;
    max_amount: string;
    asset_network: AssetNetwork;
    expires_at: number;
    nonce?: string;
}
export interface TaskContext {
    task_id: string;
    resource: string;
    payee: string | Payee;
    max_amount: string;
    asset_network: AssetNetwork;
    expires_at: number;
    merchant_url?: string;
    approval_id?: string;
}
export type Amount = bigint;
export interface VelocityLimit {
    max_calls: number;
    window_seconds: number;
}
export interface PolicyConfig {
    per_call_budget_cap: string | bigint;
    daily_budget_cap: string | bigint;
    task_specific_caps: Readonly<Record<string, string | bigint>>;
    velocity_limit: VelocityLimit;
    allowed_merchant_url_patterns: readonly string[];
    allowed_payee_addresses: readonly string[];
    high_risk_threshold?: string | bigint;
    allowed_assets?: readonly string[];
    allowed_networks?: readonly string[];
}
export interface UsageSnapshot {
    daily_spent: Amount;
    task_spent: Amount;
    recent_call_timestamps: readonly number[];
}
export type PolicyViolationCode = "INVALID_INTENT" | "TASK_MISMATCH" | "RESOURCE_MISMATCH" | "PAYEE_MISMATCH" | "ASSET_NETWORK_MISMATCH" | "EXPIRY_MISMATCH" | "AMOUNT_EXCEEDED" | "BUDGET_EXCEEDED" | "DAILY_CAP_EXCEEDED" | "TASK_CAP_EXCEEDED" | "VELOCITY_EXCEEDED" | "MERCHANT_NOT_ALLOWED" | "PAYEE_NOT_ALLOWED" | "ASSET_NOT_ALLOWED" | "NETWORK_NOT_ALLOWED" | "EXPIRED" | "TRUST_NOT_VERIFIED" | "NONCE_REPLAY" | "CONTEXT_POISONED" | "APPROVAL_REQUIRED";
export interface RuleViolation {
    code: PolicyViolationCode;
    message: string;
}
export declare function parseAmount(value: string | bigint): bigint;
export declare class ConfigurablePolicyRules {
    readonly config: Readonly<PolicyConfig> & {
        per_call_budget_cap: bigint;
        daily_budget_cap: bigint;
        task_specific_caps: Readonly<Record<string, bigint>>;
        high_risk_threshold: bigint;
    };
    constructor(config: PolicyConfig);
    evaluate(intent: PaymentIntent, context: TaskContext, usage: UsageSnapshot, now: number): RuleViolation[];
}
export type PolicyRules = ConfigurablePolicyRules;
export type SecurityPolicy = PolicyConfig;
export declare const createPolicyRules: (config: PolicyConfig) => ConfigurablePolicyRules;
