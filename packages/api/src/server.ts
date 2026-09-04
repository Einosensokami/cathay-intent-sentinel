import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { ApiError, isApiError } from "./errors.js";
import {
  InMemoryIdempotencyStore,
  InMemoryRateLimiter,
  InMemoryReplayProtector,
  SafeMockEvents,
  SafeMockFacilitator,
  SafeMockKeyVault,
  SafeMockPolicy,
  createDevelopmentBearerTokenVerifier,
} from "./adapters.js";
import { extractNonce, parseSettleBody, parseVerifyBody } from "./schemas.js";
import type {
  AdapterReadiness,
  ApiAdapters,
  ApiOptions,
  ApiResponse,
  AuthContext,
  ErrorBody,
  EventsApiResponse,
  IdempotencyRecord,
  Operation,
  Principal,
  SettleApiResponse,
  SettleRequestBody,
  SettlementOutcome,
  VerifyApiResponse,
  VerifyOutcome,
} from "./types.js";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;
const CURSOR = /^[A-Za-z0-9._:-]{1,256}$/;
const LIVE_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ALLOWED_ROLES: Record<Operation, readonly string[]> = {
  verify: ["agent", "operator", "auditor"],
  settle: ["agent", "operator"],
  events: ["operator", "auditor"],
};

export interface ApiServer {
  server: Server;
  options: Required<Pick<ApiOptions, "maxBodyBytes">> & { corsOrigins: readonly string[] };
}

interface InternalOptions {
  auth: NonNullable<ApiOptions["auth"]>;
  adapters: ApiAdapters;
  rateLimiter: NonNullable<ApiOptions["rateLimiter"]>;
  idempotencyStore: NonNullable<ApiOptions["idempotencyStore"]>;
  replayProtector: NonNullable<ApiOptions["replayProtector"]>;
  corsOrigins: readonly string[];
  maxBodyBytes: number;
  now: () => number;
  settlementLocks: Map<string, Promise<void>>;
}

function optionsWithDefaults(options: ApiOptions = {}): InternalOptions {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 10 * 1024 * 1024) throw new ApiError(500, "invalid_configuration", "maxBodyBytes must be between 1 byte and 10 MiB");
  const defaults: ApiAdapters = {
    facilitator: new SafeMockFacilitator(),
    policy: new SafeMockPolicy(),
    keyVault: new SafeMockKeyVault(),
    events: new SafeMockEvents(),
  };
  return {
    auth: options.auth ?? createDevelopmentBearerTokenVerifier(),
    adapters: { ...defaults, ...options.adapters },
    rateLimiter: options.rateLimiter ?? new InMemoryRateLimiter(),
    idempotencyStore: options.idempotencyStore ?? new InMemoryIdempotencyStore(),
    replayProtector: options.replayProtector ?? new InMemoryReplayProtector(),
    corsOrigins: [...(options.corsOrigins ?? [])],
    maxBodyBytes,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    settlementLocks: new Map(),
  };
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function requestIdentifier(value: string | undefined): string {
  return value && REQUEST_ID.test(value) ? value : randomUUID();
}

function contextFor(request: IncomingMessage, requestId: string, correlationId: string, principal: Principal): AuthContext {
  return {
    principal,
    requestId,
    correlationId,
    ...(request.socket.remoteAddress ? { ipAddress: request.socket.remoteAddress } : {}),
  };
}

function setSecurityHeaders(response: ServerResponse, requestId: string, correlationId: string): void {
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-correlation-id", correlationId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  response.setHeader("cache-control", "no-store");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function errorBody(error: ApiError, requestId: string, correlationId: string): ErrorBody {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      requestId,
      correlationId,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

function fail(status: number, code: string, message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new ApiError(status, code, message, details);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function hashBody(body: SettleRequestBody): string {
  return createHash("sha256").update(canonical(body)).digest("hex");
}

function assertTenant(principal: Principal, tenantId: string, intentTenantId: string): void {
  if (!tenantId || tenantId !== principal.tenantId || intentTenantId !== principal.tenantId || intentTenantId !== tenantId) fail(403, "tenant_forbidden", "tenant boundary rejected the request");
}

function assertRole(principal: Principal, operation: Operation): void {
  if (!Array.isArray(principal.roles) || !principal.roles.some((role) => ALLOWED_ROLES[operation].includes(role))) fail(403, "forbidden", "principal is not authorized for this operation");
}

function assertIntentBindings(body: SettleRequestBody | ReturnType<typeof parseVerifyBody>, now: number): void {
  const { paymentIntent: intent, paymentRequirements: requirements } = body;
  if (intent.expiresAt <= now) fail(400, "payment_intent_expired", "payment intent is expired");
  if (intent.asset.toLowerCase() !== requirements.asset.toLowerCase() || intent.network !== requirements.network || intent.payee.toLowerCase() !== requirements.payTo.toLowerCase()) fail(400, "requirements_mismatch", "payment intent does not match payment requirements");
  try {
    if (BigInt(requirements.amount) > BigInt(intent.maxAmount)) fail(400, "requirements_mismatch", "payment amount exceeds payment intent maxAmount");
  } catch {
    fail(400, "invalid_request", "payment amount is invalid");
  }
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const contentLength = header(request.headers["content-length"]);
  if (contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) fail(413, "body_too_large", "request body exceeds the configured limit");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) fail(413, "body_too_large", "request body exceeds the configured limit");
    chunks.push(buffer);
  }
  if (bytes === 0) fail(400, "invalid_json", "request body is required");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "invalid_json", "request body must be valid JSON");
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse, origins: readonly string[]): void {
  const origin = header(request.headers.origin);
  if (!origin) return;
  if (!origins.includes(origin)) fail(403, "cors_origin_denied", "request origin is not allowlisted");
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "Authorization, Content-Type, Idempotency-Key, X-Request-Id, X-Correlation-Id");
  response.setHeader("access-control-max-age", "600");
}

