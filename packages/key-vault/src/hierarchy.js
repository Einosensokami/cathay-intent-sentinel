import { generatePrivateKey } from "viem/accounts";
import { assertValidPaymentIntent } from "@cathay/intent-sentinel-core";
import { ScopedKeyVault } from "./vault.js";
export class HierarchyError extends Error {
    constructor(message) { super(message); this.name = "HierarchyError"; }
}
function amount(value, field) { if (!/^(0|[1-9]\d*)$/.test(value))
    throw new HierarchyError(`${field} must be a non-negative decimal amount`); return BigInt(value); }
export class SessionKey {
    tier = "session-key";
    id;
    fundingPoolId;
    intent;
    vault;
    quota;
    #spent = 0n;
    #status = "active";
    #revocationReason;
    #hierarchy;
    constructor(options, hierarchy, clock) { this.id = options.id; this.fundingPoolId = options.fundingPoolId; this.intent = structuredClone(options.intent); this.quota = options.quota ?? options.intent.max_amount; this.#hierarchy = hierarchy; assertValidPaymentIntent(this.intent); if (amount(this.quota, "quota") > amount(this.intent.max_amount, "intent.max_amount"))
        throw new HierarchyError("session quota exceeds intent max_amount"); this.vault = new ScopedKeyVault({ privateKey: options.privateKey ?? generatePrivateKey(), intent: this.intent, clock }); }
    get address() { return this.vault.address; }
    get spent() { return this.#spent.toString(); }
    get status() { return this.#status; }
    get revocationReason() { return this.#revocationReason; }
    reserveSpend(spend) { return this.#hierarchy.reserveSessionSpend(this, spend); }
    revoke(reason = "revoked") { this.#hierarchy.revokeSession(this, reason); }
    close() { this.#hierarchy.closeSession(this); }
    /** @internal */ _applySpend(value) { this.#spent += value; }
    /** @internal */ _setStatus(status, reason) { this.#status = status; this.#revocationReason = reason; if (status !== "active")
        this.vault.close(); }
}
export class KeyHierarchy {
    root;
    #clock;
    #pools = new Map();
    #sessions = new Map();
    constructor(options) { if (!options.rootAddress.trim())
        throw new HierarchyError("rootAddress is required"); this.root = { tier: "root-treasury", rootAddress: options.rootAddress, custody: options.custody ?? "multisig" }; this.#clock = options.clock ?? (() => Math.floor(Date.now() / 1000)); }
    createFundingPool(input) { if (!input.id.trim() || this.#pools.has(input.id))
        throw new HierarchyError("funding pool id must be unique and non-empty"); const maxSpend = amount(input.maxSpend, "maxSpend"); this.#pools.set(input.id, { id: input.id, address: input.address, maxSpend, spent: 0n }); return this.getFundingPool(input.id); }
    getFundingPool(id) { const p = this.#pools.get(id); return p ? { tier: "funding-pool", id: p.id, address: p.address, maxSpend: p.maxSpend.toString(), spent: p.spent.toString() } : undefined; }
    createSessionKey(options) { if (!this.#pools.has(options.fundingPoolId))
        throw new HierarchyError("funding pool does not exist"); if (!options.id.trim() || this.#sessions.has(options.id))
        throw new HierarchyError("session key id must be unique and non-empty"); assertValidPaymentIntent(options.intent, this.#clock()); const session = new SessionKey(options, this, this.#clock); this.#sessions.set(session.id, session); return session; }
    getSession(id) { return this.#sessions.get(id); }
    /** @internal */ reserveSessionSpend(session, spend) { const value = amount(spend, "spend"); const pool = this.#pools.get(session.fundingPoolId); if (!pool || this.#sessions.get(session.id) !== session)
        throw new HierarchyError("unknown session key"); if (session.status !== "active")
        throw new HierarchyError("session key is not active"); if (this.#clock() >= session.intent.expires_at)
        throw new HierarchyError("session intent is expired"); if (value > amount(session.quota, "quota") - BigInt(session.spent))
        throw new HierarchyError("session max spend quota exceeded"); if (value > pool.maxSpend - pool.spent)
        throw new HierarchyError("funding pool max spend exceeded"); session._applySpend(value); pool.spent += value; return { sessionId: session.id, amount: value.toString(), totalSpent: session.spent }; }
    /** @internal */ revokeSession(session, reason) { if (this.#sessions.get(session.id) !== session)
        throw new HierarchyError("unknown session key"); if (session.status === "active")
        session._setStatus("revoked", reason || "revoked"); }
    /** @internal */ closeSession(session) { if (this.#sessions.get(session.id) !== session)
        throw new HierarchyError("unknown session key"); if (session.status === "active")
        session._setStatus("closed"); }
}
