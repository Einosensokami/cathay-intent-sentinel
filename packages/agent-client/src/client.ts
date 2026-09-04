/**
 * x402 v2 agent-side client.
 *
 * The client deliberately has no private-key implementation.  A PaymentSigner
 * is an injected, scoped capability (normally backed by the key-vault package),
 * which means a prompt or a resource server can never ask this package to sign
 * an arbitrary transaction directly.
 */

export type PaymentScheme = "exact" | "upto" | "batch";

export interface PaymentRequirements {
  scheme: PaymentScheme | string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  resource?: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequired {
  x402Version: 2;
  resource: string;
  accepts: PaymentRequirements[];
  error?: string;
}

export interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

/** The encoded PAYMENT-SIGNATURE payload (x402 v2). */
export interface PaymentSignature {
  version: 2;
  resource: string;
  accepted: PaymentRequirements;
  authorization: TransferAuthorization;
  signature: string;
  extensions?: Record<string, unknown>;
}

export interface SignedPayment {
  authorization: TransferAuthorization;
  signature: string;
  extensions?: Record<string, unknown>;
}

export interface PaymentIntent {
  intentId: string;
  taskId: string;
  resource: string;
  payTo: string;
  amount: string;
  maxAmount: string;
  asset: string;
  network: string;
  scheme: PaymentScheme | string;
  expiresAt: number;
  nonce: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface RequestContext {
  taskId?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  allowed: boolean;
  reasons?: string[];
  policyId?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyGate {
  evaluate(
    intent: PaymentIntent,
    requirement: PaymentRequirements,
    context: RequestContext,
  ): Promise<PolicyDecision> | PolicyDecision;
}

export interface PaymentSigner {
  sign(
    intent: PaymentIntent,
    requirement: PaymentRequirements,
    context: RequestContext,
  ): Promise<SignedPayment>;
}

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface AgentClientOptions {
  fetch?: FetchLike;
  policyGate: PolicyGate;
  signer: PaymentSigner;
  bindIntent?: (
    requirement: PaymentRequirements,
    request: Request,
    context: RequestContext,
  ) => PaymentIntent | Promise<PaymentIntent>;
  clock?: () => number;
  maxRetries?: number;
  onEvent?: (event: ClientEvent) => void;
}

export type ClientEvent =
  | { type: "request"; url: string }
  | { type: "challenge"; url: string; requirement: PaymentRequirements }
  | { type: "intent-bound"; intent: PaymentIntent }
  | { type: "policy"; decision: PolicyDecision; intent: PaymentIntent }
  | { type: "signed"; intentId: string }
  | { type: "complete"; status: number; url: string };

export class PaymentClientError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "PaymentClientError";
    this.code = code;
    this.details = details;
  }
}

export class PaymentPolicyError extends PaymentClientError {
  readonly decision: PolicyDecision;

  constructor(decision: PolicyDecision, intent: PaymentIntent) {
    super("POLICY_DENIED", "Payment blocked by the IntentSentinel policy gate", {
      reasons: decision.reasons ?? [],
      intent,
    });
    this.name = "PaymentPolicyError";
    this.decision = decision;
  }
}

export class PaymentProtocolError extends PaymentClientError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super("INVALID_PAYMENT_PROTOCOL", message, details);
    this.name = "PaymentProtocolError";
  }
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function randomNonce(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `0x${randomId("nonce").replace(/[^a-z0-9]/gi, "").padEnd(32, "0").slice(0, 32)}`;
}

