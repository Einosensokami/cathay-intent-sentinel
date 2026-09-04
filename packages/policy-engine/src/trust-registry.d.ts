import { type Provider } from "ethers";
export declare const BASE_SEPOLIA_CHAIN_ID = 84532;
export declare const ERC8004_IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export declare const ERC8004_REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
export declare const ERC8004_VALIDATION_REGISTRY_ADDRESS = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
export interface MerchantIdentity {
    address: string;
    merchant_url: string;
    name?: string;
    registered_at?: number;
}
export interface MerchantReputation {
    score: number;
    successful_settlements: number;
    disputes: number;
    last_updated: number;
}
export interface MerchantRecord {
    identity?: MerchantIdentity;
    reputation?: MerchantReputation;
    address?: string;
    merchant_url?: string;
    reputation_score?: number;
    revoked?: boolean;
}
export interface TrustVerification {
    verified: boolean;
    reason: string;
    identity?: MerchantIdentity;
    reputation?: MerchantReputation;
    agent_id?: string;
    payee_bound?: boolean;
    identity_active?: boolean;
    source?: "onchain" | "fallback";
    block?: {
        number: number;
        hash: string;
    };
    evidence_hash?: string;
    validation?: {
        samples: number;
        score: number;
    };
}
export interface TrustRegistry {
    verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification>;
}
export declare class InMemoryTrustRegistry implements TrustRegistry {
    private readonly records;
    register(record: MerchantRecord): void;
    registerMerchant(record: MerchantRecord): void;
    revoke(address: string): void;
    verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification>;
}
export declare const MockTrustRegistry: typeof InMemoryTrustRegistry;
export interface Erc8004Feedback {
    reviewer: string;
    index?: number;
    value: bigint;
    value_decimals: number;
    tag1?: string;
    tag2?: string;
    revoked?: boolean;
    created_at?: number;
}
export interface Erc8004TrustDecision extends TrustVerification {
    agent_id: string;
    payee_bound: boolean;
    identity_active: boolean;
    source: "onchain" | "fallback";
    reputation: MerchantReputation;
}
export interface Erc8004SellerInput {
    agentId: string | number | bigint;
    payee?: string;
    agentWallet?: string;
    merchantUrl: string;
    quotedAmount?: string | bigint;
    now?: number;
}
export interface Erc8004TrustRegistryOptions {
    /** An ethers Provider, normally a JsonRpcProvider pointed at Base Sepolia. */
    provider?: Provider;
    rpcUrl?: string;
    identityRegistryAddress?: string;
    reputationRegistryAddress?: string;
    validationRegistryAddress?: string;
    /** Explicit fallback; it is never selected unless a live read fails. */
    fallback?: TrustRegistry;
    fallbackOnError?: boolean;
    trustedReviewers?: readonly string[];
    reviewerWeights?: Readonly<Record<string, number>>;
    supportedFeedbackTags?: readonly string[];
    minReputationScore?: number;
    minTrustedSamples?: number;
    maxFeedbackAgeSeconds?: number;
    minValidationScore?: number;
    requireValidation?: boolean;
    fetchRegistration?: (uri: string) => Promise<unknown>;
    now?: () => number;
    /** A fixed block number/hash is preferable for reproducible evidence. */
    blockTag?: number | string;
}
/**
 * RPC-backed ERC-8004 trust adapter. Every live decision reads all three
 * registries at one pinned block. It fails closed unless an explicit fallback
 * registry was supplied by the caller.
 */
export declare class Erc8004TrustRegistry implements TrustRegistry {
    readonly identityRegistryAddress: string;
    readonly reputationRegistryAddress: string;
    readonly validationRegistryAddress: string;
    private readonly provider?;
    private readonly options;
    private readonly identity;
    private readonly reputation;
    private readonly validation;
    constructor(options?: Erc8004TrustRegistryOptions);
    verifyMerchant(address: string, merchantUrl: string, agentId?: string | number | bigint): Promise<TrustVerification>;
    verifySeller(input: Erc8004SellerInput): Promise<Erc8004TrustDecision>;
    /** Descriptive alias used by the architecture and integration callers. */
    verifyAgent(input: Erc8004SellerInput): Promise<Erc8004TrustDecision>;
    private fallbackOrDeny;
    private assertNetwork;
    private pinBlock;
    private assertDeployed;
    private read;
    private readWallet;
    private readUri;
    private loadRegistration;
    private fetchUri;
    private readReputation;
    private readValidation;
}
/** Explicit name for callers that want to emphasize the live adapter. */
export declare const ERC8004TrustRegistry: typeof Erc8004TrustRegistry;
