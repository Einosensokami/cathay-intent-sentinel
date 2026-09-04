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
export declare class StakedSlaEscrow {
    private readonly bonds;
    depositStake(merchantAddress: string, amount: bigint, lockDurationSeconds?: number): void;
    getStake(merchantAddress: string): bigint;
    evaluateSlaAndSlash(claim: SlaDeliveryClaim, requiredPenaltyAmount: bigint): SlashResult;
}
