import { randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AdapterReadiness,
  ApiAdapters,
  AuthContext,
  BearerTokenVerifier,
  EventAdapter,
  EventRecord,
  FacilitatorAdapter,
  IdempotencyRecord,
  IdempotencyStore,
  KeyVaultAdapter,
  PaymentIntentInput,
  PolicyAdapter,
  PolicyDecision,
  Principal,
  ReplayProtector,
  RateLimiter,
  RateLimitDecision,
  SettleCommand,
  SettlementOutcome,
  VerifyCommand,
  VerifyOutcome,
} from "./types.js";

export interface DevelopmentAuthOptions {
  /** A secret supplied by the caller or INTENT_SENTINEL_DEV_BEARER_TOKEN. */
  token?: string;
  principal?: Principal;
}

/**
 * Development-only bearer verifier. It has no built-in credential: without a
 * configured token every request is rejected. Production should replace this
 * with an OIDC/JWT or mTLS-backed implementation.
 */
export class DevelopmentBearerTokenVerifier implements BearerTokenVerifier {
  private readonly token: string | undefined;
  private readonly principal: Principal;

  public constructor(options: DevelopmentAuthOptions = {}) {
    this.token = options.token ?? process.env.INTENT_SENTINEL_DEV_BEARER_TOKEN;
    this.principal = options.principal ?? {
      subject: process.env.INTENT_SENTINEL_DEV_SUBJECT ?? "development-principal",
      tenantId: process.env.INTENT_SENTINEL_DEV_TENANT ?? "development-tenant",
      roles: ["agent"],
    };
  }

  public async verify(token: string): Promise<Principal | undefined> {
    if (!this.token || !token || token.length !== this.token.length) return undefined;
    const left = Buffer.from(token);
    const right = Buffer.from(this.token);
    if (left.length !== right.length) return undefined;
    if (!timingSafeEqual(left, right)) return undefined;
    return { ...this.principal, roles: [...this.principal.roles] };
  }
}

export function createDevelopmentBearerTokenVerifier(options: DevelopmentAuthOptions = {}): BearerTokenVerifier {
  return new DevelopmentBearerTokenVerifier(options);
}

const mockReadiness: AdapterReadiness = { ready: true, mode: "mock", simulated: true, reason: "SAFE_MOCK adapter; no external service is connected" };

function authorization(command: VerifyCommand | SettleCommand): Record<string, unknown> | undefined {
  const candidate = command.paymentPayload.payload.authorization;
  return candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : undefined;
}

export class SafeMockFacilitator implements FacilitatorAdapter {
  public async verify(command: VerifyCommand): Promise<VerifyOutcome> {
    const auth = authorization(command);
    return {
      isValid: true,
      mode: "mock",
      simulated: true,
      reason: "SAFE_MOCK verification: schema only; signature, balance, nonce state, and chain are not verified",
      ...(typeof auth?.from === "string" ? { payer: auth.from } : {}),
      ...(typeof auth?.value === "string" ? { amount: auth.value } : {}),
      ...(typeof auth?.nonce === "string" ? { nonce: auth.nonce } : {}),
    };
  }

  public async settle(command: SettleCommand): Promise<SettlementOutcome> {
    const auth = authorization(command);
    return {
      status: "settled",
      mode: "mock",
      simulated: true,
      txHash: `mock:${randomUUID()}`,
      reason: "SAFE_MOCK settlement: no funds moved and no chain transaction was submitted",
      ...(typeof auth?.from === "string" ? { payer: auth.from } : {}),
      ...(typeof auth?.value === "string" ? { amount: auth.value } : {}),
      ...(typeof auth?.nonce === "string" ? { nonce: auth.nonce } : {}),
    };
  }

  public async ready(): Promise<AdapterReadiness> {
    return mockReadiness;
  }
}

export class SafeMockPolicy implements PolicyAdapter {
  public async authorize(_operation: "verify" | "settle" | "events", _intent: PaymentIntentInput, _context: AuthContext): Promise<PolicyDecision> {
    return {
      allowed: true,
      mode: "mock",
      simulated: true,
      reason: "SAFE_MOCK policy: no production policy engine is connected",
    };
  }

  public async ready(): Promise<AdapterReadiness> {
    return mockReadiness;
  }
}

export class SafeMockKeyVault implements KeyVaultAdapter {
  public async ready(): Promise<AdapterReadiness> {
    return mockReadiness;
  }
}

export class SafeMockEvents implements EventAdapter {
  public async list(_tenantId: string, _query: { cursor?: string; limit: number }, _context: AuthContext): Promise<{ events: readonly EventRecord[]; nextCursor?: string }> {
    return { events: [] };
  }

  public async ready(): Promise<AdapterReadiness> {
    return mockReadiness;
  }
}

export function createSafeMockAdapters(): ApiAdapters {
  return {
    facilitator: new SafeMockFacilitator(),
    policy: new SafeMockPolicy(),
    keyVault: new SafeMockKeyVault(),
    events: new SafeMockEvents(),
  };
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  public constructor(private readonly maxRequests = 60, private readonly windowMs = 60_000, private readonly now = () => Date.now()) {}

  public async check(key: string): Promise<RateLimitDecision> {
    const current = this.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= current) {
      this.windows.set(key, { count: 1, resetAt: current + this.windowMs });
      return { allowed: true };
    }
    if (existing.count >= this.maxRequests) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1000)) };
    existing.count += 1;
    return { allowed: true };
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  public async get(key: string): Promise<IdempotencyRecord | undefined> {
    const value = this.records.get(key);
    return value ? { ...value, response: structuredClone(value.response) } : undefined;
  }

  public async set(key: string, record: IdempotencyRecord): Promise<void> {
    this.records.set(key, { ...record, response: structuredClone(record.response) });
  }
}

export class InMemoryReplayProtector implements ReplayProtector {
  private readonly nonces = new Set<string>();

  public async claim(tenantId: string, nonce: string): Promise<boolean> {
    const key = `${tenantId}:${nonce.toLowerCase()}`;
    if (this.nonces.has(key)) return false;
    this.nonces.add(key);
    return true;
  }

  public async release(tenantId: string, nonce: string): Promise<void> {
    this.nonces.delete(`${tenantId}:${nonce.toLowerCase()}`);
  }
}
