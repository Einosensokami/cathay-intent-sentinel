import { type PaymentPayload, type PaymentRequired, type SettlementResponse } from "./types.js";
export declare const PAYMENT_REQUIRED_HEADER: "PAYMENT-REQUIRED";
export declare const PAYMENT_SIGNATURE_HEADER: "PAYMENT-SIGNATURE";
export declare const PAYMENT_RESPONSE_HEADER: "PAYMENT-RESPONSE";
export declare class InvalidPaymentHeaderError extends Error {
    constructor(message: string);
}
export declare function encodePaymentRequired(value: PaymentRequired): string;
export declare function decodePaymentRequired(value: string): PaymentRequired;
export declare function encodePaymentPayload(value: PaymentPayload): string;
export declare function decodePaymentPayload(value: string): PaymentPayload;
export declare function encodeSettlementResponse(value: SettlementResponse): string;
export declare function decodeSettlementResponse(value: string): SettlementResponse;
