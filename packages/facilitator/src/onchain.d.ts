import { type Provider, type Signer } from "ethers";
import type { PaymentPayload, PaymentRequirements } from "@cathay/intent-sentinel-core";
import { type TransferSubmitter } from "./settle.js";
export declare const BASE_SEPOLIA_CHAIN_ID = 84532;
export declare const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export declare const BASE_SEPOLIA_EXPLORER_TX_URL = "https://sepolia.basescan.org/tx";
export declare const ERC3009_ABI: readonly ["function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)", "function receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)"];
export type AuthorizationMethod = "transferWithAuthorization" | "receiveWithAuthorization";
export type SettlementMode = "onchain" | "mock";
export type SettlementStage = "discovered" | "negotiating" | "preflight_failed" | "budget_reserved" | "authorized" | "submitted" | "unknown";
export interface TransactionResponseLike {
    hash: string;
    wait?: (confirmations?: number) => Promise<unknown>;
}
export interface AuthorizationContract {
    [method: string]: unknown;
    transferWithAuthorization?: AuthorizationFunction;
    receiveWithAuthorization?: AuthorizationFunction;
}
export type AuthorizationFunction = ((...args: unknown[]) => Promise<TransactionResponseLike>) & {
    staticCall?: (...args: unknown[]) => Promise<unknown>;
};
export interface BaseSepoliaSubmitterOptions {
    /** Explicitly choose the truth source. Defaults to onchain. */
    settlement_mode?: SettlementMode;
    rpcUrl?: string;
    privateKey?: string;
    provider?: Provider;
    signer?: Signer;
    /** Injectable contract for tests or a wallet/KMS adapter. */
    contract?: AuthorizationContract;
    authorizationMethod?: AuthorizationMethod;
    confirmations?: number;
    simulate?: boolean;
    /** Allows applications to run a separate, richer preflight check. */
    preflightOnSubmit?: boolean;
    mockTxHashFactory?: () => string;
}
export interface SettlementSubmission {
    txHash: string;
    receipt?: unknown;
    mode: SettlementMode;
    simulated: boolean;
    /** Present only for a verified live Base Sepolia transaction. */
    explorerUrl?: string;
}
export interface BaseSepoliaPreflightResult {
    ok: boolean;
    chainId: number;
    rpcUrl: string;
    asset: string;
    hasTokenBytecode: boolean;
    error?: string;
}
/**
 * Base Sepolia ERC-3009 submitter.
 *
 * The class deliberately has no automatic live-to-mock catch block. A caller
 * must select mock mode during a pre-authorization stage, which prevents a
 * signed or broadcast authorization from being silently replaced by a fake
 * receipt.
 */
export declare class BaseSepoliaSubmitter implements TransferSubmitter {
    private mode;
    private stage;
    private readonly provider;
    private readonly signer;
    private readonly contract;
    private readonly options;
    constructor(options?: BaseSepoliaSubmitterOptions);
    get settlement_mode(): SettlementMode;
    get settlementMode(): SettlementMode;
    get operationStage(): SettlementStage;
    get chainId(): number;
    get rpcUrl(): string;
    get asset(): string;
    /** Start a distinct payment operation after the previous one is terminal. */
    beginOperation(): void;
    /** Advance the operation state; state cannot move back after authorization. */
    setOperationStage(stage: SettlementStage): void;
    markAuthorizationIssued(): void;
    /**
     * Select mock only before authorization. This is the sole fallback API.
     * `stage` is accepted for auditability and must agree with internal state.
     */
    fallbackToMockBeforeAuthorization(stage?: SettlementStage): void;
    switchSettlementMode(mode: SettlementMode, stage?: SettlementStage): void;
    /**
     * Check the configured Base Sepolia RPC and USDC deployment before signing.
     * This method never changes mode; the caller may invoke the explicit
     * pre-authorization fallback after a failed result.
     */
    preflight(): Promise<BaseSepoliaPreflightResult>;
    static transactionUrl(txHash: string): string;
    transactionUrl(txHash: string): string;
    submit(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettlementSubmission>;
    private submitMock;
    private submitOnchain;
    private validatePayment;
    private authorizationMethod;
}