async function authenticate(request: IncomingMessage, context: Omit<AuthContext, "principal">, auth: InternalOptions["auth"]): Promise<AuthContext> {
  const value = header(request.headers.authorization);
  if (!value || !/^Bearer\s+\S+$/.test(value)) fail(401, "unauthenticated", "a bearer token is required");
  const token = value.slice(value.indexOf(" ") + 1);
  const principal = await auth.verify(token);
  if (!principal || !principal.subject || !principal.tenantId || !Array.isArray(principal.roles)) fail(401, "unauthenticated", "bearer token was not accepted");
  return contextFor(request, context.requestId, context.correlationId, principal);
}

async function readiness(adapters: ApiAdapters): Promise<{ ready: boolean; components: Readonly<Record<string, AdapterReadiness>> }> {
  const entries = await Promise.all((Object.entries(adapters) as Array<[keyof ApiAdapters, ApiAdapters[keyof ApiAdapters]]>).map(async ([name, adapter]) => {
    try {
      const value = adapter.ready ? await adapter.ready() : { ready: true, mode: "live" as const, simulated: false };
      return [name, value] as const;
    } catch (error) {
      return [name, { ready: false, mode: "live" as const, simulated: false, reason: error instanceof Error ? error.message : "adapter readiness failed" }] as const;
    }
  }));
  const components = Object.fromEntries(entries) as Readonly<Record<string, AdapterReadiness>>;
  return { ready: Object.values(components).every((component) => component.ready), components };
}

function settlementForWire(outcome: SettlementOutcome): SettlementOutcome {
  const result: SettlementOutcome = { ...outcome };
  delete result.explorerUrl;
  if (outcome.verifiedLive === true && outcome.mode === "live" && outcome.simulated === false && outcome.txHash && LIVE_TX_HASH.test(outcome.txHash) && outcome.explorerUrl && validExplorerUrl(outcome.explorerUrl, outcome.txHash)) result.explorerUrl = outcome.explorerUrl;
  return result;
}

function verifiedOutcome(value: unknown): VerifyOutcome {
  if (!value || typeof value !== "object") fail(502, "invalid_adapter_response", "facilitator returned an invalid verification response");
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.isValid !== "boolean" || (candidate.mode !== "live" && candidate.mode !== "mock") || typeof candidate.simulated !== "boolean") fail(502, "invalid_adapter_response", "facilitator returned an invalid verification response");
  return value as VerifyOutcome;
}

function verifiedSettlement(value: unknown): SettlementOutcome {
  if (!value || typeof value !== "object") fail(502, "invalid_adapter_response", "facilitator returned an invalid settlement response");
  const candidate = value as Record<string, unknown>;
  if ((candidate.status !== "settled" && candidate.status !== "rejected" && candidate.status !== "unknown") || (candidate.mode !== "live" && candidate.mode !== "mock") || typeof candidate.simulated !== "boolean") fail(502, "invalid_adapter_response", "facilitator returned an invalid settlement response");
  if (candidate.verifiedLive !== undefined && typeof candidate.verifiedLive !== "boolean") fail(502, "invalid_adapter_response", "facilitator returned an invalid live attestation");
  if (candidate.txHash !== undefined && (typeof candidate.txHash !== "string" || candidate.txHash.length > 256)) fail(502, "invalid_adapter_response", "facilitator returned an invalid transaction identifier");
  if (candidate.explorerUrl !== undefined && (typeof candidate.explorerUrl !== "string" || candidate.explorerUrl.length > 2048)) fail(502, "invalid_adapter_response", "facilitator returned an invalid explorer URL");
  return settlementForWire(value as SettlementOutcome);
}

