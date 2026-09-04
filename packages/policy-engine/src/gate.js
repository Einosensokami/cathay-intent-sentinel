import { ConfigurablePolicyRules, parseAmount } from "./rules.js";
import { InMemoryNonceRegistry, OwaspDefense, isolateTaskContext } from "./owasp-defense.js";
import { InMemoryTrustRegistry } from "./trust-registry.js";
import {} from "./escalation.js";
import { intentHash } from "./owasp-defense.js";
export class InMemoryUsageLedger {
    dailySpent = 0n;
    day = "";
    taskSpent = new Map();
    calls = [];
    async snapshot(taskId, now) {
        this.resetIfNewDay(now);
        const cutoff = now - 24 * 60 * 60;
        return {
            daily_spent: this.dailySpent,
            task_spent: this.taskSpent.get(taskId) ?? 0n,
            recent_call_timestamps: this.calls.filter((timestamp) => timestamp >= cutoff),
        };
    }
    async record(taskId, amount, at) {
        this.resetIfNewDay(at);
        this.dailySpent += amount;
        this.taskSpent.set(taskId, (this.taskSpent.get(taskId) ?? 0n) + amount);
        this.calls.push(at);
        while (this.calls.length > 10_000)
            this.calls.shift();
    }
    resetIfNewDay(now) {
        const day = new Date(now * 1000).toISOString().slice(0, 10);
        if (!this.day)
            this.day = day;
        if (day !== this.day) {
            this.day = day;
            this.dailySpent = 0n;
            this.taskSpent.clear();
            this.calls.length = 0;
        }
    }
}
class AsyncLock {
    tail = Promise.resolve();
    async run(operation) {
        const previous = this.tail;
        let release;
        this.tail = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
}
function validIntent(intent) {
    const payeeValid = !!intent?.payee && (typeof intent.payee === "string" ||
        (typeof intent.payee === "object" && typeof intent.payee.address === "string" && typeof intent.payee.merchant_url === "string"));
    return !!intent && typeof intent.task_id === "string" && typeof intent.resource === "string" && payeeValid &&
        typeof intent.max_amount === "string" && typeof intent.expires_at === "number" &&
        !!intent.asset_network && typeof intent.asset_network.asset === "string" && typeof intent.asset_network.network === "string";
}
export class PolicyGate {
    rules;
    nonceRegistry;
    usageLedger;
    trustRegistry;
    defense;
    logger;
    approvalWorkflow;
    now;
    lock = new AsyncLock();
    approvedIntents = new Set();
    constructor(rules, options = {}) {
        this.rules = rules instanceof ConfigurablePolicyRules ? rules : new ConfigurablePolicyRules(rules);
        this.nonceRegistry = options.nonceRegistry ?? new InMemoryNonceRegistry();
        this.usageLedger = options.usageLedger ?? new InMemoryUsageLedger();
        this.trustRegistry = options.trustRegistry ?? new InMemoryTrustRegistry();
        this.defense = new OwaspDefense(this.nonceRegistry);
        this.logger = options.logger;
        this.approvalWorkflow = options.approvalWorkflow;
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    }
    async evaluate(intent, suppliedContext) {
        const at = this.now();
        let hash = "invalid";
        const violations = [];
        try {
            if (!validIntent(intent)) {
                violations.push({ code: "INVALID_INTENT", message: "Intent is malformed" });
            }
            else {
                hash = intentHash(intent);
                const isolated = isolateTaskContext(suppliedContext);
                const usage = await this.usageLedger.snapshot(intent.task_id, at);
                violations.push(...this.rules.evaluate(intent, isolated.context, usage, at));
                const defense = await this.defense.inspect(intent, suppliedContext, usage);
                violations.push(...defense.violations);
                const payeeAddress = typeof intent.payee === "string" ? intent.payee : intent.payee.address;
                const merchantUrl = typeof intent.payee === "string" ? isolated.context.merchant_url ?? intent.resource : intent.payee.merchant_url;
                const trust = await this.trustRegistry.verifyMerchant(payeeAddress, merchantUrl);
                if (!trust.verified)
                    violations.push({ code: "TRUST_NOT_VERIFIED", message: trust.reason });
                if (violations.length === 0 && parseAmount(intent.max_amount) > this.rules.config.high_risk_threshold) {
                    const approvalId = isolated.context.approval_id;
                    if (!this.approvalWorkflow) {
                        violations.push({ code: "APPROVAL_REQUIRED", message: "Human approval is required but no workflow is configured" });
                    }
                    else if (!approvalId) {
                        const request = await this.approvalWorkflow.requestApproval(intent, "Amount exceeds the high-risk threshold", at);
                        return await this.finish(intent, "requires_approval", [], ["Human approval required"], hash, request, at);
                    }
                    else {
                        const request = await this.approvalWorkflow.getApproval(approvalId, at);
                        if (!request || request.status !== "approved" || intentHash(request.intent) !== hash) {
                            violations.push({ code: "APPROVAL_REQUIRED", message: "Valid approval for this exact intent is required" });
                        }
                    }
                }
            }
        }
        catch (error) {
            violations.push({ code: "INVALID_INTENT", message: `Policy evaluation failed closed: ${error instanceof Error ? error.message : "unknown error"}` });
        }
        const status = violations.length === 0 ? "allow" : "deny";
        if (status === "allow")
            this.approvedIntents.add(hash);
        return this.finish(intent, status, violations, violations.map((entry) => entry.message), hash, undefined, at);
    }
    async recordSettlement(intent, settledAmount, at = this.now()) {
        const amount = parseAmount(settledAmount);
        if (amount > parseAmount(intent.max_amount))
            throw new RangeError("Settled amount exceeds the approved intent");
        if (!this.approvedIntents.has(intentHash(intent)))
            throw new Error("Cannot record settlement for an intent that was not approved");
        await this.lock.run(async () => {
            const usage = await this.usageLedger.snapshot(intent.task_id, at);
            const taskCap = this.rules.config.task_specific_caps[intent.task_id];
            if (taskCap === undefined || usage.daily_spent + amount > this.rules.config.daily_budget_cap || usage.task_spent + amount > taskCap) {
                throw new Error("Settlement would exceed a configured budget cap");
            }
            const cutoff = at - this.rules.config.velocity_limit.window_seconds;
            if (usage.recent_call_timestamps.filter((timestamp) => timestamp >= cutoff).length >= this.rules.config.velocity_limit.max_calls) {
                throw new Error("Settlement would exceed the velocity limit");
            }
            await this.usageLedger.record(intent.task_id, amount, at);
        });
    }
    async finish(intent, status, violations, reasons, hash, approval_request, at) {
        const log = { intent_hash: hash, task_id: intent?.task_id ?? "unknown", decision: status, reasons, timestamp: at };
        await this.logger?.append(log);
        return { allowed: status === "allow", status, violations, reasons, intent_hash: hash, ...(approval_request ? { approval_request } : {}) };
    }
}
