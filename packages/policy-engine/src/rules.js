import { getAddress } from "ethers";
export function parseAmount(value) {
    if (typeof value === "bigint") {
        if (value < 0n)
            throw new TypeError("Amount cannot be negative");
        return value;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
        throw new TypeError(`Amount must be an unsigned atomic-unit integer: ${value}`);
    }
    return BigInt(value);
}
function matchesPattern(value, pattern) {
    // Patterns are anchored globs. This avoids substring allowlist bypasses such as
    // https://merchant.example.attacker.test matching merchant.example.
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i").test(value);
}
function validHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:";
    }
    catch {
        return false;
    }
}
function payeeAddress(payee) {
    return typeof payee === "string" ? payee : payee.address;
}
function merchantUrl(intent, context) {
    if (typeof intent.payee !== "string")
        return intent.payee.merchant_url;
    return context.merchant_url ?? intent.resource;
}
function samePayee(a, b) {
    if (typeof a === "string" && typeof b === "string")
        return a.toLowerCase() === b.toLowerCase();
    if (typeof a === "string" || typeof b === "string")
        return false;
    return a.address.toLowerCase() === b.address.toLowerCase() && a.merchant_url === b.merchant_url;
}
export class ConfigurablePolicyRules {
    config;
    constructor(config) {
        if (!Number.isSafeInteger(config.velocity_limit.max_calls) || config.velocity_limit.max_calls < 1) {
            throw new TypeError("velocity_limit.max_calls must be a positive safe integer");
        }
        if (!Number.isSafeInteger(config.velocity_limit.window_seconds) || config.velocity_limit.window_seconds < 1) {
            throw new TypeError("velocity_limit.window_seconds must be a positive safe integer");
        }
        const taskCaps = {};
        for (const [task, amount] of Object.entries(config.task_specific_caps))
            taskCaps[task] = parseAmount(amount);
        const addresses = config.allowed_payee_addresses.map((address) => {
            try {
                return getAddress(address).toLowerCase();
            }
            catch {
                throw new TypeError(`Invalid payee address: ${address}`);
            }
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
    evaluate(intent, context, usage, now) {
        const violations = [];
        if (!intent || !context || !Number.isFinite(now)) {
            return [{ code: "INVALID_INTENT", message: "Intent, context, and amount must be valid" }];
        }
        const amount = (() => { try {
            return parseAmount(intent.max_amount);
        }
        catch {
            return null;
        } })();
        if (amount === null)
            return [{ code: "INVALID_INTENT", message: "Intent amount must be an unsigned atomic-unit integer" }];
        if (intent.task_id !== context.task_id)
            violations.push({ code: "TASK_MISMATCH", message: "[TASK MISMATCH] Intent task does not match task context" });
        if (intent.resource !== context.resource)
            violations.push({ code: "RESOURCE_MISMATCH", message: "Intent resource does not match task context" });
        if (!samePayee(intent.payee, context.payee))
            violations.push({ code: "PAYEE_MISMATCH", message: "[MERCHANT MISMATCH] Intent payee does not match task context" });
        if (intent.max_amount !== context.max_amount)
            violations.push({ code: "AMOUNT_EXCEEDED", message: "Intent amount does not match task context" });
        if (intent.asset_network.asset !== context.asset_network.asset || intent.asset_network.network !== context.asset_network.network) {
            violations.push({ code: "ASSET_NETWORK_MISMATCH", message: "Intent asset/network does not match task context" });
        }
        if (intent.expires_at !== context.expires_at)
            violations.push({ code: "EXPIRY_MISMATCH", message: "Intent expiry does not match task context" });
        const url = merchantUrl(intent, context);
        if (!validHttpUrl(url))
            violations.push({ code: "MERCHANT_NOT_ALLOWED", message: "Merchant URL must be HTTPS" });
        if (!this.config.allowed_merchant_url_patterns.some((pattern) => matchesPattern(url, pattern))) {
            violations.push({ code: "MERCHANT_NOT_ALLOWED", message: "Merchant URL is not in the allowlist" });
        }
        let address = "";
        try {
            address = getAddress(payeeAddress(intent.payee)).toLowerCase();
        }
        catch {
            violations.push({ code: "PAYEE_NOT_ALLOWED", message: "Payee address is invalid" });
        }
        if (address && !this.config.allowed_payee_addresses.includes(address))
            violations.push({ code: "PAYEE_NOT_ALLOWED", message: "Payee address is not in the allowlist" });
        if (this.config.allowed_assets && !this.config.allowed_assets.includes(intent.asset_network.asset))
            violations.push({ code: "ASSET_NOT_ALLOWED", message: "Asset is not allowed" });
        if (this.config.allowed_networks && !this.config.allowed_networks.includes(intent.asset_network.network))
            violations.push({ code: "NETWORK_NOT_ALLOWED", message: "Network is not allowed" });
        if (amount > this.config.per_call_budget_cap)
            violations.push({ code: "BUDGET_EXCEEDED", message: "[BUDGET EXCEEDED] Per-call budget cap exceeded" });
        const taskCap = this.config.task_specific_caps[intent.task_id];
        if (taskCap === undefined)
            violations.push({ code: "TASK_CAP_EXCEEDED", message: "No task-specific budget cap is configured" });
        else if (usage.task_spent + amount > taskCap)
            violations.push({ code: "TASK_CAP_EXCEEDED", message: "Task-specific budget cap exceeded" });
        if (usage.daily_spent + amount > this.config.daily_budget_cap)
            violations.push({ code: "DAILY_CAP_EXCEEDED", message: "Daily budget cap exceeded" });
        const cutoff = now - this.config.velocity_limit.window_seconds;
        const recent = usage.recent_call_timestamps.filter((timestamp) => timestamp >= cutoff);
        if (recent.length >= this.config.velocity_limit.max_calls)
            violations.push({ code: "VELOCITY_EXCEEDED", message: "Velocity limit exceeded" });
        if (intent.expires_at <= now)
            violations.push({ code: "EXPIRED", message: "Intent has expired" });
        return violations;
    }
}
export const createPolicyRules = (config) => new ConfigurablePolicyRules(config);