function validExplorerUrl(value: string, txHash: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const trustedExplorer = hostname === "basescan.org" || hostname.endsWith(".basescan.org");
    return trustedExplorer && url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "" && url.pathname === `/tx/${txHash}`;
  } catch {
    return false;
  }
}

function success<T>(requestId: string, correlationId: string, data: T): ApiResponse<T> {
  return { ok: true, requestId, correlationId, data };
}

async function verifyRoute(request: IncomingMessage, context: AuthContext, options: InternalOptions): Promise<{ status: number; body: ApiResponse<VerifyApiResponse> }> {
  assertRole(context.principal, "verify");
  const parsed = parseVerifyBody(await readJson(request, options.maxBodyBytes));
  assertTenant(context.principal, parsed.tenantId, parsed.paymentIntent.tenantId);
  assertIntentBindings(parsed, options.now());
  const policy = await options.adapters.policy.authorize("verify", parsed.paymentIntent, context);
  if (!policy.allowed) fail(403, "policy_denied", policy.reason ?? "policy denied verification");
  const verification = verifiedOutcome(await options.adapters.facilitator.verify({ ...parsed, context }));
  return { status: verification.isValid ? 200 : 422, body: success(context.requestId, context.correlationId, { paymentIntentId: parsed.paymentIntent.paymentIntentId, x402Id: parsed.x402Id, verification }) };
}

async function withSettlementLock<T>(options: InternalOptions, key: string, operation: () => Promise<T>): Promise<T> {
  const previous = options.settlementLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  options.settlementLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (options.settlementLocks.get(key) === current) options.settlementLocks.delete(key);
  }
}

async function settleRoute(request: IncomingMessage, context: AuthContext, options: InternalOptions): Promise<{ status: number; body: ApiResponse<SettleApiResponse>; replayed: boolean }> {
  assertRole(context.principal, "settle");
  const key = header(request.headers["idempotency-key"]);
  if (!key || !IDEMPOTENCY_KEY.test(key)) fail(400, "idempotency_key_required", "a valid Idempotency-Key header is required");
  const parsed = parseSettleBody(await readJson(request, options.maxBodyBytes));
  assertTenant(context.principal, parsed.tenantId, parsed.paymentIntent.tenantId);
  const scopedKey = `${context.principal.tenantId}:${context.principal.subject}:${key}`;
  const requestHash = hashBody(parsed);
  return withSettlementLock(options, scopedKey, async () => {
    const existing = await options.idempotencyStore.get(scopedKey);
    if (existing) {
      if (existing.requestHash !== requestHash) fail(409, "idempotency_conflict", "Idempotency-Key was reused for a different request");
      return { status: existing.response.settlement.status === "unknown" ? 202 : existing.response.settlement.status === "settled" ? 200 : 409, replayed: true, body: success(context.requestId, context.correlationId, { ...existing.response, idempotent: true }) };
    }
    assertIntentBindings(parsed, options.now());
    const policy = await options.adapters.policy.authorize("settle", parsed.paymentIntent, context);
    if (!policy.allowed) fail(403, "policy_denied", policy.reason ?? "policy denied settlement");
    const vault = await options.adapters.keyVault.ready();
    if (!vault.ready) fail(503, "key_vault_unavailable", vault.reason ?? "key vault is not ready");
    const nonce = extractNonce(parsed);
    const claimed = await options.replayProtector.claim(context.principal.tenantId, nonce);
    if (!claimed) fail(409, "replay_detected", "payment authorization nonce has already been claimed");
    let outcome;
    try {
      outcome = verifiedSettlement(await options.adapters.facilitator.settle({ ...parsed, context, idempotencyKey: key }));
    } catch (error) {
      // Retain the claim on an adapter exception: the external outcome may be unknown.
      throw new ApiError(502, "settlement_adapter_error", error instanceof Error ? error.message : "settlement adapter failed");
    }
    if (outcome.status === "rejected") await options.replayProtector.release?.(context.principal.tenantId, nonce);
    const data: SettleApiResponse = { paymentIntentId: parsed.paymentIntent.paymentIntentId, x402Id: parsed.x402Id, idempotent: false, settlement: outcome };
    await options.idempotencyStore.set(scopedKey, { requestHash, response: data, createdAt: options.now() });
    return { status: outcome.status === "unknown" ? 202 : outcome.status === "settled" ? 200 : 409, replayed: false, body: success(context.requestId, context.correlationId, data) };
  });
}

