import { randomUUID } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet, getAddress, } from "ethers";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC } from "@cathay/intent-sentinel-core";
import { TimeoutUnknownOutcomeError } from "./settle.js";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
export const BASE_SEPOLIA_EXPLORER_TX_URL = "https://sepolia.basescan.org/tx";
export const ERC3009_ABI = [
    "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
    "function receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
];
const PRE_AUTHORIZATION_STAGES = new Set([
    "discovered",
    "negotiating",
    "preflight_failed",
]);
function isAddressValue(value) {
    try {
        getAddress(value);
        return true;
    }
    catch {
        return false;
    }
}
function withTxHash(error, txHash) {
    const result = error instanceof Error ? error : new Error(String(error));
    Object.assign(result, { txHash });
    return result;
}
/**
 * Base Sepolia ERC-3009 submitter.
 *
 * The class deliberately has no automatic live-to-mock catch block. A caller
 * must select mock mode during a pre-authorization stage, which prevents a
 * signed or broadcast authorization from being silently replaced by a fake
 * receipt.
 */
export class BaseSepoliaSubmitter {
    mode;
    stage = "discovered";
    provider;
    signer;
    contract;
    options;
    constructor(options = {}) {
        this.options = options;
        this.mode = options.settlement_mode ?? "onchain";
        this.provider = options.provider ?? new JsonRpcProvider(options.rpcUrl ?? BASE_SEPOLIA_RPC_URL, BASE_SEPOLIA_CHAIN_ID);
        this.signer = options.signer ?? (options.privateKey ? new Wallet(options.privateKey, this.provider) : undefined);
        this.contract = options.contract ?? (this.signer ? new Contract(BASE_SEPOLIA_USDC, ERC3009_ABI, this.signer) : undefined);
    }
    get settlement_mode() {
        return this.mode;
    }
    get settlementMode() {
        return this.mode;
    }
    get operationStage() {
        return this.stage;
    }
    get chainId() {
        return BASE_SEPOLIA_CHAIN_ID;
    }
    get rpcUrl() {
        return this.options.rpcUrl ?? BASE_SEPOLIA_RPC_URL;
    }
    get asset() {
        return BASE_SEPOLIA_USDC;
    }
    /** Start a distinct payment operation after the previous one is terminal. */
    beginOperation() {
        if (this.stage === "authorized")
            throw new Error("Cannot start a new operation while authorization is active");
        this.stage = "discovered";
    }
    /** Advance the operation state; state cannot move back after authorization. */
    setOperationStage(stage) {
        if (this.stage === "authorized" || this.stage === "submitted" || this.stage === "unknown") {
            if (stage !== this.stage)
                throw new Error("Settlement operation cannot move after authorization");
        }
        this.stage = stage;
    }
    markAuthorizationIssued() {
        if (!PRE_AUTHORIZATION_STAGES.has(this.stage) && this.stage !== "authorized") {
            throw new Error(`Cannot issue authorization from settlement stage ${this.stage}`);
        }
        this.stage = "authorized";
    }
    /**
     * Select mock only before authorization. This is the sole fallback API.
     * `stage` is accepted for auditability and must agree with internal state.
     */
    fallbackToMockBeforeAuthorization(stage = this.stage) {
        if (stage !== this.stage || !PRE_AUTHORIZATION_STAGES.has(this.stage)) {
            throw new Error("Mock fallback is forbidden after authorization or broadcast");
        }
        this.mode = "mock";
        if (this.stage === "discovered" || this.stage === "negotiating")
            this.stage = "preflight_failed";
    }
    switchSettlementMode(mode, stage = this.stage) {
        if (mode === this.mode)
            return;
        if (stage !== this.stage || !PRE_AUTHORIZATION_STAGES.has(this.stage)) {
            throw new Error("Settlement mode cannot change after authorization or broadcast");
        }
        this.mode = mode;
    }
    /**
     * Check the configured Base Sepolia RPC and USDC deployment before signing.
     * This method never changes mode; the caller may invoke the explicit
     * pre-authorization fallback after a failed result.
     */
    async preflight() {
        const stageBeforePreflight = this.stage;
        try {
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);
            if (chainId !== BASE_SEPOLIA_CHAIN_ID)
                throw new Error(`Expected chain ${BASE_SEPOLIA_CHAIN_ID}, got ${chainId}`);
            const code = await this.provider.getCode(BASE_SEPOLIA_USDC);
            const hasTokenBytecode = code !== "0x" && code !== "0x0";
            if (!hasTokenBytecode)
                throw new Error(`No USDC contract bytecode at ${BASE_SEPOLIA_USDC}`);
            return { ok: true, chainId, rpcUrl: this.options.rpcUrl ?? BASE_SEPOLIA_RPC_URL, asset: BASE_SEPOLIA_USDC, hasTokenBytecode };
        }
        catch (error) {
            // A failed health probe can open the mock circuit only before an
            // authorization exists. Never downgrade an already-authorized flow.
            if (PRE_AUTHORIZATION_STAGES.has(stageBeforePreflight))
                this.stage = "preflight_failed";
            return {
                ok: false,
                chainId: BASE_SEPOLIA_CHAIN_ID,
                rpcUrl: this.options.rpcUrl ?? BASE_SEPOLIA_RPC_URL,
                asset: BASE_SEPOLIA_USDC,
                hasTokenBytecode: false,
                error: error instanceof Error ? error.message : "Base Sepolia preflight failed",
            };
        }
    }
    static transactionUrl(txHash) {
        if (!/^0x[0-9a-fA-F]{64}$/.test(txHash))
            throw new Error("Only a live 32-byte transaction hash can have a Basescan URL");
        return `${BASE_SEPOLIA_EXPLORER_TX_URL}/${txHash}`;
    }
    transactionUrl(txHash) {
        return BaseSepoliaSubmitter.transactionUrl(txHash);
    }
    async submit(payload, requirements) {
        // A successful operation is terminal, but a submitter is reusable for
        // later payments. UNKNOWN deliberately is not reset and requires a new
        // submitter/explicit reconciliation boundary.
        if (this.stage === "submitted")
            this.stage = "discovered";
        this.validatePayment(payload, requirements);
        // A payload reaching submit contains an authorization. Mark this before
        // any RPC call so no error path can subsequently select mock mode.
        this.markAuthorizationIssued();
        if (this.mode === "mock")
            return this.submitMock();
        if (this.options.preflightOnSubmit) {
            const preflight = await this.preflight();
            if (!preflight.ok)
                throw new Error(preflight.error ?? "Base Sepolia preflight failed");
            this.stage = "authorized";
        }
        return this.submitOnchain(payload, requirements);
    }
    submitMock() {
        const txHash = this.options.mockTxHashFactory?.() ?? `mock:${randomUUID()}`;
        if (!txHash.startsWith("mock:"))
            throw new Error("Mock transaction IDs must use the mock: namespace");
        this.stage = "submitted";
        return { txHash, mode: "mock", simulated: true };
    }
    async submitOnchain(payload, requirements) {
        const contract = this.contract;
        if (!contract)
            throw new Error("On-chain settlement requires a signer or an injected authorization contract");
        const authorization = payload.payload.authorization;
        const signature = payload.payload.signature;
        const methodName = this.authorizationMethod(requirements);
        const method = contract[methodName];
        if (typeof method !== "function")
            throw new Error(`USDC contract does not support ${methodName}`);
        const from = authorization.from;
        const to = authorization.to;
        const value = authorization.value;
        const validAfter = authorization.validAfter;
        const validBefore = authorization.validBefore;
        const nonce = authorization.nonce;
        const args = [from, to, BigInt(value), BigInt(validAfter), BigInt(validBefore), nonce, signature];
        const callable = method;
        if (this.options.simulate !== false && callable.staticCall)
            await callable.staticCall(...args);
        let transaction;
        try {
            transaction = await callable(...args);
        }
        catch (error) {
            throw error;
        }
        if (!/^0x[0-9a-fA-F]{64}$/.test(transaction.hash))
            throw new Error("On-chain provider returned an invalid transaction hash");
        this.stage = "submitted";
        let receipt;
        try {
            receipt = transaction.wait ? await transaction.wait(this.options.confirmations ?? 1) : undefined;
        }
        catch (error) {
            this.stage = "unknown";
            throw withTxHash(new TimeoutUnknownOutcomeError(`Transaction ${transaction.hash} was broadcast but confirmation is unknown`), transaction.hash);
        }
        if (receipt && typeof receipt === "object" && "status" in receipt && receipt.status === 0) {
            throw withTxHash(new Error("ERC-3009 transaction reverted on Base Sepolia"), transaction.hash);
        }
        return {
            txHash: transaction.hash,
            ...(receipt !== undefined ? { receipt } : {}),
            mode: "onchain",
            simulated: false,
            explorerUrl: BaseSepoliaSubmitter.transactionUrl(transaction.hash),
        };
    }
    validatePayment(payload, requirements) {
        if (requirements.scheme !== "exact" || requirements.network !== BASE_SEPOLIA)
            throw new Error("BaseSepoliaSubmitter requires x402 exact on eip155:84532");
        if (!isAddressValue(requirements.asset) || getAddress(requirements.asset) !== getAddress(BASE_SEPOLIA_USDC))
            throw new Error("Payment asset is not Base Sepolia USDC");
        if (!payload || !payload.payload || typeof payload.payload !== "object")
            throw new Error("Payment payload is malformed");
        if (payload.accepted.scheme !== requirements.scheme || payload.accepted.network !== requirements.network || payload.accepted.amount !== requirements.amount || payload.accepted.asset.toLowerCase() !== requirements.asset.toLowerCase() || payload.accepted.payTo.toLowerCase() !== requirements.payTo.toLowerCase()) {
            throw new Error("Payment payload accepted requirements do not match settlement requirements");
        }
        const candidate = payload.payload;
        const authorization = candidate.authorization;
        if (!authorization || typeof candidate.signature !== "string")
            throw new Error("ERC-3009 authorization payload is malformed");
        for (const field of ["from", "to", "value", "validAfter", "validBefore", "nonce"]) {
            if (typeof authorization[field] !== "string")
                throw new Error(`ERC-3009 authorization field ${field} is required`);
        }
        if (!isAddressValue(authorization.from) || !isAddressValue(authorization.to))
            throw new Error("ERC-3009 authorization address is invalid");
        if (getAddress(authorization.to) !== getAddress(requirements.payTo))
            throw new Error("ERC-3009 recipient does not match payTo");
        if (authorization.value !== requirements.amount)
            throw new Error("ERC-3009 value does not match payment amount");
        if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce))
            throw new Error("ERC-3009 nonce must be bytes32");
        try {
            if (BigInt(authorization.value) < 0n || BigInt(authorization.validAfter) < 0n || BigInt(authorization.validBefore) < 0n)
                throw new Error("negative authorization value");
        }
        catch {
            throw new Error("ERC-3009 numeric field is invalid");
        }
    }
    authorizationMethod(requirements) {
        const configured = requirements.extra?.authorizationMethod ?? requirements.extra?.transferMethod ?? this.options.authorizationMethod;
        if (configured === "receiveWithAuthorization" || configured === "transferWithAuthorization")
            return configured;
        return "transferWithAuthorization";
    }
}
