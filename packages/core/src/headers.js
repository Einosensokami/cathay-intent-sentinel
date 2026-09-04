import { X402_VERSION, } from "./types.js";
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
export class InvalidPaymentHeaderError extends Error {
    constructor(message) {
        super(message);
        this.name = "InvalidPaymentHeaderError";
    }
}
function decodeJson(encoded, headerName) {
    if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
        throw new InvalidPaymentHeaderError(`${headerName} is not valid standard Base64`);
    }
    let parsed;
    try {
        parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    }
    catch {
        throw new InvalidPaymentHeaderError(`${headerName} does not contain valid JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InvalidPaymentHeaderError(`${headerName} must contain a JSON object`);
    }
    return parsed;
}
function encodeJson(value, requireVersion = false) {
    if (requireVersion && value.x402Version !== X402_VERSION) {
        throw new InvalidPaymentHeaderError("x402 headers require x402Version=2");
    }
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}
export function encodePaymentRequired(value) {
    return encodeJson(value, true);
}
export function decodePaymentRequired(value) {
    const result = decodeJson(value, PAYMENT_REQUIRED_HEADER);
    if (result.x402Version !== X402_VERSION || typeof result.resource?.url !== "string" || !Array.isArray(result.accepts))
        throw new InvalidPaymentHeaderError(`${PAYMENT_REQUIRED_HEADER} has an invalid PaymentRequired object`);
    return result;
}
export function encodePaymentPayload(value) {
    return encodeJson(value, true);
}
export function decodePaymentPayload(value) {
    const result = decodeJson(value, PAYMENT_SIGNATURE_HEADER);
    if (result.x402Version !== X402_VERSION || !result.accepted || typeof result.accepted !== "object" || !result.payload || typeof result.payload !== "object")
        throw new InvalidPaymentHeaderError(`${PAYMENT_SIGNATURE_HEADER} has an invalid PaymentPayload object`);
    return result;
}
export function encodeSettlementResponse(value) {
    return encodeJson(value);
}
export function decodeSettlementResponse(value) {
    const result = decodeJson(value, PAYMENT_RESPONSE_HEADER);
    if (typeof result.success !== "boolean" || typeof result.transaction !== "string" || typeof result.network !== "string" || (!result.success && typeof result.errorReason !== "string"))
        throw new InvalidPaymentHeaderError(`${PAYMENT_RESPONSE_HEADER} has an invalid SettlementResponse object`);
    return result;
}
