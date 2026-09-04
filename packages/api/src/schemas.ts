import { ApiError } from "./errors.js";
import type {
  PaymentIntentInput,
  SettleRequestBody,
  VerifyRequestBody,
  X402PaymentPayload,
  X402PaymentRequirements,
} from "./types.js";

const NON_NEGATIVE_DECIMAL = /^(0|[1-9]\d*)$/;
const NONCE = /^0x[0-9a-fA-F]{64}$/;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "invalid_request", `${path} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string, options: { max?: number; nonEmpty?: boolean } = {}): string {
  if (typeof value !== "string" || (options.nonEmpty !== false && value.trim() === "")) throw new ApiError(400, "invalid_request", `${path} must be a non-empty string`);
  if (options.max !== undefined && value.length > options.max) throw new ApiError(400, "invalid_request", `${path} is too long`);
  return value;
}

function identifier(value: unknown, path: string, prefix: "pi_" | "x402_"): string {
  const result = string(value, path);
  const pattern = prefix === "pi_" ? /^pi_[A-Za-z0-9_-]{8,127}$/ : /^x402_[A-Za-z0-9_-]{8,127}$/;
  if (!pattern.test(result)) throw new ApiError(400, "invalid_request", `${path} has an invalid stable identifier`);
  return result;
}

function amount(value: unknown, path: string): string {
  const result = string(value, path, { max: 78 });
  if (!NON_NEGATIVE_DECIMAL.test(result)) throw new ApiError(400, "invalid_request", `${path} must be a non-negative decimal atomic amount`);
  return result;
}

function unixSeconds(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new ApiError(400, "invalid_request", `${path} must be a positive Unix timestamp in seconds`);
  return value;
}

function paymentRequirements(value: unknown, path: string): X402PaymentRequirements {
  const input = object(value, path);
  const result: X402PaymentRequirements = {
    scheme: string(input.scheme, `${path}.scheme`, { max: 64 }),
    network: string(input.network, `${path}.network`, { max: 128 }),
    amount: amount(input.amount, `${path}.amount`),
    asset: string(input.asset, `${path}.asset`, { max: 256 }),
    payTo: string(input.payTo, `${path}.payTo`, { max: 256 }),
    maxTimeoutSeconds: unixSeconds(input.maxTimeoutSeconds, `${path}.maxTimeoutSeconds`),
  };
  if (input.extra !== undefined) result.extra = object(input.extra, `${path}.extra`);
  return result;
}

function paymentPayload(value: unknown, requirements: X402PaymentRequirements): X402PaymentPayload {
  const input = object(value, "paymentPayload");
  if (input.x402Version !== 2) throw new ApiError(400, "invalid_request", "paymentPayload.x402Version must be 2");
  const accepted = paymentRequirements(input.accepted, "paymentPayload.accepted");
  const payload = object(input.payload, "paymentPayload.payload");
  if (payload.authorization !== undefined) {
    const authorization = object(payload.authorization, "paymentPayload.payload.authorization");
    for (const field of ["from", "to", "value", "validAfter", "validBefore", "nonce"]) string(authorization[field], `paymentPayload.payload.authorization.${field}`, { max: 256 });
    if (!NONCE.test(authorization.nonce as string)) throw new ApiError(400, "invalid_request", "paymentPayload authorization nonce must be 32 bytes");
  }
  const result: X402PaymentPayload = { x402Version: 2, accepted, payload };
  if (input.resource !== undefined) {
    if (typeof input.resource === "string") result.resource = input.resource;
    else {
      const resource = object(input.resource, "paymentPayload.resource");
      result.resource = { ...resource, url: string(resource.url, "paymentPayload.resource.url", { max: 2048 }) };
    }
  }
  if (input.extensions !== undefined) result.extensions = object(input.extensions, "paymentPayload.extensions");
  // Ensure accepted is structurally equal to the explicit API requirement.
  if (accepted.scheme !== requirements.scheme || accepted.network !== requirements.network || accepted.amount !== requirements.amount || accepted.asset.toLowerCase() !== requirements.asset.toLowerCase() || accepted.payTo.toLowerCase() !== requirements.payTo.toLowerCase()) {
    throw new ApiError(400, "requirements_mismatch", "paymentPayload.accepted does not match paymentRequirements");
  }
  return result;
}

function intent(value: unknown): PaymentIntentInput {
  const input = object(value, "paymentIntent");
  return {
    paymentIntentId: identifier(input.paymentIntentId, "paymentIntent.paymentIntentId", "pi_"),
    tenantId: string(input.tenantId, "paymentIntent.tenantId", { max: 128 }),
    taskId: string(input.taskId, "paymentIntent.taskId", { max: 256 }),
    resource: string(input.resource, "paymentIntent.resource", { max: 2048 }),
    payee: string(input.payee, "paymentIntent.payee", { max: 256 }),
    maxAmount: amount(input.maxAmount, "paymentIntent.maxAmount"),
    asset: string(input.asset, "paymentIntent.asset", { max: 256 }),
    network: string(input.network, "paymentIntent.network", { max: 128 }),
    expiresAt: unixSeconds(input.expiresAt, "paymentIntent.expiresAt"),
  };
}

export function parseVerifyBody(value: unknown): VerifyRequestBody {
  const input = object(value, "body");
  const paymentRequirements = paymentRequirementsFrom(input.paymentRequirements);
  return {
    tenantId: string(input.tenantId, "tenantId", { max: 128 }),
    x402Id: identifier(input.x402Id, "x402Id", "x402_"),
    paymentIntent: intent(input.paymentIntent),
    paymentPayload: paymentPayload(input.paymentPayload, paymentRequirements),
    paymentRequirements,
  };
}

export function parseSettleBody(value: unknown): SettleRequestBody {
  return parseVerifyBody(value);
}

function paymentRequirementsFrom(value: unknown): X402PaymentRequirements {
  return paymentRequirements(value, "paymentRequirements");
}

export function extractNonce(body: VerifyRequestBody | SettleRequestBody): string {
  const authorization = body.paymentPayload.payload.authorization;
  if (!authorization || typeof authorization !== "object" || typeof (authorization as Record<string, unknown>).nonce !== "string" || !NONCE.test((authorization as Record<string, unknown>).nonce as string)) {
    throw new ApiError(400, "invalid_request", "an ERC-3009 authorization nonce is required");
  }
  return (authorization as Record<string, unknown>).nonce as string;
}
