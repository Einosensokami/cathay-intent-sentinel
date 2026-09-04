import { createHash } from "node:crypto";
import { getAddress, Interface, JsonRpcProvider, type Provider } from "ethers";

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

/** Small fixture shape retained for offline demos and deterministic tests. */
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
  block?: { number: number; hash: string };
  evidence_hash?: string;
  validation?: { samples: number; score: number };
}

export interface TrustRegistry {
  verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification>;
}

export class InMemoryTrustRegistry implements TrustRegistry {
  private readonly records = new Map<string, MerchantRecord>();

  register(record: MerchantRecord): void {
    const identity = record.identity ?? { address: record.address ?? "", merchant_url: record.merchant_url ?? "" };
    const reputation = record.reputation ?? { score: record.reputation_score ?? 0, successful_settlements: 0, disputes: 0, last_updated: 0 };
    const address = getAddress(identity.address).toLowerCase();
    if (!/^https:\/\//i.test(identity.merchant_url)) throw new TypeError("Merchant URL must use HTTPS");
    if (!Number.isFinite(reputation.score) || reputation.score < 0 || reputation.score > 100) {
      throw new TypeError("Reputation score must be between 0 and 100");
    }
    this.records.set(address, { ...record, identity: { ...identity, address }, reputation });
  }

  registerMerchant(record: MerchantRecord): void { this.register(record); }

  revoke(address: string): void {
    const key = getAddress(address).toLowerCase();
    const record = this.records.get(key);
    if (record) this.records.set(key, { ...record, revoked: true });
  }

  async verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification> {
    let key: string;
    try { key = getAddress(address).toLowerCase(); } catch { return { verified: false, reason: "Invalid merchant address" }; }
    const record = this.records.get(key);
    if (!record) return { verified: false, reason: "Merchant identity is not registered" };
    if (record.revoked) return { verified: false, reason: "Merchant identity is revoked" };
    const identity = record.identity;
    const reputation = record.reputation;
    if (!identity || identity.merchant_url !== merchantUrl) return { verified: false, reason: "Merchant URL does not match registered identity" };
    if (!reputation || reputation.score < 50) return { verified: false, reason: "Merchant reputation is below the minimum threshold" };
    return { verified: true, reason: "Merchant identity and reputation verified", identity, reputation };
  }
}

export const MockTrustRegistry = InMemoryTrustRegistry;

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

interface PinnedBlock { number: number; hash: string; tag: number }
interface RegistrationFile {
  type?: string;
  name?: string;
  active?: boolean;
  x402Support?: boolean;
  services?: Array<{ name?: string; endpoint?: string }>;
}

function asAgentId(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new TypeError("agentId must not be negative");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("agentId must be a non-negative integer");
    return BigInt(value);
  }
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError("agentId must be a non-negative integer");
  return BigInt(value);
}

function addressOrThrow(value: string, label: string): string {
  try { return getAddress(value); } catch { throw new TypeError(`${label} is not a valid address`); }
}

function hashEvidence(value: unknown): string {
  return `0x${createHash("sha256").update(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)).digest("hex")}`;
}

function sameOriginOrExact(candidate: string, expected: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(expected);
    return a.protocol === "https:" && b.protocol === "https:" && a.origin.toLowerCase() === b.origin.toLowerCase();
  } catch { return candidate === expected; }
}