function encodeHeader(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeHeader<T>(header: string): T {
  try {
    const normalized = header.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    try {
      return JSON.parse(header) as T;
    } catch {
      throw new PaymentProtocolError("Payment header is not valid base64 JSON");
    }
  }
}

export function encodePaymentHeader(value: unknown): string {
  return encodeHeader(value);
}

export function readPaymentRequired(response: Response): PaymentRequired {
  const encoded = response.headers.get("PAYMENT-REQUIRED");
  if (!encoded) throw new PaymentProtocolError("402 response has no PAYMENT-REQUIRED header");
  const challenge = decodeHeader<Partial<PaymentRequired>>(encoded);
  if (challenge.x402Version !== 2 || typeof challenge.resource !== "string" || !Array.isArray(challenge.accepts)) {
    throw new PaymentProtocolError("PAYMENT-REQUIRED is not a valid x402 v2 challenge");
  }
  if (challenge.accepts.length === 0) {
    throw new PaymentProtocolError("PAYMENT-REQUIRED contains no payment options");
  }
  return challenge as PaymentRequired;
}

function amountAsBigInt(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new PaymentProtocolError("Payment amount must be an integer string", { value });
  return BigInt(value);
}

function defaultBindIntent(
  requirement: PaymentRequirements,
  request: Request,
  context: RequestContext,
  now: number,
): PaymentIntent {
  const amount = amountAsBigInt(requirement.amount).toString();
  const expiresAt = now + Math.max(1, requirement.maxTimeoutSeconds ?? 300) * 1000;
  const intent: PaymentIntent = {
    intentId: randomId("intent"),
    taskId: context.taskId ?? randomId("task"),
    resource: requirement.resource ?? request.url,
    payTo: requirement.payTo,
    amount,
    maxAmount: amount,
    asset: requirement.asset,
    network: requirement.network,
    scheme: requirement.scheme,
    expiresAt,
    nonce: randomNonce(),
    createdAt: now,
    ...(context.metadata ? { metadata: context.metadata } : {}),
  };
  return intent;
}

function selectRequirement(challenge: PaymentRequired): PaymentRequirements {
  const option = challenge.accepts.find((candidate) =>
    typeof candidate.amount === "string" &&
    typeof candidate.payTo === "string" &&
    typeof candidate.asset === "string" &&
    typeof candidate.network === "string",
  );
  if (!option) throw new PaymentProtocolError("402 challenge has no usable payment option");
  amountAsBigInt(option.amount);
  return option;
}

function signedToPayload(
  signed: SignedPayment,
  intent: PaymentIntent,
  requirement: PaymentRequirements,
  resource: string,
): PaymentSignature {
  if (!signed || typeof signed.signature !== "string" || !signed.signature) {
    throw new PaymentProtocolError("Signer returned no signature");
  }
  const authorization = signed.authorization;
  if (!authorization || typeof authorization.to !== "string" || typeof authorization.value !== "string") {
    throw new PaymentProtocolError("Signer returned an incomplete authorization");
  }
  if (authorization.to.toLowerCase() !== intent.payTo.toLowerCase()) {
    throw new PaymentProtocolError("Signer authorization payee differs from the approved intent");
  }
  const signedValue = amountAsBigInt(authorization.value);
  const cap = amountAsBigInt(intent.maxAmount);
  if (signedValue <= 0n || signedValue > cap) {
    throw new PaymentProtocolError("Signer authorization exceeds the approved intent", {
      value: authorization.value,
      maxAmount: intent.maxAmount,
    });
  }
  return {
    version: 2,
    resource,
    accepted: requirement,
    authorization,
    signature: signed.signature,
    extensions: {
      ...(signed.extensions ?? {}),
      intentId: intent.intentId,
      taskId: intent.taskId,
    },
  };
}

/** Implements the single controlled retry permitted by x402. */
export class ControlledRetryClient {
  private readonly fetcher: FetchLike;
  private readonly clock: () => number;
  private readonly maxRetries: number;

  constructor(private readonly options: AgentClientOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.clock = options.clock ?? (() => Date.now());
    this.maxRetries = options.maxRetries ?? 1;
    if (!options.policyGate) throw new TypeError("A policyGate is required (fail closed)");
    if (!options.signer) throw new TypeError("A signer is required");
    if (this.maxRetries !== 1) throw new TypeError("ControlledRetryClient permits exactly one payment retry");
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit, context: RequestContext = {}): Promise<Response> {
    const request = new Request(input, init);
    const retryRequest = request.clone();
    this.emit({ type: "request", url: request.url });
    const firstResponse = await this.fetcher(request);
    if (firstResponse.status !== 402) {
      this.emit({ type: "complete", status: firstResponse.status, url: request.url });
      return firstResponse;
    }
    if (this.maxRetries < 1) throw new PaymentClientError("RETRY_DISABLED", "Payment retry is disabled");

    const challenge = readPaymentRequired(firstResponse);
    const requirement = selectRequirement(challenge);
    this.emit({ type: "challenge", url: request.url, requirement });
    const now = this.clock();
    const intent = await (this.options.bindIntent?.(requirement, request, context) ??
      defaultBindIntent(requirement, request, context, now));
    if (intent.expiresAt <= now) throw new PaymentProtocolError("Bound payment intent is already expired");
    this.emit({ type: "intent-bound", intent });

    const decision = await this.options.policyGate.evaluate(intent, requirement, context);
    this.emit({ type: "policy", decision, intent });
    if (!decision.allowed) throw new PaymentPolicyError(decision, intent);

    const signed = await this.options.signer.sign(intent, requirement, context);
    const payment = signedToPayload(signed, intent, requirement, challenge.resource || request.url);
    this.emit({ type: "signed", intentId: intent.intentId });

    const headers = new Headers(retryRequest.headers);
    headers.set("PAYMENT-SIGNATURE", encodeHeader(payment));
    const paidRequest = new Request(retryRequest, { headers });
    const finalResponse = await this.fetcher(paidRequest);
    this.emit({ type: "complete", status: finalResponse.status, url: request.url });
    if (finalResponse.status === 402) {
      throw new PaymentClientError("PAYMENT_RETRY_REJECTED", "Resource server rejected the controlled payment retry", {
        status: finalResponse.status,
      });
    }
    return finalResponse;
  }

  private emit(event: ClientEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {
      // Observability must never change the payment decision.
    }
  }
}

export function createPaymentIntent(
  requirement: PaymentRequirements,
  request: Request,
  context: RequestContext = {},
): PaymentIntent {
  return defaultBindIntent(requirement, request, context, Date.now());
}