async function eventsRoute(request: IncomingMessage, context: AuthContext, options: InternalOptions, url: URL): Promise<{ status: number; body: ApiResponse<EventsApiResponse> }> {
  assertRole(context.principal, "events");
  const requestedTenant = url.searchParams.get("tenantId");
  if (requestedTenant && requestedTenant !== context.principal.tenantId) fail(403, "tenant_forbidden", "tenant boundary rejected the request");
  const rawLimit = url.searchParams.get("limit") ?? "50";
  if (!/^\d+$/.test(rawLimit)) fail(400, "invalid_query", "limit must be an integer");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, "invalid_query", "limit must be between 1 and 100");
  const rawCursor = url.searchParams.get("cursor") ?? undefined;
  if (rawCursor !== undefined && !CURSOR.test(rawCursor)) fail(400, "invalid_query", "cursor is invalid");
  const result = await options.adapters.events.list(context.principal.tenantId, { limit, ...(rawCursor ? { cursor: rawCursor } : {}) }, context);
  if (!result || !Array.isArray(result.events) || (result.nextCursor !== undefined && (typeof result.nextCursor !== "string" || !CURSOR.test(result.nextCursor)))) fail(502, "invalid_adapter_response", "event adapter returned an invalid response");
  if (result.events.some((event) => !event || typeof event !== "object" || event.tenantId !== context.principal.tenantId)) fail(502, "invalid_adapter_response", "event adapter returned a cross-tenant event");
  return { status: 200, body: success(context.requestId, context.correlationId, { tenantId: context.principal.tenantId, events: result.events, ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) }) };
}

async function handleApiRequestWithOptions(request: IncomingMessage, response: ServerResponse, options: InternalOptions): Promise<void> {
  const requestId = requestIdentifier(header(request.headers["x-request-id"]));
  const correlationId = requestIdentifier(header(request.headers["x-correlation-id"]) ?? requestId);
  setSecurityHeaders(response, requestId, correlationId);
  try {
    applyCors(request, response, options.corsOrigins);
    const url = new URL(request.url ?? "/", "http://intent-sentinel.invalid");
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      json(response, 200, { ok: true, service: "intent-sentinel-api", version: "v1" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/readyz") {
      const result = await readiness(options.adapters);
      json(response, result.ready ? 200 : 503, { ok: result.ready, service: "intent-sentinel-api", mode: Object.values(result.components).some((component) => component.mode === "live") ? "live" : "mock", components: result.components });
      return;
    }
    const route = request.method === "POST" && (url.pathname === "/api/v1/verify" || url.pathname === "/api/v1/settle")
      ? url.pathname.slice("/api/v1/".length)
      : request.method === "GET" && url.pathname === "/api/v1/events" ? "events" : undefined;
    if (!route) fail(404, "not_found", "route not found");
    const rateKey = request.socket.remoteAddress ?? "unknown-client";
    const rate = await options.rateLimiter.check(rateKey);
    if (!rate.allowed) {
      if (rate.retryAfterSeconds !== undefined) response.setHeader("retry-after", String(rate.retryAfterSeconds));
      fail(429, "rate_limited", "request rate limit exceeded");
    }
    const context = await authenticate(request, { requestId, correlationId }, options.auth);
    if (route === "verify" || route === "settle") {
      const contentType = header(request.headers["content-type"]);
      if (!contentType || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") fail(415, "unsupported_media_type", "protected command bodies must use application/json");
    }
    let result: { status: number; body: ApiResponse<unknown>; replayed?: boolean };
    if (route === "verify") result = await verifyRoute(request, context, options);
    else if (route === "settle") result = await settleRoute(request, context, options);
    else result = await eventsRoute(request, context, options, url);
    if (result.replayed) response.setHeader("idempotency-replayed", "true");
    json(response, result.status, result.body);
  } catch (error) {
    const apiError = isApiError(error) ? error : new ApiError(500, "internal_error", "request failed");
    if (apiError.status >= 500) response.setHeader("x-error-boundary", "fail-closed");
    if (!response.writableEnded) json(response, apiError.status, errorBody(apiError, requestId, correlationId));
  }
}

export async function handleApiRequest(request: IncomingMessage, response: ServerResponse, suppliedOptions: ApiOptions = {}): Promise<void> {
  return handleApiRequestWithOptions(request, response, optionsWithDefaults(suppliedOptions));
}

export function createApiServer(options: ApiOptions = {}): Server {
  const configured = optionsWithDefaults(options);
  return createServer((request, response) => {
    void handleApiRequestWithOptions(request, response, configured).catch(() => {
      if (!response.writableEnded) response.destroy();
    });
  });
}

export function createApi(options: ApiOptions = {}): ApiServer {
  return { server: createApiServer(options), options: { maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES, corsOrigins: [...(options.corsOrigins ?? [])] } };
}
