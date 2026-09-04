import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { assertValidPaymentIntent, type PaymentIntent } from "@cathay/intent-sentinel-core";
import { ScopedKeyVault } from "./vault.js";
export type SessionStatus = "active" | "revoked" | "closed";
export interface RootTreasury { readonly tier: "root-treasury"; readonly rootAddress: string; readonly custody: "offline" | "multisig"; }
export interface FundingPool { readonly tier: "funding-pool"; readonly id: string; readonly address: string; readonly maxSpend: string; readonly spent: string; }
export interface SessionKeyOptions { id: string; fundingPoolId: string; intent: PaymentIntent; quota?: string; privateKey?: Hex; }
export class HierarchyError extends Error { public constructor(message: string) { super(message); this.name = "HierarchyError"; } }
function amount(value: string, field: string): bigint { if (!/^(0|[1-9]\d*)$/.test(value)) throw new HierarchyError(`${field} must be a non-negative decimal amount`); return BigInt(value); }
export class SessionKey {
  readonly tier = "session-key" as const; readonly id: string; readonly fundingPoolId: string; readonly intent: PaymentIntent; readonly vault: ScopedKeyVault; readonly quota: string;
  #spent = 0n; #status: SessionStatus = "active"; #revocationReason: string | undefined; readonly #hierarchy: KeyHierarchy;
  public constructor(options: SessionKeyOptions, hierarchy: KeyHierarchy, clock: () => number) { this.id = options.id; this.fundingPoolId = options.fundingPoolId; this.intent = structuredClone(options.intent); this.quota = options.quota ?? options.intent.max_amount; this.#hierarchy = hierarchy; assertValidPaymentIntent(this.intent); if (amount(this.quota, "quota") > amount(this.intent.max_amount, "intent.max_amount")) throw new HierarchyError("session quota exceeds intent max_amount"); this.vault = new ScopedKeyVault({ privateKey: options.privateKey ?? generatePrivateKey(), intent: this.intent, clock }); }
  public get address(): string { return this.vault.address; } public get spent(): string { return this.#spent.toString(); } public get status(): SessionStatus { return this.#status; } public get revocationReason(): string | undefined { return this.#revocationReason; }
  public reserveSpend(spend: string): { sessionId: string; amount: string; totalSpent: string } { return this.#hierarchy.reserveSessionSpend(this, spend); }
  public revoke(reason = "revoked"): void { this.#hierarchy.revokeSession(this, reason); } public close(): void { this.#hierarchy.closeSession(this); }
  /** @internal */ public _applySpend(value: bigint): void { this.#spent += value; }
  /** @internal */ public _setStatus(status: SessionStatus, reason?: string): void { this.#status = status; this.#revocationReason = reason; if (status !== "active") this.vault.close(); }
}
export class KeyHierarchy {
  readonly root: RootTreasury; readonly #clock: () => number; readonly #pools = new Map<string, { id: string; address: string; maxSpend: bigint; spent: bigint }>(); readonly #sessions = new Map<string, SessionKey>();
  public constructor(options: { rootAddress: string; custody?: RootTreasury["custody"]; clock?: () => number }) { if (!options.rootAddress.trim()) throw new HierarchyError("rootAddress is required"); this.root = { tier: "root-treasury", rootAddress: options.rootAddress, custody: options.custody ?? "multisig" }; this.#clock = options.clock ?? (() => Math.floor(Date.now() / 1000)); }
  public createFundingPool(input: { id: string; address: string; maxSpend: string }): FundingPool { if (!input.id.trim() || this.#pools.has(input.id)) throw new HierarchyError("funding pool id must be unique and non-empty"); const maxSpend = amount(input.maxSpend, "maxSpend"); this.#pools.set(input.id, { id: input.id, address: input.address, maxSpend, spent: 0n }); return this.getFundingPool(input.id)!; }
  public getFundingPool(id: string): FundingPool | undefined { const p = this.#pools.get(id); return p ? { tier: "funding-pool", id: p.id, address: p.address, maxSpend: p.maxSpend.toString(), spent: p.spent.toString() } : undefined; }
  public createSessionKey(options: SessionKeyOptions): SessionKey { if (!this.#pools.has(options.fundingPoolId)) throw new HierarchyError("funding pool does not exist"); if (!options.id.trim() || this.#sessions.has(options.id)) throw new HierarchyError("session key id must be unique and non-empty"); assertValidPaymentIntent(options.intent, this.#clock()); const session = new SessionKey(options, this, this.#clock); this.#sessions.set(session.id, session); return session; }
  public getSession(id: string): SessionKey | undefined { return this.#sessions.get(id); }
  /** @internal */ public reserveSessionSpend(session: SessionKey, spend: string): { sessionId: string; amount: string; totalSpent: string } { const value = amount(spend, "spend"); const pool = this.#pools.get(session.fundingPoolId); if (!pool || this.#sessions.get(session.id) !== session) throw new HierarchyError("unknown session key"); if (session.status !== "active") throw new HierarchyError("session key is not active"); if (this.#clock() >= session.intent.expires_at) throw new HierarchyError("session intent is expired"); if (value > amount(session.quota, "quota") - BigInt(session.spent)) throw new HierarchyError("session max spend quota exceeded"); if (value > pool.maxSpend - pool.spent) throw new HierarchyError("funding pool max spend exceeded"); session._applySpend(value); pool.spent += value; return { sessionId: session.id, amount: value.toString(), totalSpent: session.spent }; }
  /** @internal */ public revokeSession(session: SessionKey, reason: string): void { if (this.#sessions.get(session.id) !== session) throw new HierarchyError("unknown session key"); if (session.status === "active") session._setStatus("revoked", reason || "revoked"); }
  /** @internal */ public closeSession(session: SessionKey): void { if (this.#sessions.get(session.id) !== session) throw new HierarchyError("unknown session key"); if (session.status === "active") session._setStatus("closed"); }
}
