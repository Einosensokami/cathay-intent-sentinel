export interface Erc8004IdentityRecord {
    agentId: string;
    walletAddress: `0x${string}`;
    serviceEndpoint: string;
    name?: string;
    registeredAt: number;
    active: boolean;
}
export interface Erc8004ReputationRecord {
    score: number;
    successfulTasks: number;
    disputedTasks: number;
    lastUpdated: number;
    antiSybilPassed: boolean;
}
export interface Erc8004ValidationRecord {
    taskId: string;
    validatorAddress: `0x${string}`;
    isValid: boolean;
    economicGuaranteeAmount: string;
    evidenceHash: `0x${string}`;
}
export interface Erc8004TrustCheckResult {
    verified: boolean;
    reason: string;
    identity?: Erc8004IdentityRecord;
    reputation?: Erc8004ReputationRecord;
    validation?: Erc8004ValidationRecord;
}
export declare class Erc8004TrustRegistry {
    private readonly identities;
    private readonly reputations;
    private readonly validations;
    registerAgent(identity: Erc8004IdentityRecord, reputation: Erc8004ReputationRecord): void;
    recordValidation(record: Erc8004ValidationRecord): void;
    verifyAgent(walletAddress: string, endpointUrl: string, minReputationScore?: number): Promise<Erc8004TrustCheckResult>;
}
