import type { IncomingHttpHeaders } from "node:http";

export type Role = "agent" | "operator" | "auditor";
export type Operation = "verify" | "settle" | "events";
export type AdapterMode = "live" | "mock";

export interface Principal {
  subject: string;
  tenantId: string;
  roles: readonly Role[];
  claims?: Readonly<Record<string, unknown>>;
}

export interface AuthContext {
  principal: Principal;
  requestId: string;
  correlationId: string;
  ipAddress?: string;
}

export interface PaymentIntentInput {
  paymentIntentId: string;
  tenantId: string;
  taskId: string;
  resource: string;
  payee: string;
  maxAmount: string;
  asset: string;
  network: string;
  expiresAt: number;
}

export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Readonly<Record<string, unknown>>;
}

export interface X402PaymentPayload {
  x402Version: 2;
  resource?: string | { url: string; [key: string]: unknown };
  accepted: X402PaymentRequirements;
  payload: Readonly<Record<string, unknown>>;
  extensions?: Readonly<Record<string, unknown>>;
}

export interface X402RequestBody {
  x402Id: string;
  paymentIntent: PaymentIntentInput;
  paymentPayload: X402PaymentPayload;
  paymentRequirements: X402PaymentRequirements;
}

export interface VerifyRequestBody extends X402RequestBody {
  tenantId: string;
}

export interface SettleRequestBody extends X402RequestBody {
  tenantId: string;
}

export interface VerifyCommand {
  x402Id: string;
  paymentIntent: PaymentIntentInput;
  paymentPayload: X402PaymentPayload;
  paymentRequirements: X402PaymentRequirements;
  context: AuthContext;
}

export interface SettleCommand extends VerifyCommand {
  idempotencyKey: string;
}

export interface VerifyOutcome {
  isValid: boolean;
  mode: AdapterMode;
  simulated: boolean;
  payer?: string;
  amount?: string;
  reason?: string;
  nonce?: string;
}

export interface SettlementOutcome {
  status: "settled" | "rejected" | "unknown";
  mode: AdapterMode;
  simulated: boolean;
  /** Production adapter attestation; required before an explorer URL is emitted. */
  verifiedLive?: boolean;
  txHash?: string;
  explorerUrl?: string;
  payer?: string;
  amount?: string;
  reason?: string;
  nonce?: string;
}

export interface EventRecord {
  id: string;
  sequence: number;
  tenantId: string;
  type: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface EventsQuery {
  cursor?: string;
  limit: number;
}

export interface ApiAdapters {
  facilitator: FacilitatorAdapter;
  policy: PolicyAdapter;
  keyVault: KeyVaultAdapter;
  events: EventAdapter;
}

export interface FacilitatorAdapter {
  verify(command: VerifyCommand): Promise<VerifyOutcome>;
  settle(command: SettleCommand): Promise<SettlementOutcome>;
  ready?(): Promise<AdapterReadiness>;
}

export interface PolicyAdapter {
  authorize(operation: Operation, intent: PaymentIntentInput, context: AuthContext): Promise<PolicyDecision>;
  ready?(): Promise<AdapterReadiness>;
}

export interface KeyVaultAdapter {
  ready(): Promise<AdapterReadiness>;
}

export interface EventAdapter {
  list(tenantId: string, query: EventsQuery, context: AuthContext): Promise<{ events: readonly EventRecord[]; nextCursor?: string }>;
  ready?(): Promise<AdapterReadiness>;
}

export interface PolicyDecision {
  allowed: boolean;
  mode: AdapterMode;
  simulated: boolean;
  reason?: string;
}

export interface AdapterReadiness {
  ready: boolean;
  mode: AdapterMode;
  simulated: boolean;
  reason?: string;
}

export interface BearerTokenVerifier {
  verify(token: string): Promise<Principal | undefined>;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision>;
}

export interface IdempotencyRecord {
  requestHash: string;
  response: SettleApiResponse;
  createdAt: number;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | undefined>;
  set(key: string, record: IdempotencyRecord): Promise<void>;
}

export interface ReplayProtector {
  claim(tenantId: string, nonce: string): Promise<boolean>;
  release?(tenantId: string, nonce: string): Promise<void>;
}

export interface ApiOptions {
  auth?: BearerTokenVerifier;
  adapters?: Partial<ApiAdapters>;
  rateLimiter?: RateLimiter;
  idempotencyStore?: IdempotencyStore;
  replayProtector?: ReplayProtector;
  corsOrigins?: readonly string[];
  maxBodyBytes?: number;
  now?: () => number;
}

export interface ApiResponse<T> {
  ok: true;
  requestId: string;
  correlationId: string;
  data: T;
}

export interface VerifyApiResponse {
  paymentIntentId: string;
  x402Id: string;
  verification: VerifyOutcome;
}

export interface SettleApiResponse {
  paymentIntentId: string;
  x402Id: string;
  idempotent: boolean;
  settlement: SettlementOutcome;
}

export interface EventsApiResponse {
  tenantId: string;
  events: readonly EventRecord[];
  nextCursor?: string;
}

export interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    correlationId: string;
    details?: Readonly<Record<string, unknown>>;
  };
}

export interface RequestLike {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
}
