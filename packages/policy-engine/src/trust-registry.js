import { createHash } from "node:crypto";
import { getAddress, Interface, JsonRpcProvider } from "ethers";
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const ERC8004_IDENTITY_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
export const ERC8004_REPUTATION_REGISTRY_ADDRESS = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
// The ERC-8004 Validation Registry is a separate deployment and remains
// environment-overridable because the standard is still a draft.
export const ERC8004_VALIDATION_REGISTRY_ADDRESS = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
const IDENTITY_ABI = [
    "function ownerOf(uint256 agentId) view returns (address)",
    "function tokenURI(uint256 agentId) view returns (string)",
    "function agentURI(uint256 agentId) view returns (string)",
    "function getAgentWallet(uint256 agentId) view returns (address)",
    "function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)",
];
const REPUTATION_ABI = [
    "function getIdentityRegistry() view returns (address)",
    "function getClients(uint256 agentId) view returns (address[])",
    "function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)",
    "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)",
    "function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)",
];
const VALIDATION_ABI = [
    "function getIdentityRegistry() view returns (address)",
    "function getSummary(uint256 agentId, address[] validatorAddresses, string tag) view returns (uint64 count, uint8 averageResponse)",
];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const REGISTRATION_V1 = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
export class InMemoryTrustRegistry {
    records = new Map();
    register(record) {
        const identity = record.identity ?? { address: record.address ?? "", merchant_url: record.merchant_url ?? "" };
        const reputation = record.reputation ?? { score: record.reputation_score ?? 0, successful_settlements: 0, disputes: 0, last_updated: 0 };
        const address = getAddress(identity.address).toLowerCase();
        if (!/^https:\/\//i.test(identity.merchant_url))
            throw new TypeError("Merchant URL must use HTTPS");
        if (!Number.isFinite(reputation.score) || reputation.score < 0 || reputation.score > 100) {
            throw new TypeError("Reputation score must be between 0 and 100");
        }
        this.records.set(address, { ...record, identity: { ...identity, address }, reputation });
    }
    registerMerchant(record) { this.register(record); }
    revoke(address) {
        const key = getAddress(address).toLowerCase();
        const record = this.records.get(key);
        if (record)
            this.records.set(key, { ...record, revoked: true });
    }
    async verifyMerchant(address, merchantUrl) {
        let key;
        try {
            key = getAddress(address).toLowerCase();
        }
        catch {
            return { verified: false, reason: "Invalid merchant address" };
        }
        const record = this.records.get(key);
        if (!record)
            return { verified: false, reason: "Merchant identity is not registered" };
        if (record.revoked)
            return { verified: false, reason: "Merchant identity is revoked" };
        const identity = record.identity;
        const reputation = record.reputation;
        if (!identity || identity.merchant_url !== merchantUrl)
            return { verified: false, reason: "Merchant URL does not match registered identity" };
        if (!reputation || reputation.score < 50)
            return { verified: false, reason: "Merchant reputation is below the minimum threshold" };
        return { verified: true, reason: "Merchant identity and reputation verified", identity, reputation };
    }
}
export const MockTrustRegistry = InMemoryTrustRegistry;
function asAgentId(value) {
    if (typeof value === "bigint") {
        if (value < 0n)
            throw new TypeError("agentId must not be negative");
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value) || value < 0)
            throw new TypeError("agentId must be a non-negative integer");
        return BigInt(value);
    }
    if (!/^(0|[1-9][0-9]*)$/.test(value))
        throw new TypeError("agentId must be a non-negative integer");
    return BigInt(value);
}
function addressOrThrow(value, label) {
    try {
        return getAddress(value);
    }
    catch {
        throw new TypeError(`${label} is not a valid address`);
    }
}
function hashEvidence(value) {
    return `0x${createHash("sha256").update(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex")}`;
}
function sameOriginOrExact(candidate, expected) {
    try {
        const a = new URL(candidate);
        const b = new URL(expected);
        return a.protocol === "https:" && b.protocol === "https:" && a.origin.toLowerCase() === b.origin.toLowerCase();
    }
    catch {
        return candidate === expected;
    }
}
function decodeWalletMetadata(value) {
    try {
        const bytes = value.startsWith("0x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "base64");
        const text = bytes.toString("utf8").replace(/^\0+/, "");
        if (/^0x[0-9a-f]{40}$/i.test(text))
            return getAddress(text);
        if (bytes.length >= 20)
            return getAddress(`0x${bytes.subarray(bytes.length - 20).toString("hex")}`);
    }
    catch { /* An optional metadata method may return an incompatible encoding. */ }
    return undefined;
}
/**
 * RPC-backed ERC-8004 trust adapter. Every live decision reads all three
 * registries at one pinned block. It fails closed unless an explicit fallback
 * registry was supplied by the caller.
 */
export class Erc8004TrustRegistry {
    identityRegistryAddress;
    reputationRegistryAddress;
    validationRegistryAddress;
    provider;
    options;
    identity = new Interface(IDENTITY_ABI);
    reputation = new Interface(REPUTATION_ABI);
    validation = new Interface(VALIDATION_ABI);
    constructor(options = {}) {
        this.options = options;
        this.provider = options.provider ?? (options.rpcUrl ? new JsonRpcProvider(options.rpcUrl, BASE_SEPOLIA_CHAIN_ID) : undefined);
        this.identityRegistryAddress = addressOrThrow(options.identityRegistryAddress ?? ERC8004_IDENTITY_REGISTRY_ADDRESS, "Identity Registry");
        this.reputationRegistryAddress = addressOrThrow(options.reputationRegistryAddress ?? ERC8004_REPUTATION_REGISTRY_ADDRESS, "Reputation Registry");
        this.validationRegistryAddress = addressOrThrow(options.validationRegistryAddress ?? ERC8004_VALIDATION_REGISTRY_ADDRESS, "Validation Registry");
        if (options.minReputationScore !== undefined && (options.minReputationScore < 0 || options.minReputationScore > 100))
            throw new RangeError("minReputationScore must be between 0 and 100");
        if ((options.minTrustedSamples ?? 3) < 1)
            throw new RangeError("minTrustedSamples must be positive");
    }
    async verifyMerchant(address, merchantUrl, agentId) {
        if (agentId === undefined) {
            return this.fallbackOrDeny(address, merchantUrl, "An ERC-8004 agentId is required for on-chain verification");
        }
        return this.verifySeller({ agentId, payee: address, merchantUrl });
    }
    async verifySeller(input) {
        const id = asAgentId(input.agentId);
        const payee = addressOrThrow(input.payee ?? input.agentWallet ?? "", "Payee");
        try {
            if (!this.provider)
                throw new Error("No Base Sepolia RPC provider configured");
            const pinned = await this.pinBlock();
            await this.assertNetwork();
            await this.assertDeployed(pinned.tag);
            const owner = addressOrThrow(await this.read(this.identity, this.identityRegistryAddress, "ownerOf", [id], pinned.tag), "Identity owner");
            if (owner === ZERO_ADDRESS)
                throw new Error("Agent identity is not active");
            const wallet = await this.readWallet(id, pinned.tag, owner);
            const payeeBound = wallet.toLowerCase() === payee.toLowerCase();
            if (!payeeBound)
                throw new Error("Payee is not bound to the registered agent wallet");
            const uri = await this.readUri(id, pinned.tag);
            const registration = await this.loadRegistration(uri);
            if (registration.type !== REGISTRATION_V1 || registration.active !== true)
                throw new Error("Agent registration is missing or inactive");
            if (registration.x402Support !== true)
                throw new Error("Agent registration does not advertise x402 support");
            if (!registration.services?.some((service) => typeof service.endpoint === "string" && sameOriginOrExact(service.endpoint, input.merchantUrl))) {
                throw new Error("Merchant URL does not match an ERC-8004 service endpoint");
            }
            const reputation = await this.readReputation(id, owner, pinned.tag, input.now ?? this.options.now?.() ?? Math.floor(Date.now() / 1000));
            const minScore = this.options.minReputationScore ?? 80;
            if (reputation.trustedSamples < (this.options.minTrustedSamples ?? 3))
                throw new Error("Insufficient trusted reputation samples");
            if (reputation.score < minScore)
                throw new Error(`Reputation score ${reputation.score} is below ${minScore}`);
            const validation = await this.readValidation(id, pinned.tag);
            if (this.options.requireValidation && validation.score < (this.options.minValidationScore ?? 80))
                throw new Error("Validation score is below policy threshold");
            const identity = { address: wallet, merchant_url: input.merchantUrl, ...(registration.name ? { name: registration.name } : {}) };
            const evidence = { agentId: id.toString(), owner, wallet, uri, reputation, validation, block: pinned };
            return {
                verified: true,
                reason: "ERC-8004 identity, wallet binding, active registration, reputation, and validation verified",
                identity,
                reputation: { score: reputation.score, successful_settlements: reputation.trustedSamples, disputes: 0, last_updated: reputation.lastUpdated },
                agent_id: id.toString(), payee_bound: true, identity_active: true, source: "onchain", block: pinned,
                evidence_hash: hashEvidence(evidence), validation,
            };
        }
        catch (error) {
            return this.fallbackOrDeny(input.payee ?? input.agentWallet ?? "", input.merchantUrl, error instanceof Error ? error.message : "ERC-8004 read failed", id.toString());
        }
    }
    /** Descriptive alias used by the architecture and integration callers. */
    verifyAgent(input) { return this.verifySeller(input); }
    async fallbackOrDeny(address, merchantUrl, reason, agentId) {
        if (this.options.fallback && this.options.fallbackOnError !== false) {
            const fallback = await this.options.fallback.verifyMerchant(address, merchantUrl);
            return {
                ...fallback,
                verified: fallback.verified,
                reason: `Live ERC-8004 verification unavailable; explicit fallback used: ${fallback.reason}`,
                source: "fallback",
                agent_id: agentId ?? "unknown",
                payee_bound: fallback.verified,
                identity_active: fallback.verified,
                reputation: fallback.reputation ?? { score: 0, successful_settlements: 0, disputes: 0, last_updated: 0 },
            };
        }
        return {
            verified: false, reason: `ERC-8004 verification failed closed: ${reason}`, source: "fallback",
            agent_id: agentId ?? "unknown", payee_bound: false, identity_active: false,
            reputation: { score: 0, successful_settlements: 0, disputes: 0, last_updated: 0 },
        };
    }
    async assertNetwork() {
        const network = await this.provider.getNetwork();
        if (BigInt(network.chainId) !== BigInt(BASE_SEPOLIA_CHAIN_ID))
            throw new Error(`RPC is on chain ${network.chainId}, expected Base Sepolia`);
    }
    async pinBlock() {
        const requested = this.options.blockTag;
        const block = await this.provider.getBlock(requested ?? "safe").catch(() => this.provider.getBlock(requested ?? "latest"));
        if (!block?.hash || block.number === null)
            throw new Error("Could not pin a safe RPC block");
        return { number: block.number, hash: block.hash, tag: block.number };
    }
    async assertDeployed(blockTag) {
        for (const [label, address] of [["Identity", this.identityRegistryAddress], ["Reputation", this.reputationRegistryAddress], ["Validation", this.validationRegistryAddress]]) {
            const code = await this.provider.getCode(address, blockTag);
            if (!code || code === "0x")
                throw new Error(`${label} Registry has no deployed bytecode`);
        }
        const configured = this.identityRegistryAddress.toLowerCase();
        const reputationIdentity = addressOrThrow(await this.read(this.reputation, this.reputationRegistryAddress, "getIdentityRegistry", [], blockTag), "Reputation identity registry");
        const validationIdentity = addressOrThrow(await this.read(this.validation, this.validationRegistryAddress, "getIdentityRegistry", [], blockTag), "Validation identity registry");
        if (reputationIdentity.toLowerCase() !== configured || validationIdentity.toLowerCase() !== configured)
            throw new Error("ERC-8004 registries reference a different Identity Registry");
    }
    async read(iface, to, functionName, args, blockTag) {
        const data = iface.encodeFunctionData(functionName, args);
        const raw = await this.provider.call({ to, data }, blockTag);
        const decoded = iface.decodeFunctionResult(functionName, raw);
        return decoded.length === 1 ? decoded[0] : decoded;
    }
    async readWallet(id, blockTag, owner) {
        try {
            return addressOrThrow(await this.read(this.identity, this.identityRegistryAddress, "getAgentWallet", [id], blockTag), "Agent wallet");
        }
        catch {
            try {
                const metadata = await this.read(this.identity, this.identityRegistryAddress, "getMetadata", [id, "agentWallet"], blockTag);
                return addressOrThrow(decodeWalletMetadata(metadata) ?? owner, "Agent wallet");
            }
            catch {
                return owner;
            }
        }
    }
    async readUri(id, blockTag) {
        try {
            return String(await this.read(this.identity, this.identityRegistryAddress, "tokenURI", [id], blockTag));
        }
        catch {
            return String(await this.read(this.identity, this.identityRegistryAddress, "agentURI", [id], blockTag));
        }
    }
    async loadRegistration(uri) {
        const raw = this.options.fetchRegistration ? await this.options.fetchRegistration(uri) : await this.fetchUri(uri);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            throw new Error("Registration file is not a JSON object");
        return raw;
    }
    async fetchUri(uri) {
        if (uri.startsWith("data:application/json;base64,"))
            return JSON.parse(Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8"));
        if (uri.startsWith("data:application/json,"))
            return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
        if (!uri.startsWith("https://"))
            throw new Error("Registration URI must be HTTPS or an on-chain data URI");
        const response = await fetch(uri, { redirect: "error" });
        if (!response.ok)
            throw new Error(`Registration fetch returned HTTP ${response.status}`);
        const type = response.headers.get("content-type") ?? "";
        if (!type.toLowerCase().includes("application/json"))
            throw new Error("Registration content type is not JSON");
        const body = await response.text();
        if (body.length > 256 * 1024)
            throw new Error("Registration file exceeds the 256 KiB limit");
        return JSON.parse(body);
    }
    async readReputation(id, owner, blockTag, now) {
        const configuredReviewers = (this.options.trustedReviewers ?? []).map((reviewer) => addressOrThrow(reviewer, "Trusted reviewer").toLowerCase());
        const clients = (await this.read(this.reputation, this.reputationRegistryAddress, "getClients", [id], blockTag)).map((client) => client.toLowerCase());
        const allowed = clients.filter((client) => client !== owner.toLowerCase() && (configuredReviewers.length === 0 || configuredReviewers.includes(client)));
        const feedback = [];
        for (const reviewer of allowed) {
            const last = Number(await this.read(this.reputation, this.reputationRegistryAddress, "getLastIndex", [id, reviewer], blockTag));
            for (let index = 1; index <= last; index++) {
                const value = await this.read(this.reputation, this.reputationRegistryAddress, "readFeedback", [id, reviewer, index], blockTag);
                const tuple = Array.isArray(value) ? value : [value.value, value.valueDecimals, value.tag1, value.tag2, value.isRevoked];
                feedback.push({ reviewer, index, value: BigInt(tuple[0]), value_decimals: Number(tuple[1]), tag1: String(tuple[2]), tag2: String(tuple[3]), revoked: Boolean(tuple[4]) });
            }
        }
        const supported = this.options.supportedFeedbackTags;
        const valid = feedback.filter((entry) => !entry.revoked && entry.value_decimals <= 18 && (!supported || supported.length === 0 || supported.includes(entry.tag1 ?? "")));
        if (valid.length === 0)
            return { score: 0, trustedSamples: 0, lastUpdated: 0 };
        const weights = this.options.reviewerWeights ?? {};
        let weighted = 0;
        let totalWeight = 0;
        for (const entry of valid) {
            const scale = 10n ** BigInt(entry.value_decimals);
            const numeric = Number(entry.value) / Number(scale);
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100)
                continue;
            const weight = weights[entry.reviewer] ?? weights[entry.reviewer.toLowerCase()] ?? 1;
            if (!Number.isFinite(weight) || weight <= 0)
                continue;
            weighted += numeric * weight;
            totalWeight += weight;
        }
        const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100) / 100;
        return { score, trustedSamples: valid.length, lastUpdated: now };
    }
    async readValidation(id, blockTag) {
        try {
            const result = await this.read(this.validation, this.validationRegistryAddress, "getSummary", [id, [], ""], blockTag);
            const tuple = Array.isArray(result) ? result : [result.count, result.averageResponse];
            return { samples: Number(tuple[0]), score: Number(tuple[1]) };
        }
        catch {
            return { samples: 0, score: 0 };
        }
    }
}
/** Explicit name for callers that want to emphasize the live adapter. */
export const ERC8004TrustRegistry = Erc8004TrustRegistry;
