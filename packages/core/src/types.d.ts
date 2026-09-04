/** JSON-compatible value used by x402 extension and scheme fields. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
}
export declare const X402_VERSION: 2;
export type X402Version = typeof X402_VERSION;
export type NetworkId = string;
export type PaymentScheme = "exact" | "upto" | "batch-settlement" | (string & {});
export type PaymentFlow = "authorization" | "upfront" | "escrow" | (string & {});
export interface ResourceInfo {
    url: string;
    description?: string;
    mimeType?: string;
    serviceName?: string;
    tags?: string[];
    iconUrl?: string;
}
export interface Extension {
    info: JsonObject;
    schema: JsonObject;
}
export type Extensions = Record<string, Extension>;
export interface PaymentRequirements {
    scheme: PaymentScheme;
    network: NetworkId;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra?: JsonObject;
}
export interface PaymentRequired {
    x402Version: X402Version;
    error?: string;
    resource: ResourceInfo;
    accepts: PaymentRequirements[];
    extensions?: Extensions;
}
export interface Erc3009Authorization {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
}
export interface ExactEvmPayload {
    signature: string;
    authorization: Erc3009Authorization;
}
export interface Permit2Permitted {
    token: string;
    amount: string;
}
export interface Permit2Witness {
    to: string;
    validAfter: string;
    facilitator?: string;
}
export interface Permit2Authorization {
    permitted: Permit2Permitted;
    from: string;
    spender: string;
    nonce: string;
    deadline: string;
    witness: Permit2Witness;
}
export interface UptoPermit2Payload {
    signature: string;
    permit2Authorization: Permit2Authorization;
}
/**
 * The generic x402 core deliberately does not invent a universal batch
 * commitment format. Each network binding defines the commitment body.
 */
export interface BatchSettlementPayload {
    type: string;
    [key: string]: JsonValue;
}
export type SchemePayload = ExactEvmPayload | UptoPermit2Payload | BatchSettlementPayload | JsonObject;
export interface PaymentPayload<Payload extends SchemePayload = SchemePayload> {
    x402Version: X402Version;
    resource?: ResourceInfo;
    accepted: PaymentRequirements;
    payload: Payload;
    extensions?: Extensions;
}
export interface VerifyRequest {
    x402Version: X402Version;
    paymentPayload: PaymentPayload;
    paymentRequirements: PaymentRequirements;
}
export interface VerifyResponseValid {
    isValid: true;
    payer?: string;
    extensions?: Extensions;
    extra?: JsonObject;
}
export interface VerifyResponseInvalid {
    isValid: false;
    invalidReason: string;
    payer?: string;
    extensions?: Extensions;
    extra?: JsonObject;
}
export type VerifyResponse = VerifyResponseValid | VerifyResponseInvalid;
export interface SettleRequest extends VerifyRequest {
}
export interface SettlementResponseSuccess {
    success: true;
    transaction: string;
    network: NetworkId;
    payer?: string;
    amount?: string;
    extensions?: Extensions;
}
export interface SettlementResponseFailure {
    success: false;
    errorReason: string;
    transaction: string;
    network: NetworkId;
    payer?: string;
    amount?: string;
    extensions?: Extensions;
}
export type SettlementResponse = SettlementResponseSuccess | SettlementResponseFailure;
/** Alias used by facilitator implementations and the x402 specification. */
export type SettleResponse = SettlementResponse;
export interface SupportedKind {
    x402Version: X402Version;
    scheme: PaymentScheme;
    network: NetworkId;
    extra?: JsonObject;
}
export interface SupportedResponse {
    kinds: SupportedKind[];
    extensions: string[];
    signers: Record<string, string[]>;
}
