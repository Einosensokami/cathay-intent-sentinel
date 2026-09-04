import { getAddress } from "ethers";
function amount(value) {
    if (typeof value === "bigint") {
        if (value < 0n)
            throw new TypeError("Amount cannot be negative");
        return value;
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value))
        throw new TypeError("Amount must be an unsigned atomic-unit integer");
    return BigInt(value);
}
function agentKey(value) {
    if (typeof value === "bigint") {
        if (value < 0n)
            throw new TypeError("agentId cannot be negative");
        return value.toString();
    }
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0)
            throw new TypeError("agentId must be a non-negative integer");
        return String(value);
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value))
        throw new TypeError("agentId must be a non-negative integer");
    return BigInt(value).toString();
}
function wallet(value, label) {
    try {
        return getAddress(value);
    }
    catch {
        throw new TypeError(`${label} is not a valid address`);
    }
}
/**
 * Stateful economic guarantee model used by the policy engine. It mirrors the
 * companion SlaEscrow contract's important invariants: only available stake is
 * locked, a deal can settle once, and an invalid/late delivery consumes the
 * locked bond exactly once. Token transfers are deliberately an edge adapter;
 * this class never pretends that an in-memory balance is an on-chain receipt.
 */
export class StakedSlaEscrow {
    positions = new Map();
    deals = new Map();
    events = [];
    now;
    requiredCoverageBps;
    defaultSlashBps;
    validateDelivery;
    constructor(options = {}) {
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
        this.requiredCoverageBps = options.requiredCoverageBps ?? 100_000; // 10x quote
        this.defaultSlashBps = options.defaultSlashBps ?? 10_000; // full locked bond
        this.validateDelivery = options.validateDelivery;
        if (!Number.isSafeInteger(this.requiredCoverageBps) || this.requiredCoverageBps < 10_000)
            throw new RangeError("requiredCoverageBps must be at least 10000");
        if (!Number.isSafeInteger(this.defaultSlashBps) || this.defaultSlashBps < 0 || this.defaultSlashBps > 10_000)
            throw new RangeError("defaultSlashBps must be between 0 and 10000");
    }
    depositStake(agentId, stake, merchantWallet, withdrawalAvailableAt = 0) {
        const key = agentKey(agentId);
        const value = amount(stake);
        if (!Number.isSafeInteger(withdrawalAvailableAt) || withdrawalAvailableAt < 0)
            throw new TypeError("withdrawalAvailableAt must be a non-negative timestamp");
        const existing = this.positions.get(key);
        const position = {
            agent_id: key,
            ...(merchantWallet ? { merchant_wallet: wallet(merchantWallet, "Merchant wallet") } : existing?.merchant_wallet ? { merchant_wallet: existing.merchant_wallet } : {}),
            available_stake: (existing?.available_stake ?? 0n) + value,
            locked_stake: existing?.locked_stake ?? 0n,
            withdrawal_available_at: Math.max(existing?.withdrawal_available_at ?? 0, withdrawalAvailableAt),
        };
        this.positions.set(key, position);
        this.events.push({ type: "stake_deposited", agent_id: key, amount: value.toString(), at: this.now() });
        return { ...position };
    }
    /** Backwards-friendly alias for integrations that call the action stake(). */
    stake(agentId, value, merchantWallet, withdrawalAvailableAt = 0) {
        return this.depositStake(agentId, value, merchantWallet, withdrawalAvailableAt);
    }
    stakeOf(agentId) {
        const position = this.positions.get(agentKey(agentId));
        return (position?.available_stake ?? 0n) + (position?.locked_stake ?? 0n);
    }
    getPosition(agentId) {
        const key = agentKey(agentId);
        const position = this.positions.get(key);
        return position ? { ...position } : { agent_id: key, available_stake: 0n, locked_stake: 0n, withdrawal_available_at: 0 };
    }
    verifyStake(input) {
        const key = agentKey(input.agentId);
        const quote = amount(input.quotedAmount);
        if (!Number.isSafeInteger(input.intentExpiresAt) || !Number.isSafeInteger(input.disputeWindowSeconds) || input.disputeWindowSeconds < 0)
            throw new TypeError("Invalid SLA timestamps");
        const position = this.getPosition(key);
        const required = quote * BigInt(this.requiredCoverageBps) / 10000n;
        const lockSatisfied = position.withdrawal_available_at >= input.intentExpiresAt + input.disputeWindowSeconds;
        const walletMatches = !input.merchantWallet || !position.merchant_wallet || position.merchant_wallet.toLowerCase() === wallet(input.merchantWallet, "Merchant wallet").toLowerCase();
        const eligible = position.available_stake >= required && lockSatisfied && walletMatches;
        let reason = eligible ? "Stake coverage and lock satisfy SLA policy" : "Insufficient stake coverage";
        if (!lockSatisfied)
            reason = "Stake withdrawal lock ends before the dispute window";
        else if (!walletMatches)
            reason = "Stake is bound to a different merchant wallet";
        return { eligible, reason, agent_id: key, required_stake: required, available_stake: position.available_stake, locked_stake: position.locked_stake, coverage_bps: quote === 0n ? 0 : Number((position.available_stake * 10000n) / quote), lock_satisfied: lockSatisfied, source: "escrow" };
    }
    createDeal(input) {
        if (this.deals.has(input.dealId))
            throw new Error("Deal already exists");
        const dealAmount = amount(input.amount);
        const requiredStake = input.stakeRequired === undefined ? dealAmount * BigInt(this.requiredCoverageBps) / 10000n : amount(input.stakeRequired);
        if (!Number.isSafeInteger(input.deliverBy) || !Number.isSafeInteger(input.disputeUntil) || input.disputeUntil < input.deliverBy)
            throw new TypeError("Invalid deal deadlines");
        const buyer = wallet(input.buyer, "Buyer");
        const sellerAgentId = agentKey(input.sellerAgentId);
        const position = this.getPosition(sellerAgentId);
        if (position.available_stake < requiredStake)
            throw new Error("Merchant does not have enough available stake");
        position.available_stake -= requiredStake;
        position.locked_stake += requiredStake;
        if (input.sellerWallet)
            position.merchant_wallet = wallet(input.sellerWallet, "Seller wallet");
        this.positions.set(sellerAgentId, position);
        const deal = { deal_id: input.dealId, buyer, seller_agent_id: sellerAgentId, ...(position.merchant_wallet ? { seller_wallet: position.merchant_wallet } : {}), token: input.token, amount: dealAmount, stake_locked: requiredStake, deliver_by: input.deliverBy, dispute_until: input.disputeUntil, ...(input.intentHash ? { intent_hash: input.intentHash } : {}), ...(input.transcriptHash ? { transcript_hash: input.transcriptHash } : {}), status: "FUNDED" };
        this.deals.set(deal.deal_id, deal);
        this.events.push({ type: "deal_funded", deal_id: deal.deal_id, seller_agent_id: sellerAgentId, stake_locked: requiredStake.toString(), intent_hash: input.intentHash, transcript_hash: input.transcriptHash, at: this.now() });
        return { ...deal };
    }
    getDeal(dealId) {
        const deal = this.deals.get(dealId);
        return deal ? { ...deal } : undefined;
    }
    listEvents() { return this.events.map((event) => ({ ...event })); }
    async recordDelivery(dealId, delivery, valid, deliveredAt = this.now()) {
        const deal = this.requireDeal(dealId);
        if (deal.status !== "FUNDED" && deal.status !== "PROPOSED")
            throw new Error(`Deal is already ${deal.status}`);
        const isValid = valid ?? (this.validateDelivery ? await this.validateDelivery({ ...deal }, delivery) : true);
        if (!isValid) {
            await this.slashStake(dealId, "Invalid merchant data");
            return this.requireDeal(dealId);
        }
        if (deliveredAt > deal.deliver_by) {
            await this.slashStake(dealId, "SLA delivery deadline violated");
            return this.requireDeal(dealId);
        }
        deal.status = "DELIVERED";
        this.events.push({ type: "deal_delivered", deal_id: dealId, at: deliveredAt });
        this.releaseStake(deal);
        return { ...deal };
    }
    /** Automatically checks an outstanding deal and slashes a missed deadline. */
    async enforceDeadline(dealId, at = this.now()) {
        const deal = this.requireDeal(dealId);
        if ((deal.status === "FUNDED" || deal.status === "PROPOSED") && at > deal.deliver_by)
            return this.slashStake(dealId, "SLA delivery deadline violated");
        return undefined;
    }
    async slashStake(dealId, reason, slashBps = this.defaultSlashBps) {
        const deal = this.requireDeal(dealId);
        if (["RELEASED", "REFUNDED", "RESOLVED_BUYER", "RESOLVED_SELLER", "SLASHED"].includes(deal.status))
            return { deal_id: dealId, agent_id: deal.seller_agent_id, amount: deal.slash_amount ?? 0n, reason: deal.slash_reason ?? reason, status: "ALREADY_SETTLED" };
        if (!Number.isSafeInteger(slashBps) || slashBps < 0 || slashBps > 10_000)
            throw new RangeError("slashBps must be between 0 and 10000");
        const position = this.getPosition(deal.seller_agent_id);
        const slash = deal.stake_locked * BigInt(slashBps) / 10000n;
        position.locked_stake -= deal.stake_locked;
        position.available_stake += deal.stake_locked - slash;
        this.positions.set(deal.seller_agent_id, position);
        deal.slash_amount = slash;
        deal.slash_reason = reason;
        deal.status = slash > 0n ? "SLASHED" : "REFUNDED";
        this.events.push({ type: "stake_slashed", deal_id: dealId, seller_agent_id: deal.seller_agent_id, amount: slash.toString(), reason, at: this.now() });
        return { deal_id: dealId, agent_id: deal.seller_agent_id, amount: slash, reason, status: "SLASHED" };
    }
    releaseStake(deal) {
        const position = this.getPosition(deal.seller_agent_id);
        position.locked_stake -= deal.stake_locked;
        position.available_stake += deal.stake_locked;
        this.positions.set(deal.seller_agent_id, position);
        deal.status = "RELEASED";
        this.events.push({ type: "stake_released", deal_id: deal.deal_id, amount: deal.stake_locked.toString(), at: this.now() });
    }
    requireDeal(dealId) {
        const deal = this.deals.get(dealId);
        if (!deal)
            throw new Error(`Unknown SLA deal: ${dealId}`);
        return deal;
    }
}
