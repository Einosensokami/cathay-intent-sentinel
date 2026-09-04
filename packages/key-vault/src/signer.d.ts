import type { Hex } from "viem";
import { type ExactEvmPayload, type PaymentIntent, type PaymentPayload, type PaymentRequirements } from "@cathay/intent-sentinel-core";
import { ScopedKeyVault } from "./vault.js";
export interface Erc3009Signature {
    v: number;
    r: Hex;
    s: Hex;
    wire: Hex;
}
export interface SignPaymentOptions {
    now?: number;
    nonce?: Hex;
    validAfter?: number;
    validBefore?: number;
}
export declare class Erc3009Signer {
    private readonly vault;
    constructor(vault: ScopedKeyVault);
    signPayment(intent: PaymentIntent, requirements: PaymentRequirements, options?: SignPaymentOptions): Promise<PaymentPayload<ExactEvmPayload>>;
    signPaymentDetailed(intent: PaymentIntent, requirements: PaymentRequirements, options?: SignPaymentOptions): Promise<{
        payment: PaymentPayload<ExactEvmPayload>;
        signature: Erc3009Signature;
    }>;
    static splitSignature(signature: Hex): Erc3009Signature;
}
