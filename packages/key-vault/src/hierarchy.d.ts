import type { Hex } from "viem";
import { type PaymentIntent } from "@cathay/intent-sentinel-core";
import { ScopedKeyVault } from "./vault.js";
export type SessionStatus = "active" | "revoked" | "closed";
export interface RootTreasury {
    readonly tier: "root-treasury";
    readonly rootAddress: string;
    readonly custody: "offline" | "multisig";
}
export interface FundingPool {
    readonly tier: "funding-pool";
    readonly id: string;
    readonly address: string;
    readonly maxSpend: string;
    readonly spent: string;
}
export interface SessionKeyOptions {
    id: string;
    fundingPoolId: string;
    intent: PaymentIntent;
    quota?: string;
    privateKey?: Hex;
}
export declare class HierarchyError extends Error {
    constructor(message: string);
}
export declare class SessionKey {
    #private;
    readonly tier: "session-key";
    readonly id: string;
    readonly fundingPoolId: string;
    readonly intent: PaymentIntent;
    readonly vault: ScopedKeyVault;
    readonly quota: string;
    constructor(options: SessionKeyOptions, hierarchy: KeyHierarchy, clock: () => number);
    get address(): string;
    get spent(): string;
    get status(): SessionStatus;
    get revocationReason(): string | undefined;
    reserveSpend(spend: string): {
        sessionId: string;
        amount: string;
        totalSpent: string;
    };
    revoke(reason?: string): void;
    close(): void;
    /** @internal */ _applySpend(value: bigint): void;
    /** @internal */ _setStatus(status: SessionStatus, reason?: string): void;
}
export declare class KeyHierarchy {
    #private;
    readonly root: RootTreasury;
    constructor(options: {
        rootAddress: string;
        custody?: RootTreasury["custody"];
        clock?: () => number;
    });
    createFundingPool(input: {
        id: string;
        address: string;
        maxSpend: string;
    }): FundingPool;
    getFundingPool(id: string): FundingPool | undefined;
    createSessionKey(options: SessionKeyOptions): SessionKey;
    getSession(id: string): SessionKey | undefined;
    /** @internal */ reserveSessionSpend(session: SessionKey, spend: string): {
        sessionId: string;
        amount: string;
        totalSpent: string;
    };
    /** @internal */ revokeSession(session: SessionKey, reason: string): void;
    /** @internal */ closeSession(session: SessionKey): void;
}
