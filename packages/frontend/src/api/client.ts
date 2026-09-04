export type ApiEventTransport = "sse" | "websocket" | "polling" | "none";

export interface ApiClientConfig {
  baseUrl?: string;
  eventTransport?: ApiEventTransport;
  eventPath?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

export interface VerifyRequest {
  paymentPayload?: unknown;
  paymentRequirements?: unknown;
  payload?: unknown;
  requirements?: unknown;
  payer?: string;
  intent?: {
    scenario: "legitimate" | "attack" | "negotiation";
    resource: string;
    amount: string;
  };
}

export interface VerifyResponse {
  isValid: boolean;
  payer?: string;
  amount?: string;
  invalidReason?: string;
  errorCode?: string;
  requestId?: string;
  correlationId?: string;
}

export interface SettleRequest extends VerifyRequest {
  idempotency_key: string;
}

export type SettlementMode = "live" | "mock" | "shadow" | "onchain";

export interface SettleResponse {
  success: boolean;
  transaction?: string;
  txHash?: string;
  explorerUrl?: string;
  network?: string;
  payer?: string;
  mode?: SettlementMode;
  simulated?: boolean;
  blockNumber?: number;
  receipt?: unknown;
  errorReason?: string;
  requestId?: string;
  correlationId?: string;
}

export interface HealthResponse {
  ok: boolean;
  mode?: string;
  version?: string;
  [key: string]: unknown;
}

export interface SentinelEvent {
  eventId?: string;
  sequence?: number;
  occurredAt?: string;
  correlationId?: string;
  mode?: string;
  type?: string;
  severity?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventSubscription {
  close: () => void;
}

export interface EventSubscriptionOptions {
  since?: number;
  correlationId?: string;
  onEvent: (event: SentinelEvent) => void;
  onState?: (state: "connecting" | "connected" | "offline") => void;
  onError?: (error: ApiError) => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly correlationId?: string;

