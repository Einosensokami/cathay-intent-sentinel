import type { PaymentRequirements, Erc3009Authorization } from "@cathay/intent-sentinel-core";
export interface BalanceReader {
    getBalance(address: string, asset: string, network: string): Promise<bigint>;
}
export interface NonceStore {
    isConsumed(nonce: string): Promise<boolean>;
    consume(nonce: string): Promise<boolean>;
    release?(nonce: string): Promise<void>;
}
export interface VerifyRequest {
    /** Short form accepted by this package. */
    payload?: unknown;
    requirements?: PaymentRequirements;
    /** Canonical x402 v2 POST body names. */
    paymentPayload?: unknown;
    paymentRequirements?: PaymentRequirements;
    payer?: string;
    now?: number;
}
export type TransferAuthorization = Erc3009Authorization;
export type VerifyErrorCode = "MALFORMED_PAYLOAD" | "REQUIREMENTS_MISMATCH" | "INVALID_SIGNATURE" | "NONCE_CONSUMED" | "INVALID_TIME_WINDOW" | "INSUFFICIENT_BALANCE" | "UNSUPPORTED_SCHEME" | "VERIFICATION_ERROR";
export interface VerifyResult {
    ok: boolean;
    payer?: string;
    amount?: string;
    nonce?: string;
    error?: {
        code: VerifyErrorCode;
        message: string;
    };
}
export interface VerifyOptions {
    balanceReader: BalanceReader;
    nonceStore: NonceStore;
    now?: () => number;
    domainName?: string;
    domainVersion?: string;
}
export declare function verifyPayment(request: VerifyRequest, options: VerifyOptions): Promise<VerifyResult>;
export declare const createVerifyHandler: (options: VerifyOptions) => (request: VerifyRequest) => Promise<VerifyResult>;
export declare const verify: typeof verifyPayment;
