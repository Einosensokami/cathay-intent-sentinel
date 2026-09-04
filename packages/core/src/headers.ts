import {
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type SettlementResponse,
} from "./types.js";

export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED" as const;
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE" as const;
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE" as const;

export class InvalidPaymentHeaderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentHeaderError";
  }
}

function decodeJson<T>(encoded: string, headerName: string): T {
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new InvalidPaymentHeaderError(`${headerName} is not valid standard Base64`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new InvalidPaymentHeaderError(`${headerName} does not contain valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InvalidPaymentHeaderError(`${headerName} must contain a JSON object`);
  }
  return parsed as T;
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function encodePaymentRequired(value: PaymentRequired): string {
  return encodeJson(value);
}

export function decodePaymentRequired(value: string): PaymentRequired {
  const result = decodeJson<PaymentRequired>(value, PAYMENT_REQUIRED_HEADER);
  if (result.x402Version !== X402_VERSION) {
    throw new InvalidPaymentHeaderError(`${PAYMENT_REQUIRED_HEADER} requires x402Version=2`);
  }
  return result;
}

export function encodePaymentPayload(value: PaymentPayload): string {
  return encodeJson(value);
}

export function decodePaymentPayload(value: string): PaymentPayload {
  const result = decodeJson<PaymentPayload>(value, PAYMENT_SIGNATURE_HEADER);
  if (result.x402Version !== X402_VERSION) {
    throw new InvalidPaymentHeaderError(`${PAYMENT_SIGNATURE_HEADER} requires x402Version=2`);
  }
  return result;
}

export function encodeSettlementResponse(value: SettlementResponse): string {
  return encodeJson(value);
}

export function decodeSettlementResponse(value: string): SettlementResponse {
  return decodeJson<SettlementResponse>(value, PAYMENT_RESPONSE_HEADER);
}
