import { getAddress } from "ethers";
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

export type PolicyViolationCode =
  | "INVALID_INTENT"
  | "TASK_MISMATCH"
  | "RESOURCE_MISMATCH"
  | "PAYEE_MISMATCH"
  | "ASSET_NETWORK_MISMATCH"
  | "EXPIRY_MISMATCH"
  | "AMOUNT_EXCEEDED"
  | "BUDGET_EXCEEDED"
  | "DAILY_CAP_EXCEEDED"
  | "TASK_CAP_EXCEEDED"
  | "VELOCITY_EXCEEDED"
  | "MERCHANT_NOT_ALLOWED"
  | "PAYEE_NOT_ALLOWED"
  | "ASSET_NOT_ALLOWED"
  | "NETWORK_NOT_ALLOWED"
  | "EXPIRED"
  | "TRUST_NOT_VERIFIED"
  | "NONCE_REPLAY"
  | "CONTEXT_POISONED"
  | "APPROVAL_REQUIRED";

export interface RuleViolation {
  code: PolicyViolationCode;
  message: string;
}

export function parseAmount(value: string | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new TypeError("Amount cannot be negative");
    return value;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`Amount must be an unsigned atomic-unit integer: ${value}`);
  }
  return BigInt(value);
}

function matchesPattern(value: string, pattern: string): boolean {
  // Patterns are anchored globs. This avoids substring allowlist bypasses such as
  // https://merchant.example.attacker.test matching merchant.example.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function payeeAddress(payee: PaymentIntent["payee"]): string {
  return typeof payee === "string" ? payee : payee.address;
}

function merchantUrl(intent: PaymentIntent, context: TaskContext): string {
  if (typeof intent.payee !== "string") return intent.payee.merchant_url;
  return context.merchant_url ?? intent.resource;
}

function samePayee(a: PaymentIntent["payee"], b: TaskContext["payee"]): boolean {
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  if (typeof a === "string" || typeof b === "string") return false;
  return a.address.toLowerCase() === b.address.toLowerCase() && a.merchant_url === b.merchant_url;
}

export class ConfigurablePolicyRules {
  readonly config: Readonly<PolicyConfig> & {
    per_call_budget_cap: bigint;
    daily_budget_cap: bigint;
    task_specific_caps: Readonly<Record<string, bigint>>;
    high_risk_threshold: bigint;
  };

  constructor(config: PolicyConfig) {
    if (!Number.isSafeInteger(config.velocity_limit.max_calls) || config.velocity_limit.max_calls < 1) {
      throw new TypeError("velocity_limit.max_calls must be a positive safe integer");
    }
    if (!Number.isSafeInteger(config.velocity_limit.window_seconds) || config.velocity_limit.window_seconds < 1) {
      throw new TypeError("velocity_limit.window_seconds must be a positive safe integer");
    }
    const taskCaps: Record<string, bigint> = {};
    for (const [task, amount] of Object.entries(config.task_specific_caps)) taskCaps[task] = parseAmount(amount);
    const addresses = config.allowed_payee_addresses.map((address) => {
      try { return getAddress(address).toLowerCase(); } catch { throw new TypeError(`Invalid payee address: ${address}`); }
    });
    this.config = {
      ...config,
      per_call_budget_cap: parseAmount(config.per_call_budget_cap),
      daily_budget_cap: parseAmount(config.daily_budget_cap),
      task_specific_caps: taskCaps,
      allowed_payee_addresses: addresses,
      high_risk_threshold: parseAmount(config.high_risk_threshold ?? config.per_call_budget_cap),
    };
  }

