import { getAddress } from "ethers";

export interface SlaBond {
  merchantAddress: `0x${string}`;
  stakedAmount: bigint;
  lockedUntil: number;
  activeDisputes: number;
}

export interface SlaDeliveryClaim {
  taskId: string;
  merchantAddress: string;
  expectedDeliveryBy: number;
  actualDeliveredAt: number;
  dataQualityVerified: boolean;
}

export interface SlashResult {
  slashed: boolean;
  slashedAmount: bigint;
  remainingStake: bigint;
  reason: string;
}

export interface StakeVerification {
  eligible: boolean;
  merchantAddress: `0x${string}`;
  requiredStake: bigint;
  availableStake: bigint;
  coverageBps: number;
  lockedUntil: number;
  reason: string;
}

/** In-memory companion to the economic SLA escrow. It is intentionally explicit
 * about its simulation boundary; production adapters should mirror these rules
 * against a deployed non-upgradeable escrow contract. */
export class StakedSlaEscrow {
  private readonly bonds = new Map<string, SlaBond>();

  depositStake(merchantAddress: string, amount: bigint, lockDurationSeconds = 86400 * 30): void {
    if (amount < 0n) throw new TypeError("Stake amount cannot be negative");
    if (!Number.isSafeInteger(lockDurationSeconds) || lockDurationSeconds < 0) throw new TypeError("Lock duration must be a non-negative safe integer");
    const key = getAddress(merchantAddress).toLowerCase();
    const existing = this.bonds.get(key);
    const newStake = (existing?.stakedAmount ?? 0n) + amount;
    const now = Math.floor(Date.now() / 1000);
    this.bonds.set(key, {
      merchantAddress: getAddress(merchantAddress) as `0x${string}`,
      stakedAmount: newStake,
      lockedUntil: Math.max(existing?.lockedUntil ?? 0, now + lockDurationSeconds),
      activeDisputes: existing?.activeDisputes ?? 0,
    });
  }

  getStake(merchantAddress: string): bigint {
    const key = getAddress(merchantAddress).toLowerCase();
    return this.bonds.get(key)?.stakedAmount ?? 0n;
  }

  verifyStake(merchantAddress: string, quotedAmount: bigint, requiredCoverageBps = 100_000, now = Math.floor(Date.now() / 1000), requiredUntil = now): StakeVerification {
    if (quotedAmount < 0n) throw new TypeError("Quoted amount cannot be negative");
    if (!Number.isSafeInteger(requiredCoverageBps) || requiredCoverageBps < 0) throw new TypeError("Coverage must be a non-negative safe integer");
    const address = getAddress(merchantAddress) as `0x${string}`;
    const bond = this.bonds.get(address.toLowerCase());
    const available = bond?.stakedAmount ?? 0n;
    const required = quotedAmount * BigInt(requiredCoverageBps) / 10_000n;
    const lockSatisfied = (bond?.lockedUntil ?? 0) >= requiredUntil;
    const eligible = available >= required && lockSatisfied;
    return {
      eligible, merchantAddress: address, requiredStake: required, availableStake: available,
      coverageBps: quotedAmount === 0n ? 0 : Number((available * 10_000n) / quotedAmount),
      lockedUntil: bond?.lockedUntil ?? 0,
      reason: eligible ? "Stake coverage and lock satisfy SLA policy" : !bond ? "No active SLA bond found for merchant" : !lockSatisfied ? "Stake lock ends before the SLA window" : "Insufficient stake coverage",
    };
  }

  evaluateSlaAndSlash(claim: SlaDeliveryClaim, requiredPenaltyAmount: bigint): SlashResult {
    if (requiredPenaltyAmount < 0n) throw new TypeError("Penalty cannot be negative");
    const key = getAddress(claim.merchantAddress).toLowerCase();
    const bond = this.bonds.get(key);
    if (!bond) return { slashed: false, slashedAmount: 0n, remainingStake: 0n, reason: "No active SLA bond found for merchant" };
    const isLate = claim.actualDeliveredAt > claim.expectedDeliveryBy;
    const isInvalidQuality = !claim.dataQualityVerified;
    if (!isLate && !isInvalidQuality) return { slashed: false, slashedAmount: 0n, remainingStake: bond.stakedAmount, reason: "SLA delivery obligations satisfied" };
    const penalty = bond.stakedAmount < requiredPenaltyAmount ? bond.stakedAmount : requiredPenaltyAmount;
    const remaining = bond.stakedAmount - penalty;
    this.bonds.set(key, { ...bond, stakedAmount: remaining });
    const violationReason = isInvalidQuality ? "Data quality validation failed" : "Delivery exceeded SLA deadline";
    return { slashed: penalty > 0n, slashedAmount: penalty, remainingStake: remaining, reason: `SLA violation: ${violationReason}. Slashed ${penalty} units.` };
  }

  /** Explicit slash alias for integrations that separate detection from execution. */
  slashStake(merchantAddress: string, amount: bigint, reason = "SLA violation"): SlashResult {
    if (amount < 0n) throw new TypeError("Penalty cannot be negative");
    const key = getAddress(merchantAddress).toLowerCase();
    const bond = this.bonds.get(key);
    if (!bond) return { slashed: false, slashedAmount: 0n, remainingStake: 0n, reason: "No active SLA bond found for merchant" };
    const penalty = bond.stakedAmount < amount ? bond.stakedAmount : amount;
    const remaining = bond.stakedAmount - penalty;
    this.bonds.set(key, { ...bond, stakedAmount: remaining });
    return { slashed: penalty > 0n, slashedAmount: penalty, remainingStake: remaining, reason };
  }
}
