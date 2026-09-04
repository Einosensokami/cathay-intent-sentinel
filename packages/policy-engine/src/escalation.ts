import { randomUUID } from "node:crypto";
import type { PaymentIntent } from "./rules.js";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRequest {
  id: string;
  intent: PaymentIntent;
  reason: string;
  requested_at: number;
  expires_at: number;
  status: ApprovalStatus;
  decided_by?: string;
  decided_at?: number;
}

export interface HumanApprovalWorkflow {
  requestApproval(intent: PaymentIntent, reason: string, now?: number): Promise<ApprovalRequest>;
  getApproval(id: string, now?: number): Promise<ApprovalRequest | undefined>;
  approve(id: string, approver: string, now?: number): Promise<ApprovalRequest>;
  reject(id: string, approver: string, now?: number): Promise<ApprovalRequest>;
}

export interface ApprovalWorkflowOptions {
  approval_ttl_seconds?: number;
}

export class InMemoryApprovalWorkflow implements HumanApprovalWorkflow {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly ttl: number;

  constructor(options: ApprovalWorkflowOptions = {}) {
    this.ttl = options.approval_ttl_seconds ?? 15 * 60;
    if (!Number.isSafeInteger(this.ttl) || this.ttl < 1) throw new TypeError("approval_ttl_seconds must be positive");
  }

  async requestApproval(intent: PaymentIntent, reason: string, now = Math.floor(Date.now() / 1000)): Promise<ApprovalRequest> {
    const request: ApprovalRequest = { id: randomUUID(), intent, reason, requested_at: now, expires_at: now + this.ttl, status: "pending" };
    this.requests.set(request.id, request);
    return { ...request };
  }

  async getApproval(id: string, now = Math.floor(Date.now() / 1000)): Promise<ApprovalRequest | undefined> {
    const request = this.requests.get(id);
    if (!request) return undefined;
    if (request.status === "pending" && request.expires_at <= now) request.status = "expired";
    return { ...request };
  }

  async approve(id: string, approver: string, now = Math.floor(Date.now() / 1000)): Promise<ApprovalRequest> {
    return this.decide(id, "approved", approver, now);
  }

  async reject(id: string, approver: string, now = Math.floor(Date.now() / 1000)): Promise<ApprovalRequest> {
    return this.decide(id, "rejected", approver, now);
  }

  private async decide(id: string, status: "approved" | "rejected", approver: string, now: number): Promise<ApprovalRequest> {
    if (!approver.trim()) throw new TypeError("An approver identity is required");
    const current = await this.getApproval(id, now);
    if (!current) throw new Error("Approval request not found");
    if (current.status !== "pending") throw new Error(`Approval request is ${current.status}`);
    const next = { ...current, status, decided_by: approver, decided_at: now };
    this.requests.set(id, next);
    return { ...next };
  }
}

/** Backwards-compatible descriptive name used by the policy package tests and examples. */
export { InMemoryApprovalWorkflow as InMemoryHumanApprovalWorkflow };
