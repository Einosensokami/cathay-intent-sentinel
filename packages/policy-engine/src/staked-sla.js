import { getAddress } from "ethers";
export class StakedSlaEscrow {
    bonds = new Map();
    depositStake(merchantAddress, amount, lockDurationSeconds = 86400 * 30) {
        const key = getAddress(merchantAddress).toLowerCase();
        const existing = this.bonds.get(key);
        const newStake = (existing?.stakedAmount ?? 0n) + amount;
        const now = Math.floor(Date.now() / 1000);
        this.bonds.set(key, {
            merchantAddress: getAddress(merchantAddress),
            stakedAmount: newStake,
            lockedUntil: now + lockDurationSeconds,
            activeDisputes: existing?.activeDisputes ?? 0,
        });
    }
    getStake(merchantAddress) {
        const key = getAddress(merchantAddress).toLowerCase();
        return this.bonds.get(key)?.stakedAmount ?? 0n;
    }
    evaluateSlaAndSlash(claim, requiredPenaltyAmount) {
        const key = getAddress(claim.merchantAddress).toLowerCase();
        const bond = this.bonds.get(key);
        if (!bond) {
            return { slashed: false, slashedAmount: 0n, remainingStake: 0n, reason: "No active SLA bond found for merchant" };
        }
        const isLate = claim.actualDeliveredAt > claim.expectedDeliveryBy;
        const isInvalidQuality = !claim.dataQualityVerified;
        if (!isLate && !isInvalidQuality) {
            return { slashed: false, slashedAmount: 0n, remainingStake: bond.stakedAmount, reason: "SLA delivery obligations satisfied" };
        }
        const penalty = bond.stakedAmount < requiredPenaltyAmount ? bond.stakedAmount : requiredPenaltyAmount;
        const remaining = bond.stakedAmount - penalty;
        this.bonds.set(key, { ...bond, stakedAmount: remaining });
        const violationReason = isInvalidQuality ? "Data quality validation failed" : "Delivery exceeded SLA deadline";
        return {
            slashed: true,
            slashedAmount: penalty,
            remainingStake: remaining,
            reason: `SLA violation: ${violationReason}. Slashed ${penalty} units.`,
        };
    }
}
