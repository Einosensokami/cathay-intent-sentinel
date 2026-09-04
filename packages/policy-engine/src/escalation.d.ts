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
export declare class InMemoryApprovalWorkflow implements HumanApprovalWorkflow {
    private readonly requests;
    private readonly ttl;
    constructor(options?: ApprovalWorkflowOptions);
    requestApproval(intent: PaymentIntent, reason: string, now?: number): Promise<ApprovalRequest>;
    getApproval(id: string, now?: number): Promise<ApprovalRequest | undefined>;
    approve(id: string, approver: string, now?: number): Promise<ApprovalRequest>;
    reject(id: string, approver: string, now?: number): Promise<ApprovalRequest>;
    private decide;
}
/** Backwards-compatible descriptive name used by the policy package tests and examples. */
export { InMemoryApprovalWorkflow as InMemoryHumanApprovalWorkflow };
