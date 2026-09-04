import {
  decodeHeader,
  encodePaymentHeader,
  PaymentProtocolError,
  resourceUrl,
  type FetchLike,
  type PaymentRequired,
  type PaymentRequirements,
  type PaymentSignature,
  type PolicyDecision,
} from "./client.js";

export interface SettlementResult {
  success: boolean;
  txHash?: string;
  status?: string;
  receipt?: Record<string, unknown>;
  errorReason?: string;
  [key: string]: unknown;
}

export interface FacilitatorClient {
  settle(input: {
    paymentSignature: PaymentSignature;
    paymentRequired: PaymentRequired;
    request: Request;
  }): Promise<SettlementResult>;
}

export interface ResourcePolicyContext {
  request: Request;
  payment: PaymentSignature;
  requirement: PaymentRequirements;
}

export interface ResourceServerOptions {
  /** A static quote or a function for usage-dependent quotes. */
  paymentRequired:
    | PaymentRequired
    | ((request: Request) => PaymentRequired | Promise<PaymentRequired>);
  handler: (request: Request, payment?: PaymentSignature) => Response | Promise<Response>;
  facilitator: FacilitatorClient | string;
  fetch?: FetchLike;
  /** Optional local verification before settlement (for example facilitator /verify). */
  verifyPayment?: (
    input: ResourcePolicyContext,
  ) => boolean | Promise<boolean>;
  /** Optional resource-side policy gate. Denials are always fail-closed. */
  policyGate?: (
    input: ResourcePolicyContext,
  ) => PolicyDecision | boolean | Promise<PolicyDecision | boolean>;
  clock?: () => number;
}

export type ResourceServerMiddleware = (request: Request) => Promise<Response>;

function amount(value: string): bigint | undefined {
  return /^\d+$/.test(value) ? BigInt(value) : undefined;
}

function paymentPayloadFromHeader(encoded: string): PaymentSignature {
  const raw = decodeHeader<Partial<PaymentSignature> & {
    x402Version?: number;
    payload?: { authorization?: PaymentSignature["authorization"]; signature?: string };
  }>(encoded);
  const nested = raw.payload;
  const payment = {
    ...raw,
    version: raw.version ?? raw.x402Version,
    authorization: raw.authorization ?? nested?.authorization,
    signature: raw.signature ?? nested?.signature,
  } as Partial<PaymentSignature>;
  if (
    payment.version !== 2 ||
    !payment.resource ||
    (typeof payment.resource !== "string" && typeof payment.resource.url !== "string") ||
    !payment.accepted ||
    typeof payment.signature !== "string" ||
    !payment.authorization
  ) {
    throw new PaymentProtocolError("PAYMENT-SIGNATURE is not a valid x402 v2 payload");
  }
  return payment as PaymentSignature;
}

function invalidPayment(message: string): Response {
  return new Response(JSON.stringify({ error: "invalid_payment", message }), {
    status: 402,
    headers: { "content-type": "application/json" },
  });
}

function quoteResponse(quote: PaymentRequired): Response {
  return new Response(JSON.stringify({
    error: "payment_required",
    message: "A valid x402 payment is required",
    resource: quote.resource,
    accepts: quote.accepts,
  }), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": encodePaymentHeader(quote),
    },
  });
}

function normalizeSettlementResponse(response: Response): Promise<SettlementResult> {
  return response.text().then((text) => {
    let body: unknown = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      return { success: false, errorReason: `facilitator returned HTTP ${response.status}`, body };
    }
    if (!body || typeof body !== "object") {
      return { success: false, errorReason: "facilitator returned a non-object response" };
    }
    return body as SettlementResult;
  });
}

async function settleWithFacilitator(
  facilitator: FacilitatorClient | string,
  input: { paymentSignature: PaymentSignature; paymentRequired: PaymentRequired; request: Request },
  fetcher: FetchLike,
): Promise<SettlementResult> {
  if (typeof facilitator !== "string") return facilitator.settle(input);
  const endpoint = `${facilitator.replace(/\/$/, "")}/settle`;
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": input.paymentSignature.authorization.nonce },
    body: JSON.stringify({
      paymentSignature: input.paymentSignature,
      paymentRequired: input.paymentRequired,
      resource: input.request.url,
      idempotencyKey: input.paymentSignature.authorization.nonce,
    }),
  });
  return normalizeSettlementResponse(response);
}