  evaluate(intent: PaymentIntent, context: TaskContext, usage: UsageSnapshot, now: number): RuleViolation[] {
    const violations: RuleViolation[] = [];
    if (!intent || !context || !Number.isFinite(now)) {
      return [{ code: "INVALID_INTENT", message: "Intent, context, and amount must be valid" }];
    }
    const amount = (() => { try { return parseAmount(intent.max_amount); } catch { return null; } })();
    if (amount === null) return [{ code: "INVALID_INTENT", message: "Intent amount must be an unsigned atomic-unit integer" }];
    if (intent.task_id !== context.task_id) violations.push({ code: "TASK_MISMATCH", message: "[TASK MISMATCH] Intent task does not match task context" });
    if (intent.resource !== context.resource) violations.push({ code: "RESOURCE_MISMATCH", message: "Intent resource does not match task context" });
    if (!samePayee(intent.payee, context.payee)) violations.push({ code: "PAYEE_MISMATCH", message: "[MERCHANT MISMATCH] Intent payee does not match task context" });
    if (intent.max_amount !== context.max_amount) violations.push({ code: "AMOUNT_EXCEEDED", message: "Intent amount does not match task context" });
    if (intent.asset_network.asset !== context.asset_network.asset || intent.asset_network.network !== context.asset_network.network) {
      violations.push({ code: "ASSET_NETWORK_MISMATCH", message: "Intent asset/network does not match task context" });
    }
    if (intent.expires_at !== context.expires_at) violations.push({ code: "EXPIRY_MISMATCH", message: "Intent expiry does not match task context" });
    const url = merchantUrl(intent, context);
    if (!validHttpUrl(url)) violations.push({ code: "MERCHANT_NOT_ALLOWED", message: "Merchant URL must be HTTPS" });
    if (!this.config.allowed_merchant_url_patterns.some((pattern) => matchesPattern(url, pattern))) {
      violations.push({ code: "MERCHANT_NOT_ALLOWED", message: "Merchant URL is not in the allowlist" });
    }
    let address = "";
    try { address = getAddress(payeeAddress(intent.payee)).toLowerCase(); } catch { violations.push({ code: "PAYEE_NOT_ALLOWED", message: "Payee address is invalid" }); }
    if (address && !this.config.allowed_payee_addresses.includes(address)) violations.push({ code: "PAYEE_NOT_ALLOWED", message: "Payee address is not in the allowlist" });
    if (this.config.allowed_assets && !this.config.allowed_assets.includes(intent.asset_network.asset)) violations.push({ code: "ASSET_NOT_ALLOWED", message: "Asset is not allowed" });
    if (this.config.allowed_networks && !this.config.allowed_networks.includes(intent.asset_network.network)) violations.push({ code: "NETWORK_NOT_ALLOWED", message: "Network is not allowed" });
    if (amount > this.config.per_call_budget_cap) violations.push({ code: "BUDGET_EXCEEDED", message: "[BUDGET EXCEEDED] Per-call budget cap exceeded" });
    const taskCap = this.config.task_specific_caps[intent.task_id];
    if (taskCap === undefined) violations.push({ code: "TASK_CAP_EXCEEDED", message: "No task-specific budget cap is configured" });
    else if (usage.task_spent + amount > taskCap) violations.push({ code: "TASK_CAP_EXCEEDED", message: "Task-specific budget cap exceeded" });
    if (usage.daily_spent + amount > this.config.daily_budget_cap) violations.push({ code: "DAILY_CAP_EXCEEDED", message: "Daily budget cap exceeded" });
    const cutoff = now - this.config.velocity_limit.window_seconds;
    const recent = usage.recent_call_timestamps.filter((timestamp) => timestamp >= cutoff);
    if (recent.length >= this.config.velocity_limit.max_calls) violations.push({ code: "VELOCITY_EXCEEDED", message: "Velocity limit exceeded" });
    if (intent.expires_at <= now) violations.push({ code: "EXPIRED", message: "Intent has expired" });
    return violations;
  }
}

export type PolicyRules = ConfigurablePolicyRules;
export type SecurityPolicy = PolicyConfig;
export const createPolicyRules = (config: PolicyConfig): ConfigurablePolicyRules => new ConfigurablePolicyRules(config);
