import { randomUUID } from "node:crypto";
export class InMemoryApprovalWorkflow {
    requests = new Map();
    ttl;
    constructor(options = {}) {
        this.ttl = options.approval_ttl_seconds ?? 15 * 60;
        if (!Number.isSafeInteger(this.ttl) || this.ttl < 1)
            throw new TypeError("approval_ttl_seconds must be positive");
    }
    async requestApproval(intent, reason, now = Math.floor(Date.now() / 1000)) {
        const request = { id: randomUUID(), intent, reason, requested_at: now, expires_at: now + this.ttl, status: "pending" };
        this.requests.set(request.id, request);
        return { ...request };
    }
    async getApproval(id, now = Math.floor(Date.now() / 1000)) {
        const request = this.requests.get(id);
        if (!request)
            return undefined;
        if (request.status === "pending" && request.expires_at <= now)
            request.status = "expired";
        return { ...request };
    }
    async approve(id, approver, now = Math.floor(Date.now() / 1000)) {
        return this.decide(id, "approved", approver, now);
    }
    async reject(id, approver, now = Math.floor(Date.now() / 1000)) {
        return this.decide(id, "rejected", approver, now);
    }
    async decide(id, status, approver, now) {
        if (!approver.trim())
            throw new TypeError("An approver identity is required");
        const current = await this.getApproval(id, now);
        if (!current)
            throw new Error("Approval request not found");
        if (current.status !== "pending")
            throw new Error(`Approval request is ${current.status}`);
        const next = { ...current, status, decided_by: approver, decided_at: now };
        this.requests.set(id, next);
        return { ...next };
    }
}
/** Backwards-compatible descriptive name used by the policy package tests and examples. */
export { InMemoryApprovalWorkflow as InMemoryHumanApprovalWorkflow };
