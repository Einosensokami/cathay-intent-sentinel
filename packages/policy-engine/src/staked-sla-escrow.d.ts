export type SlaDealStatus = "PROPOSED" | "FUNDED" | "DELIVERED" | "RELEASED" | "EXPIRED" | "REFUNDED" | "DISPUTED" | "RESOLVED_BUYER" | "RESOLVED_SELLER" | "SLASHED";
export interface StakePosition {
    agent_id: string;
    merchant_wallet?: string;
    available_stake: bigint;
    locked_stake: bigint;
    withdrawal_available_at: number;
}
export interface StakeVerification {
    eligible: boolean;
    reason: string;
    agent_id: string;
    required_stake: bigint;
    available_stake: bigint;
    locked_stake: bigint;
    coverage_bps: number;
    lock_satisfied: boolean;
    source: "escrow";
}
export interface SlaDeal {
    deal_id: string;
    buyer: string;
    seller_agent_id: string;
    seller_wallet?: string;
    token: string;
    amount: bigint;
    stake_locked: bigint;
    deliver_by: number;
    dispute_until: number;
    intent_hash?: string;
    transcript_hash?: string;
    status: SlaDealStatus;
    slash_amount?: bigint;
    slash_reason?: string;
}
export interface SlashResult {
    deal_id: string;
    agent_id: string;
    amount: bigint;
    reason: string;
    status: "SLASHED" | "ALREADY_SETTLED";
}
export interface StakedSlaEscrowOptions {
    requiredCoverageBps?: number;
    defaultSlashBps?: number;
    now?: () => number;
    validateDelivery?: (deal: SlaDeal, delivery: unknown) => boolean | Promise<boolean>;
}
/**
 * Stateful economic guarantee model used by the policy engine. It mirrors the
 * companion SlaEscrow contract's important invariants: only available stake is
 * locked, a deal can settle once, and an invalid/late delivery consumes the
 * locked bond exactly once. Token transfers are deliberately an edge adapter;
 * this class never pretends that an in-memory balance is an on-chain receipt.
 */
export declare class StakedSlaEscrow {
    private readonly positions;
    private readonly deals;
    private readonly events;
    private readonly now;
    private readonly requiredCoverageBps;
    private readonly defaultSlashBps;
    private readonly validateDelivery?;
    constructor(options?: StakedSlaEscrowOptions);
    depositStake(agentId: string | number | bigint, stake: string | bigint, merchantWallet?: string, withdrawalAvailableAt?: number): StakePosition;
    /** Backwards-friendly alias for integrations that call the action stake(). */
    stake(agentId: string | number | bigint, value: string | bigint, merchantWallet?: string, withdrawalAvailableAt?: number): StakePosition;
    stakeOf(agentId: string | number | bigint): bigint;
    getPosition(agentId: string | number | bigint): StakePosition;
    verifyStake(input: {
        agentId: string | number | bigint;
        quotedAmount: string | bigint;
        intentExpiresAt: number;
        disputeWindowSeconds: number;
        merchantWallet?: string;
    }): StakeVerification;
    createDeal(input: {
        dealId: string;
        buyer: string;
        sellerAgentId: string | number | bigint;
        sellerWallet?: string;
        token: string;
        amount: string | bigint;
        stakeRequired?: string | bigint;
        deliverBy: number;
        disputeUntil: number;
        intentHash?: string;
        transcriptHash?: string;
    }): SlaDeal;
    getDeal(dealId: string): SlaDeal | undefined;
    listEvents(): readonly Record<string, unknown>[];
    recordDelivery(dealId: string, delivery: unknown, valid?: boolean, deliveredAt?: number): Promise<SlaDeal>;
    /** Automatically checks an outstanding deal and slashes a missed deadline. */
    enforceDeadline(dealId: string, at?: number): Promise<SlashResult | undefined>;
    slashStake(dealId: string, reason: string, slashBps?: number): Promise<SlashResult>;
    private releaseStake;
    private requireDeal;
}
