import type { PaymentRequirements } from "./types.js";
export interface AssetNetwork {
    asset: string;
    network: string;
}
/** Six-dimensional authorization boundary for an agent payment. */
export interface PaymentIntent {
    task_id: string;
    resource: string;
    payee: string;
    max_amount: string;
    asset_network: AssetNetwork;
    expires_at: number;
}
export declare class InvalidPaymentIntentError extends Error {
    readonly code = "invalid_payment_intent";
    constructor(message: string);
}
export declare function assertValidPaymentIntent(intent: PaymentIntent, nowSeconds?: number): void;
export declare function intentMatchesPaymentRequirements(intent: PaymentIntent, requirements: PaymentRequirements, resourceUrl?: string): boolean;
export declare function assertIntentAllowsRequirements(intent: PaymentIntent, requirements: PaymentRequirements, nowSeconds?: number): void;