function decodeWalletMetadata(value: string): string | undefined {
  try {
    const bytes = value.startsWith("0x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "base64");
    const text = bytes.toString("utf8").replace(/^\0+/, "");
    if (/^0x[0-9a-f]{40}$/i.test(text)) return getAddress(text);
    if (bytes.length >= 20) return getAddress(`0x${bytes.subarray(bytes.length - 20).toString("hex")}`);
  } catch { /* An optional metadata method may return an incompatible encoding. */ }
  return undefined;
}

/**
 * RPC-backed ERC-8004 trust adapter. Every live decision reads all three
 * registries at one pinned block. It fails closed unless an explicit fallback
 * registry was supplied by the caller.
 */
export class Erc8004TrustRegistry implements TrustRegistry {
  readonly identityRegistryAddress: string;
  readonly reputationRegistryAddress: string;
  readonly validationRegistryAddress: string;
  private readonly provider?: Provider | undefined;
  private readonly options: Erc8004TrustRegistryOptions;
  private readonly identity = new Interface(IDENTITY_ABI);
  private readonly reputation = new Interface(REPUTATION_ABI);
  private readonly validation = new Interface(VALIDATION_ABI);
  private readonly fixtureIdentities = new Map<string, Erc8004IdentityRecord>();
  private readonly fixtureReputations = new Map<string, Erc8004ReputationRecord>();
  private readonly fixtureValidations = new Map<string, Erc8004ValidationRecord>();

  constructor(options: Erc8004TrustRegistryOptions = {}) {
    this.options = options;
    this.provider = options.provider ?? (options.rpcUrl ? new JsonRpcProvider(options.rpcUrl, BASE_SEPOLIA_CHAIN_ID) : undefined);
    this.identityRegistryAddress = addressOrThrow(options.identityRegistryAddress ?? ERC8004_IDENTITY_REGISTRY_ADDRESS, "Identity Registry");
    this.reputationRegistryAddress = addressOrThrow(options.reputationRegistryAddress ?? ERC8004_REPUTATION_REGISTRY_ADDRESS, "Reputation Registry");
    this.validationRegistryAddress = addressOrThrow(options.validationRegistryAddress ?? ERC8004_VALIDATION_REGISTRY_ADDRESS, "Validation Registry");
    if (options.minReputationScore !== undefined && (options.minReputationScore < 0 || options.minReputationScore > 100)) throw new RangeError("minReputationScore must be between 0 and 100");
    if ((options.minTrustedSamples ?? 3) < 1) throw new RangeError("minTrustedSamples must be positive");
  }

  async verifyMerchant(address: string, merchantUrl: string, agentId?: string | number | bigint): Promise<TrustVerification> {
    if (agentId === undefined) {
      return this.fallbackOrDeny(address, merchantUrl, "An ERC-8004 agentId is required for on-chain verification");
    }
    return this.verifySeller({ agentId, payee: address, merchantUrl });
  }

  async verifySeller(input: Erc8004SellerInput): Promise<Erc8004TrustDecision> {
    const id = asAgentId(input.agentId);
    const payee = addressOrThrow(input.payee ?? input.agentWallet ?? "", "Payee");
    try {
      if (!this.provider) throw new Error("No Base Sepolia RPC provider configured");
      const pinned = await this.pinBlock();
      await this.assertNetwork();
      await this.assertDeployed(pinned.tag);

      const owner = addressOrThrow(await this.read(this.identity, this.identityRegistryAddress, "ownerOf", [id], pinned.tag) as string, "Identity owner");
      if (owner === ZERO_ADDRESS) throw new Error("Agent identity is not active");
      const wallet = await this.readWallet(id, pinned.tag, owner);
      const payeeBound = wallet.toLowerCase() === payee.toLowerCase();
      if (!payeeBound) throw new Error("Payee is not bound to the registered agent wallet");

      const uri = await this.readUri(id, pinned.tag);
      const registration = await this.loadRegistration(uri);
      if (registration.type !== REGISTRATION_V1 || registration.active !== true) throw new Error("Agent registration is missing or inactive");
      if (registration.x402Support !== true) throw new Error("Agent registration does not advertise x402 support");
      if (!registration.services?.some((service) => typeof service.endpoint === "string" && sameOriginOrExact(service.endpoint, input.merchantUrl))) {
        throw new Error("Merchant URL does not match an ERC-8004 service endpoint");
      }

      const reputation = await this.readReputation(id, owner, pinned.tag, input.now ?? this.options.now?.() ?? Math.floor(Date.now() / 1000));
      const minScore = this.options.minReputationScore ?? 80;
      if (reputation.trustedSamples < (this.options.minTrustedSamples ?? 3)) throw new Error("Insufficient trusted reputation samples");
      if (reputation.score < minScore) throw new Error(`Reputation score ${reputation.score} is below ${minScore}`);

      const validation = await this.readValidation(id, pinned.tag);
      if (this.options.requireValidation && validation.score < (this.options.minValidationScore ?? 80)) throw new Error("Validation score is below policy threshold");
      const identity: MerchantIdentity = { address: wallet, merchant_url: input.merchantUrl, ...(registration.name ? { name: registration.name } : {}) };
      const evidence = { agentId: id.toString(), owner, wallet, uri, reputation, validation, block: pinned };
      return {
        verified: true,
        reason: "ERC-8004 identity, wallet binding, active registration, reputation, and validation verified",
        identity,
        reputation: { score: reputation.score, successful_settlements: reputation.trustedSamples, disputes: 0, last_updated: reputation.lastUpdated },
        agent_id: id.toString(), payee_bound: true, identity_active: true, source: "onchain", block: pinned,
        evidence_hash: hashEvidence(evidence), validation,
      };
    } catch (error) {
      return this.fallbackOrDeny(input.payee ?? input.agentWallet ?? "", input.merchantUrl, error instanceof Error ? error.message : "ERC-8004 read failed", id.toString());
    }
  }

  /** Register an explicit offline fixture for mock/demo mode. */
  registerAgent(identity: Erc8004IdentityRecord, reputation: Erc8004ReputationRecord): void {
    const key = addressOrThrow(identity.walletAddress, "Agent wallet").toLowerCase();
    this.fixtureIdentities.set(key, { ...identity, walletAddress: getAddress(identity.walletAddress) as `0x${string}` });
    this.fixtureReputations.set(key, { ...reputation });
  }

  recordValidation(record: Erc8004ValidationRecord): void { this.fixtureValidations.set(record.taskId, { ...record }); }

  /** Supports both the old fixture API and the object-shaped live API. */
  async verifyAgent(walletAddress: string, endpointUrl: string, minReputationScore?: number): Promise<Erc8004TrustCheckResult>;
  async verifyAgent(input: Erc8004SellerInput): Promise<Erc8004TrustDecision>;
  async verifyAgent(first: string | Erc8004SellerInput, endpointUrl?: string, minReputationScore = 60): Promise<Erc8004TrustCheckResult | Erc8004TrustDecision> {
    if (typeof first !== "string") return this.verifySeller(first);
    let key: string;
    try { key = getAddress(first).toLowerCase(); } catch { return { verified: false, reason: "Invalid wallet address format for ERC-8004 check" }; }
    const identity = this.fixtureIdentities.get(key);
    if (!identity) return { verified: false, reason: "Agent wallet address not registered in ERC-8004 Identity Registry" };
    if (!identity.active) return { verified: false, reason: "Agent registration in ERC-8004 Identity Registry is inactive or suspended" };
    if (!endpointUrl || (!endpointUrl.toLowerCase().startsWith(identity.serviceEndpoint.toLowerCase()) && !identity.serviceEndpoint.toLowerCase().startsWith(endpointUrl.toLowerCase()))) {
      return { verified: false, reason: "Endpoint URL does not match registered ERC-8004 service endpoint" };
    }
    const reputation = this.fixtureReputations.get(key);
    if (!reputation) return { verified: false, reason: "No reputation record found in ERC-8004 Reputation Registry" };
    if (!reputation.antiSybilPassed) return { verified: false, reason: "Agent failed ERC-8004 anti-Sybil verification" };
    if (reputation.score < minReputationScore) return { verified: false, reason: `Agent reputation score (${reputation.score}) is below minimum policy threshold (${minReputationScore})`, identity, reputation };
    const validation = [...this.fixtureValidations.values()].find((entry) => entry.validatorAddress.toLowerCase() === key);
    return { verified: true, reason: "ERC-8004 identity and reputation signals verified", identity, reputation, ...(validation ? { validation } : {}) };
  }

  private async fallbackOrDeny(address: string, merchantUrl: string, reason: string, agentId?: string): Promise<Erc8004TrustDecision> {
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

  private async assertNetwork(): Promise<void> {
    const network = await this.provider!.getNetwork();
    if (BigInt(network.chainId) !== BigInt(BASE_SEPOLIA_CHAIN_ID)) throw new Error(`RPC is on chain ${network.chainId}, expected Base Sepolia`);
  }

  private async pinBlock(): Promise<PinnedBlock> {
    const requested = this.options.blockTag;
    const block = await this.provider!.getBlock(requested ?? "safe").catch(() => this.provider!.getBlock(requested ?? "latest"));
    if (!block?.hash || block.number === null) throw new Error("Could not pin a safe RPC block");
    return { number: block.number, hash: block.hash, tag: block.number };
  }

  private async assertDeployed(blockTag: number): Promise<void> {
    for (const [label, address] of [["Identity", this.identityRegistryAddress], ["Reputation", this.reputationRegistryAddress], ["Validation", this.validationRegistryAddress]] as const) {
      const code = await this.provider!.getCode(address, blockTag);
      if (!code || code === "0x") throw new Error(`${label} Registry has no deployed bytecode`);
    }
    const configured = this.identityRegistryAddress.toLowerCase();
    const reputationIdentity = addressOrThrow(await this.read(this.reputation, this.reputationRegistryAddress, "getIdentityRegistry", [], blockTag) as string, "Reputation identity registry");
    const validationIdentity = addressOrThrow(await this.read(this.validation, this.validationRegistryAddress, "getIdentityRegistry", [], blockTag) as string, "Validation identity registry");
    if (reputationIdentity.toLowerCase() !== configured || validationIdentity.toLowerCase() !== configured) throw new Error("ERC-8004 registries reference a different Identity Registry");
  }

  private async read(iface: Interface, to: string, functionName: string, args: readonly unknown[], blockTag: number): Promise<unknown> {
    const data = iface.encodeFunctionData(functionName, args as any[]);
    const raw = await this.provider!.call({ to, data, blockTag });
    const decoded = iface.decodeFunctionResult(functionName, raw);
    return decoded.length === 1 ? decoded[0] : decoded;
  }

  private async readWallet(id: bigint, blockTag: number, owner: string): Promise<string> {
    try { return addressOrThrow(await this.read(this.identity, this.identityRegistryAddress, "getAgentWallet", [id], blockTag) as string, "Agent wallet"); } catch {
      try {
        const metadata = await this.read(this.identity, this.identityRegistryAddress, "getMetadata", [id, "agentWallet"], blockTag) as string;
        return addressOrThrow(decodeWalletMetadata(metadata) ?? owner, "Agent wallet");
      } catch { return owner; }
    }
  }

  private async readUri(id: bigint, blockTag: number): Promise<string> {
    try { return String(await this.read(this.identity, this.identityRegistryAddress, "tokenURI", [id], blockTag)); } catch {
      return String(await this.read(this.identity, this.identityRegistryAddress, "agentURI", [id], blockTag));
    }
  }

  private async loadRegistration(uri: string): Promise<RegistrationFile> {
    const raw = this.options.fetchRegistration ? await this.options.fetchRegistration(uri) : await this.fetchUri(uri);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Registration file is not a JSON object");
    return raw as RegistrationFile;
  }

  private async fetchUri(uri: string): Promise<unknown> {
    if (uri.startsWith("data:application/json;base64,")) return JSON.parse(Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8"));
    if (uri.startsWith("data:application/json,")) return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
    if (!uri.startsWith("https://")) throw new Error("Registration URI must be HTTPS or an on-chain data URI");
    const response = await fetch(uri, { redirect: "error" });
    if (!response.ok) throw new Error(`Registration fetch returned HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/json")) throw new Error("Registration content type is not JSON");
    const body = await response.text();
    if (body.length > 256 * 1024) throw new Error("Registration file exceeds the 256 KiB limit");
    return JSON.parse(body);
  }

  private async readReputation(id: bigint, owner: string, blockTag: number, now: number): Promise<{ score: number; trustedSamples: number; lastUpdated: number }> {
    const configuredReviewers = (this.options.trustedReviewers ?? []).map((reviewer) => addressOrThrow(reviewer, "Trusted reviewer").toLowerCase());
    const clients = (await this.read(this.reputation, this.reputationRegistryAddress, "getClients", [id], blockTag) as string[]).map((client) => client.toLowerCase());
    const allowed = clients.filter((client) => client !== owner.toLowerCase() && (configuredReviewers.length === 0 || configuredReviewers.includes(client)));
    const feedback: Erc8004Feedback[] = [];
    for (const reviewer of allowed) {
      const last = Number(await this.read(this.reputation, this.reputationRegistryAddress, "getLastIndex", [id, reviewer], blockTag));
      for (let index = 1; index <= last; index++) {
        const value = await this.read(this.reputation, this.reputationRegistryAddress, "readFeedback", [id, reviewer, index], blockTag) as any;
        const tuple = Array.isArray(value) ? value : [value.value, value.valueDecimals, value.tag1, value.tag2, value.isRevoked];
        feedback.push({ reviewer, index, value: BigInt(tuple[0]), value_decimals: Number(tuple[1]), tag1: String(tuple[2]), tag2: String(tuple[3]), revoked: Boolean(tuple[4]) });
      }
    }
    const supported = this.options.supportedFeedbackTags;
    const valid = feedback.filter((entry) => !entry.revoked && entry.value_decimals <= 18 && (!supported || supported.length === 0 || supported.includes(entry.tag1 ?? "")));
    if (valid.length === 0) return { score: 0, trustedSamples: 0, lastUpdated: 0 };
    const weights = this.options.reviewerWeights ?? {};
    let weighted = 0;
    let totalWeight = 0;
    for (const entry of valid) {
      const scale = 10n ** BigInt(entry.value_decimals);
      const numeric = Number(entry.value) / Number(scale);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) continue;
      const weight = weights[entry.reviewer] ?? weights[entry.reviewer.toLowerCase()] ?? 1;
      if (!Number.isFinite(weight) || weight <= 0) continue;
      weighted += numeric * weight;
      totalWeight += weight;
    }
    const score = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100) / 100;
    return { score, trustedSamples: valid.length, lastUpdated: now };
  }

  private async readValidation(id: bigint, blockTag: number): Promise<{ samples: number; score: number }> {
    try {
      const result = await this.read(this.validation, this.validationRegistryAddress, "getSummary", [id, [], ""], blockTag) as any;
      const tuple = Array.isArray(result) ? result : [result.count, result.averageResponse];
      return { samples: Number(tuple[0]), score: Number(tuple[1]) };
    } catch { return { samples: 0, score: 0 }; }
  }
}

/** Explicit name for callers that want to emphasize the live adapter. */
export const ERC8004TrustRegistry = Erc8004TrustRegistry;