function validatePayment(
  payment: PaymentSignature,
  quote: PaymentRequired,
  request: Request,
  now: number,
): string | undefined {
  if (resourceUrl(payment.resource) !== resourceUrl(quote.resource) && resourceUrl(payment.resource) !== request.url) return "resource mismatch";
  const requirement = quote.accepts.find((candidate) =>
    candidate.scheme === payment.accepted.scheme &&
    candidate.network === payment.accepted.network &&
    candidate.asset === payment.accepted.asset &&
    candidate.payTo.toLowerCase() === payment.accepted.payTo.toLowerCase(),
  );
  if (!requirement) return "accepted payment option is not in the quote";
  if (payment.accepted.amount !== requirement.amount) return "accepted amount differs from the quote";
  const authorization = payment.authorization;
  if (!authorization.from || !authorization.to || !authorization.nonce || !payment.signature) {
    return "authorization is incomplete";
  }
  if (authorization.to.toLowerCase() !== requirement.payTo.toLowerCase()) return "payee mismatch";
  const value = amount(authorization.value);
  const quoted = amount(requirement.amount);
  if (value === undefined || quoted === undefined || value <= 0n) return "invalid authorization amount";
  if (requirement.scheme === "exact" && value !== quoted) return "exact payment amount mismatch";
  if (value > quoted) return "payment exceeds quoted cap";
  const before = Number(authorization.validBefore);
  const after = Number(authorization.validAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before * 1000 <= now || after * 1000 > now) {
    return "authorization is outside its validity window";
  }
  if (payment.signature.length < 2) return "empty signature";
  return undefined;
}

/**
 * Fetch-style resource-server middleware. It quotes first, verifies the
 * structured payload, settles exactly once per request, then invokes the
 * protected handler. Invalid or failed payments never reach the handler.
 */
export function createResourceServerMiddleware(options: ResourceServerOptions): ResourceServerMiddleware {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const clock = options.clock ?? (() => Date.now());
  return async (request: Request): Promise<Response> => {
    const quote = typeof options.paymentRequired === "function"
      ? await options.paymentRequired(request)
      : options.paymentRequired;
    if (quote.x402Version !== 2 || !quote.resource || !quote.accepts.length) {
      throw new TypeError("paymentRequired must be a non-empty x402 v2 quote");
    }
    const encoded = request.headers.get("PAYMENT-SIGNATURE");
    if (!encoded) return quoteResponse(quote);

    let payment: PaymentSignature;
    try {
      payment = paymentPayloadFromHeader(encoded);
    } catch (error) {
      return invalidPayment(error instanceof Error ? error.message : "malformed payment");
    }
    const validationError = validatePayment(payment, quote, request, clock());
    if (validationError) return invalidPayment(validationError);
    const context = { request, payment, requirement: payment.accepted };
    if (options.verifyPayment && !(await options.verifyPayment(context))) {
      return invalidPayment("facilitator verification rejected the payment");
    }
    if (options.policyGate) {
      const result = await options.policyGate(context);
      const allowed = typeof result === "boolean" ? result : result.allowed;
      if (!allowed) return invalidPayment("resource policy rejected the payment");
    }

    const settlement = await settleWithFacilitator(options.facilitator, {
      paymentSignature: payment,
      paymentRequired: quote,
      request,
    }, fetcher);
    if (!settlement.success) {
      return new Response(JSON.stringify({ error: "settlement_failed", message: settlement.errorReason ?? "Payment settlement failed" }), {
        status: 402,
        headers: { "content-type": "application/json", "PAYMENT-REQUIRED": encodePaymentHeader(quote) },
      });
    }

    const response = await options.handler(request, payment);
    const paymentResponse = {
      x402Version: 2,
      status: settlement.status ?? "settled",
      txHash: settlement.txHash,
      receipt: settlement.receipt,
      timestamp: new Date(clock()).toISOString(),
    };
    response.headers.set("PAYMENT-RESPONSE", encodePaymentHeader(paymentResponse));
    return response;
  };
}

export const paymentMiddleware = createResourceServerMiddleware;

export function createInMemoryFacilitator(
  txPrefix = "0xintent_sentinel_demo",
): FacilitatorClient & { settlements: PaymentSignature[] } {
  const settlements: PaymentSignature[] = [];
  return {
    settlements,
    async settle({ paymentSignature }): Promise<SettlementResult> {
      settlements.push(paymentSignature);
      return {
        success: true,
        status: "settled",
        txHash: `${txPrefix}_${settlements.length.toString(16).padStart(8, "0")}`,
        receipt: { scheme: paymentSignature.accepted.scheme, amount: paymentSignature.authorization.value },
      };
    },
  };
}