  constructor(message: string, options: { status?: number; code?: string; requestId?: string; correlationId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "CLIENT_ERROR";
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
  }
}

const DEFAULT_BASE_URL = "/api/v1";
const DEFAULT_EVENT_TRANSPORT: ApiEventTransport = "sse";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCorrelationId(): string {
  return `corr-${createRequestId()}`;
}

export function createApiClient(config: ApiClientConfig = {}) {
  const baseUrl = trimTrailingSlash(config.baseUrl ?? DEFAULT_BASE_URL);
  const fetcher = config.fetcher ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const eventTransport = config.eventTransport ?? DEFAULT_EVENT_TRANSPORT;
  const eventPath = config.eventPath ?? "/events";
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  async function request<T>(path: string, init: RequestInit = {}, context: Partial<RequestContext> = {}): Promise<T> {
    const requestId = context.requestId ?? createRequestId();
    const correlationId = context.correlationId ?? createCorrelationId();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("x-request-id", requestId);
    headers.set("x-correlation-id", correlationId);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${baseUrl}${path}`, { ...init, headers, signal: init.signal ?? controller.signal });
      const body = await readJson(response);
      const responseRequestId = headerValue(response.headers, "x-request-id") ?? readString(body, "requestId") ?? requestId;
      const responseCorrelationId = headerValue(response.headers, "x-correlation-id") ?? readString(body, "correlationId") ?? correlationId;
      if (!response.ok) throw toApiError(response.status, body, responseRequestId, responseCorrelationId);
      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("服務請求逾時，請確認連線後重試。", { code: "TIMEOUT", requestId, correlationId });
      }
      throw new ApiError("無法連線至 IntentSentinel 服務。", { code: "NETWORK_ERROR", requestId, correlationId });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    baseUrl,
    eventTransport,
    health(context?: Partial<RequestContext>) {
      return request<HealthResponse>("/health", undefined, context);
    },
    verify(body: VerifyRequest, context?: Partial<RequestContext>) {
      return request<VerifyResponse>("/verify", { method: "POST", body: JSON.stringify(body) }, context);
    },
    settle(body: SettleRequest, context?: Partial<RequestContext>) {
      const requestContext = context ?? {};
      const headers = new Headers({ "idempotency-key": body.idempotency_key });
      return request<SettleResponse>("/settle", { method: "POST", headers, body: JSON.stringify(body) }, requestContext);
    },
    events(options: EventSubscriptionOptions): EventSubscription {
      const query = new URLSearchParams();
      if (options.since !== undefined) query.set("since", String(options.since));
      if (options.correlationId) query.set("correlationId", options.correlationId);
      const path = `${eventPath}?${query.toString()}`;
      options.onState?.("connecting");
      if (eventTransport === "none") {
        options.onState?.("offline");
        return { close: () => undefined };
      }
      if (eventTransport === "polling") return pollingEvents(path, options, request, pollIntervalMs);
      if (eventTransport === "websocket") return websocketEvents(path, options, baseUrl);
      if (typeof EventSource === "undefined") {
        const error = new ApiError("此瀏覽器不支援事件串流。", { code: "EVENTS_UNAVAILABLE", correlationId: options.correlationId });
        options.onError?.(error);
        options.onState?.("offline");
        return { close: () => undefined };
      }
      const source = new EventSource(`${baseUrl}${path}`);
      source.onopen = () => options.onState?.("connected");
      source.onmessage = (message) => {
        try { options.onEvent(parseEvent(JSON.parse(message.data))); } catch { /* malformed frames stay outside UI state */ }
      };
      source.onerror = () => {
        options.onState?.("offline");
        options.onError?.(new ApiError("事件串流已中斷。", { code: "EVENTS_DISCONNECTED", correlationId: options.correlationId }));
      };
      return { close: () => source.close() };
    },
  };
}

export function getRuntimeConfig(env: Record<string, string | undefined> = import.meta.env ?? {}): { baseUrl: string; eventTransport: ApiEventTransport; liveConfigured: boolean } {
  const baseUrl = env.VITE_API_BASE_URL ?? env.VITE_SENTINEL_HTTP_URL ?? DEFAULT_BASE_URL;
  const normalizedBase = env.VITE_SENTINEL_HTTP_URL && !env.VITE_API_BASE_URL ? `${trimTrailingSlash(baseUrl)}/api/v1` : trimTrailingSlash(baseUrl);
  const configuredTransport = env.VITE_EVENT_TRANSPORT;
  const eventTransport: ApiEventTransport = configuredTransport === "websocket" || configuredTransport === "polling" || configuredTransport === "none" ? configuredTransport : DEFAULT_EVENT_TRANSPORT;
  return { baseUrl: normalizedBase, eventTransport, liveConfigured: Boolean(env.VITE_API_BASE_URL || env.VITE_SENTINEL_HTTP_URL) };
}

function trimTrailingSlash(value: string): string { return value.replace(/\/+$/, "") || "/"; }

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: "服務回應格式無效。" }; }
}

function headerValue(headers: Headers, name: string): string | undefined { return headers.get(name) ?? undefined; }
function readString(value: unknown, key: string): string | undefined { return value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "string" ? (value as Record<string, string>)[key] : undefined; }

function toApiError(status: number, body: unknown, requestId: string, correlationId: string): ApiError {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof record.errorCode === "string" ? record.errorCode : typeof record.code === "string" ? record.code : `HTTP_${status}`;
  const message = firstString(record.errorReason, record.message, record.error, record.invalidReason) ?? `服務回應錯誤（HTTP ${status}）。`;
  return new ApiError(message.slice(0, 500), { status, code, requestId, correlationId });
}

function parseEvent(value: unknown): SentinelEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid event");
  return value as SentinelEvent;
}

function firstString(...values: unknown[]): string | undefined { return values.find((value): value is string => typeof value === "string" && value.trim().length > 0); }

function pollingEvents(path: string, options: EventSubscriptionOptions, request: <T>(path: string, init?: RequestInit, context?: Partial<RequestContext>) => Promise<T>, interval: number): EventSubscription {
  let closed = false;
  let since = options.since ?? 0;
  const poll = async () => {
    try {
      const response = await request<unknown>(path, undefined, { correlationId: options.correlationId });
      const events = Array.isArray(response) ? response : response && typeof response === "object" && Array.isArray((response as { events?: unknown[] }).events) ? (response as { events: unknown[] }).events : [];
      options.onState?.("connected");
      events.forEach((value) => { const event = parseEvent(value); if (typeof event.sequence === "number") since = Math.max(since, event.sequence); options.onEvent(event); });
    } catch (error) { options.onState?.("offline"); options.onError?.(error instanceof ApiError ? error : new ApiError("事件輪詢失敗。", { code: "EVENTS_ERROR" })); }
    if (!closed) timer = setTimeout(() => void poll(), interval);
  };
  let timer = setTimeout(() => void poll(), 0);
  return { close: () => { closed = true; clearTimeout(timer); } };
}

function websocketEvents(path: string, options: EventSubscriptionOptions, baseUrl: string): EventSubscription {
  if (typeof WebSocket === "undefined") {
    options.onState?.("offline");
    options.onError?.(new ApiError("此瀏覽器不支援 WebSocket 事件串流。", { code: "EVENTS_UNAVAILABLE" }));
    return { close: () => undefined };
  }
  const url = toWebSocketUrl(baseUrl, path);
  const socket = new WebSocket(url);
  socket.onopen = () => options.onState?.("connected");
  socket.onmessage = (message) => { try { options.onEvent(parseEvent(JSON.parse(String(message.data)))); } catch { /* malformed frames stay outside UI state */ } };
  socket.onerror = () => options.onError?.(new ApiError("事件串流已中斷。", { code: "EVENTS_DISCONNECTED" }));
  socket.onclose = () => options.onState?.("offline");
  return { close: () => socket.close() };
}

function toWebSocketUrl(baseUrl: string, path: string): string {
  if (/^wss?:\/\//i.test(baseUrl)) return baseUrl + path;
  if (/^https?:\/\//i.test(baseUrl)) return baseUrl.replace(/^http/i, "ws") + path;
  if (typeof location !== "undefined") return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${baseUrl}${path}`;
  return `ws://localhost${baseUrl}${path}`;
}
