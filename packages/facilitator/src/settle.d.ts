import type { PaymentPayload, PaymentRequirements } from "@cathay/intent-sentinel-core";
import { type VerifyOptions, type VerifyResult } from "./verify.js";
export interface TransferSubmitter {
    submit(payload: PaymentPayload, requirements: PaymentRequirements): Promise<{
        txHash: string;
        receipt?: unknown;
        mode?: "onchain" | "mock";
        simulated?: boolean;
        explorerUrl?: string;
    }>;
}
export declare class TimeoutUnknownOutcomeError extends Error {
    readonly code = "TIMEOUT_UNKNOWN_OUTCOME";
    constructor(message?: string);
}
export type SettlementStatus = "settled" | "rejected" | "unknown";
export interface SettlementRecord {
    idempotency_key: string;
    request_hash: string;
    status: SettlementStatus;
    created_at: number;
    updated_at: number;
    txHash?: string;
    explorerUrl?: string;
    mode?: "onchain" | "mock";
    simulated?: boolean;
    receipt?: unknown;
    error?: string;
    payer?: string;
    nonce?: string;
}
export interface SettleRequest {
    payload?: unknown;
    requirements?: PaymentRequirements;
    paymentPayload?: unknown;
    paymentRequirements?: PaymentRequirements;
    idempotency_key: string;
    payer?: string;
    now?: number;
}
export interface SettleResult {
    ok: boolean;
    status: SettlementStatus | "idempotent";
    record: SettlementRecord;
    verification?: VerifyResult;
}
export interface FacilitatorOptions extends VerifyOptions {
    submitter: TransferSubmitter;
    clock?: () => number;
}
export declare class Facilitator {
    private readonly options;
    private readonly records;
    private readonly lock;
    private readonly clock;
    constructor(options: FacilitatorOptions);
    get optionsForVerification(): VerifyOptions;
    settle(request: SettleRequest): Promise<SettleResult>;
    private settleExclusive;
    getRecord(idempotencyKey: string): SettlementRecord | undefined;
    private newRecord;
    private withKey;
}
export declare function createSettlementHandler(options: FacilitatorOptions): (request: SettleRequest) => Promise<SettleResult>;
export declare const createSettleHandler: typeof createSettlementHandler;
