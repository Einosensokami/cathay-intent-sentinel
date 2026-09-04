import { concatHex, hashTypedData, keccak256, recoverTypedDataAddress, type Hex } from "viem";

const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;

export const NEGOTIATION_PROTOCOL = "intent-sentinel/negotiation-v1" as const;

export interface NegotiationSla {
  deliverBy: number;
  availabilityBps: number;
  stakeRequired: string;
}

export type NegotiationMessageKind = "offer" | "counter" | "accept" | "reject";

export interface NegotiationMessage {
  protocol: typeof NEGOTIATION_PROTOCOL;
  sessionId: string;
  round: number;
  kind: NegotiationMessageKind;
  buyerAgentId: string;
  sellerAgentId: string;
  resourceHash: Hex;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  asset: string;
  network: string;
  sla: NegotiationSla;
  validUntil: number;
  previousMessageHash: Hex;
  signature: Hex;
}

export interface NegotiationSigner {
  address: string;
  signTypedData: (parameters: {
    domain: NegotiationDomain;
    types: typeof NEGOTIATION_MESSAGE_TYPES | typeof NEGOTIATION_COMMITMENT_TYPES;
    primaryType: "NegotiationMessage" | "NegotiationCommitment";
    message: Record<string, unknown>;
  }) => Promise<string>;
}

export interface NegotiationDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract?: string;
}

export interface NegotiationInput {
  sessionId?: string;
  buyerAgentId: string;
  sellerAgentId: string;
  resourceHash: Hex;
  quantity: string;
  listUnitPrice: string;
  buyerCeiling: string;
  sellerFloor: string;
  volumeDiscountBps?: number;
  asset: string;
  network: string;
  sla: NegotiationSla;
  validUntil: number;
}

export interface NegotiatedTerms {
  sessionId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  resourceHash: Hex;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  asset: string;
  network: string;
  sla: NegotiationSla;
  validUntil: number;
}

export interface NegotiationCommitment {
  terms: NegotiatedTerms;
  transcriptHash: Hex;
  buyerAddress: string;
  sellerAddress: string;
  buyerSignature: Hex;
  sellerSignature: Hex;
  commitmentHash: Hex;
}

export interface NegotiationResult {
  sessionId: string;
  messages: NegotiationMessage[];
  accepted: NegotiatedTerms;
  originalTotal: string;
  savings: string;
  savingsBps: number;
  transcriptHash: Hex;
  commitment: NegotiationCommitment;
}

const NEGOTIATION_MESSAGE_TYPES = {
  SlaTerms: [
    { name: "deliverBy", type: "uint256" },
    { name: "availabilityBps", type: "uint256" },
    { name: "stakeRequired", type: "uint256" },
  ],
  NegotiationMessage: [
    { name: "protocol", type: "string" },
    { name: "sessionId", type: "string" },
    { name: "round", type: "uint256" },
    { name: "kind", type: "string" },
    { name: "buyerAgentId", type: "string" },
    { name: "sellerAgentId", type: "string" },
    { name: "resourceHash", type: "bytes32" },
    { name: "quantity", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "totalPrice", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "network", type: "string" },
    { name: "sla", type: "SlaTerms" },
    { name: "validUntil", type: "uint256" },
    { name: "previousMessageHash", type: "bytes32" },
  ],
} as const;

const NEGOTIATION_COMMITMENT_TYPES = {
  NegotiationCommitment: [
    { name: "sessionId", type: "string" },
    { name: "transcriptHash", type: "bytes32" },
    { name: "resourceHash", type: "bytes32" },
    { name: "quantity", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "totalPrice", type: "uint256" },
    { name: "asset", type: "address" },
    { name: "network", type: "string" },
    { name: "validUntil", type: "uint256" },
  ],
} as const;

export { NEGOTIATION_MESSAGE_TYPES, NEGOTIATION_COMMITMENT_TYPES };

export interface A2ANegotiatorOptions {
  buyer: NegotiationSigner;
  seller: NegotiationSigner;
  domain?: NegotiationDomain;
  maxRounds?: number;
  clock?: () => number;
}

function atomic(value: string, field: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error(`${field} must be a non-negative decimal integer string`);
  return BigInt(value);
}

function address(value: string, field: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${field} must be an EVM address`);
}

function bytes32(value: string, field: string): asserts value is Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${field} must be a 32-byte hex value`);
}

function networkChainId(network: string): number {
  const match = /^eip155:(\d+)$/.exec(network);
  if (!match) throw new Error("negotiation network must be a CAIP-2 EVM network");
  const chainId = Number(match[1]);
  if (!Number.isSafeInteger(chainId)) throw new Error("negotiation chain ID is not safe");
  return chainId;
}

function messageData(message: NegotiationMessage): Record<string, unknown> {
  return {
    protocol: message.protocol,
    sessionId: message.sessionId,
    round: BigInt(message.round),
    kind: message.kind,
    buyerAgentId: message.buyerAgentId,
    sellerAgentId: message.sellerAgentId,
    resourceHash: message.resourceHash,
    quantity: BigInt(message.quantity),
    unitPrice: BigInt(message.unitPrice),
    totalPrice: BigInt(message.totalPrice),
    asset: message.asset,
    network: message.network,
    sla: {
      deliverBy: BigInt(message.sla.deliverBy),
      availabilityBps: BigInt(message.sla.availabilityBps),
      stakeRequired: BigInt(message.sla.stakeRequired),
    },
    validUntil: BigInt(message.validUntil),
    previousMessageHash: message.previousMessageHash,
  };
}

function commitmentData(result: Pick<NegotiationResult, "accepted" | "transcriptHash">): Record<string, unknown> {
  const terms = result.accepted;
  return {
    sessionId: terms.sessionId,
    transcriptHash: result.transcriptHash,
    resourceHash: terms.resourceHash,
    quantity: BigInt(terms.quantity),
    unitPrice: BigInt(terms.unitPrice),
    totalPrice: BigInt(terms.totalPrice),
    asset: terms.asset,
    network: terms.network,
    validUntil: BigInt(terms.validUntil),
  };
}

function typedMessageHash(message: NegotiationMessage, domain: NegotiationDomain): Hex {
  return hashTypedData({
    domain,
    types: NEGOTIATION_MESSAGE_TYPES,
    primaryType: "NegotiationMessage",
    message: messageData(message),
  } as never);
}

function typedCommitmentHash(result: Pick<NegotiationResult, "accepted" | "transcriptHash">, domain: NegotiationDomain): Hex {
  return hashTypedData({
    domain,
    types: NEGOTIATION_COMMITMENT_TYPES,
    primaryType: "NegotiationCommitment",
    message: commitmentData(result),
  } as never);
}

function appendTranscript(previous: Hex, current: Hex): Hex {
  return keccak256(concatHex([previous, current]));
}

function termsFromMessage(message: NegotiationMessage): NegotiatedTerms {
  return {
    sessionId: message.sessionId,
    buyerAgentId: message.buyerAgentId,
    sellerAgentId: message.sellerAgentId,
    resourceHash: message.resourceHash,
    quantity: message.quantity,
    unitPrice: message.unitPrice,
    totalPrice: message.totalPrice,
    asset: message.asset,
    network: message.network,
    sla: { ...message.sla },
    validUntil: message.validUntil,
  };
}

async function signMessage(message: NegotiationMessage, signer: NegotiationSigner, domain: NegotiationDomain): Promise<NegotiationMessage> {
  const signature = await signer.signTypedData({
    domain,
    types: NEGOTIATION_MESSAGE_TYPES,
    primaryType: "NegotiationMessage",
    message: messageData(message),
  });
  return { ...message, signature: signature as Hex };
}

function nextMessage(input: NegotiatedTerms, kind: NegotiationMessageKind, round: number, previousMessageHash: Hex): NegotiationMessage {
  return {
    protocol: NEGOTIATION_PROTOCOL,
    sessionId: input.sessionId,
    round,
    kind,
    buyerAgentId: input.buyerAgentId,
    sellerAgentId: input.sellerAgentId,
    resourceHash: input.resourceHash,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    totalPrice: input.totalPrice,
    asset: input.asset,
    network: input.network,
    sla: { ...input.sla },
    validUntil: input.validUntil,
    previousMessageHash,
    signature: "0x" as Hex,
  };
}

export class A2ANegotiator {
  private readonly maxRounds: number;
  private readonly clock: () => number;
  private readonly domain: NegotiationDomain;

  public constructor(private readonly options: A2ANegotiatorOptions) {
    this.maxRounds = options.maxRounds ?? 3;
    if (!Number.isSafeInteger(this.maxRounds) || this.maxRounds < 2 || this.maxRounds > 3) {
      throw new TypeError("A2A negotiation supports two or three signed rounds");
    }
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.domain = options.domain ?? { name: "IntentSentinel Negotiation", version: "1", chainId: 84532 };
    address(options.buyer.address, "buyer signer address");
    address(options.seller.address, "seller signer address");
  }

  public async negotiate(input: NegotiationInput): Promise<NegotiationResult> {
    const quantity = atomic(input.quantity, "quantity");
    if (quantity <= 0n) throw new Error("quantity must be positive");
    const listUnit = atomic(input.listUnitPrice, "listUnitPrice");
    const ceiling = atomic(input.buyerCeiling, "buyerCeiling");
    const floor = atomic(input.sellerFloor, "sellerFloor");
    const listTotal = listUnit * quantity;
    const discountBps = input.volumeDiscountBps ?? 0;
    if (!Number.isSafeInteger(discountBps) || discountBps < 0 || discountBps > 10_000) throw new Error("volumeDiscountBps must be between 0 and 10000");
    if (ceiling < floor) throw new Error("buyer ceiling is below seller floor");
    if (floor > listTotal) throw new Error("seller floor exceeds the advertised total");
    if (!input.sessionId?.trim()) input.sessionId = `negotiation_${Date.now().toString(36)}`;
    if (input.validUntil <= this.clock()) throw new Error("negotiation has expired");
    if (input.sla.deliverBy > input.validUntil || input.sla.availabilityBps < 0 || input.sla.availabilityBps > 10_000) throw new Error("invalid SLA bounds");
    atomic(input.sla.stakeRequired, "sla.stakeRequired");
    bytes32(input.resourceHash, "resourceHash");
    address(input.asset, "asset");
    const chainId = networkChainId(input.network);
    if (this.domain.chainId !== chainId) throw new Error("negotiation domain chain ID does not match network");

    const discountedUnit = (listUnit * BigInt(10_000 - discountBps)) / 10_000n;
    const openingTotal = [listTotal, ceiling, discountedUnit * quantity].reduce((lowest, value) => value < lowest ? value : lowest);
    if (openingTotal < floor) {
      if (floor > ceiling) throw new Error("seller floor exceeds buyer ceiling");
    }
    const sessionId = input.sessionId;
    const base: NegotiatedTerms = {
      sessionId,
      buyerAgentId: input.buyerAgentId,
      sellerAgentId: input.sellerAgentId,
      resourceHash: input.resourceHash,
      quantity: quantity.toString(),
      unitPrice: (openingTotal / quantity).toString(),
      totalPrice: openingTotal.toString(),
      asset: input.asset,
      network: input.network,
      sla: { ...input.sla },
      validUntil: input.validUntil,
    };
    if (BigInt(base.unitPrice) * quantity !== openingTotal) throw new Error("negotiated total must divide evenly across quantity");

    const messages: NegotiationMessage[] = [];
    let previousHash = ZERO_HASH;
    const offer = await signMessage(nextMessage(base, "offer", 1, previousHash), this.options.buyer, this.domain);
    messages.push(offer);
    previousHash = typedMessageHash(offer, this.domain);

    let accepted = base;
    if (openingTotal < floor) {
      const sellerTotal = floor;
      if (sellerTotal % quantity !== 0n) throw new Error("seller floor must divide evenly across quantity");
      const counter = { ...base, unitPrice: (sellerTotal / quantity).toString(), totalPrice: sellerTotal.toString() };
      const signedCounter = await signMessage(nextMessage(counter, "counter", 2, previousHash), this.options.seller, this.domain);
      messages.push(signedCounter);
      previousHash = typedMessageHash(signedCounter, this.domain);
      accepted = counter;
      if (this.maxRounds < 3) throw new Error("negotiation requires a third acceptance round");
      const buyerAcceptance = await signMessage(nextMessage(accepted, "accept", 3, previousHash), this.options.buyer, this.domain);
      messages.push(buyerAcceptance);
    } else {
      const sellerAcceptance = await signMessage(nextMessage(accepted, "accept", 2, previousHash), this.options.seller, this.domain);
      messages.push(sellerAcceptance);
    }

    const transcriptHash = messages.reduce((hash, message) => appendTranscript(hash, typedMessageHash(message, this.domain)), ZERO_HASH);
    const partial = { accepted, transcriptHash };
    const buyerSignature = await this.options.buyer.signTypedData({ domain: this.domain, types: NEGOTIATION_COMMITMENT_TYPES, primaryType: "NegotiationCommitment", message: commitmentData(partial) });
    const sellerSignature = await this.options.seller.signTypedData({ domain: this.domain, types: NEGOTIATION_COMMITMENT_TYPES, primaryType: "NegotiationCommitment", message: commitmentData(partial) });
    const resultWithoutCommitment = { sessionId, messages, accepted, originalTotal: listTotal.toString(), savings: (listTotal - BigInt(accepted.totalPrice)).toString(), savingsBps: Number(((listTotal - BigInt(accepted.totalPrice)) * 10_000n) / listTotal), transcriptHash };
    const commitment: NegotiationCommitment = { terms: accepted, transcriptHash, buyerAddress: this.options.buyer.address, sellerAddress: this.options.seller.address, buyerSignature: buyerSignature as Hex, sellerSignature: sellerSignature as Hex, commitmentHash: typedCommitmentHash(resultWithoutCommitment, this.domain) };
    const result: NegotiationResult = { ...resultWithoutCommitment, commitment };
    if (!(await verifyNegotiationCommitment(result, this.domain))) throw new Error("generated negotiation commitment failed verification");
    return result;
  }

  public verify(result: NegotiationResult): Promise<boolean> {
    return verifyNegotiationCommitment(result, this.domain);
  }
}

export async function verifyNegotiationCommitment(result: Pick<NegotiationResult, "messages" | "accepted" | "transcriptHash" | "commitment">, domain: NegotiationDomain = { name: "IntentSentinel Negotiation", version: "1", chainId: 84532 }): Promise<boolean> {
  try {
    if (!result.messages.length || result.messages.length > 3) return false;
    const first = result.messages[0];
    if (!first || first.kind !== "offer" || first.round !== 1 || first.previousMessageHash !== ZERO_HASH) return false;
    if (first.network !== `eip155:${domain.chainId}`) return false;
    let previousHash = ZERO_HASH;
    let transcriptHash = ZERO_HASH;
    for (const [index, message] of result.messages.entries()) {
      if (message.round !== index + 1 || message.previousMessageHash !== previousHash) return false;
      if (message.validUntil <= Math.floor(Date.now() / 1000)) return false;
      bytes32(message.resourceHash, "resourceHash");
      bytes32(message.previousMessageHash, "previousMessageHash");
      atomic(message.quantity, "quantity"); atomic(message.unitPrice, "unitPrice"); atomic(message.totalPrice, "totalPrice");
      address(message.asset, "asset");
      const expectedAddress = index % 2 === 0 ? result.commitment.buyerAddress : result.commitment.sellerAddress;
      const recovered = await recoverTypedDataAddress({ domain, types: NEGOTIATION_MESSAGE_TYPES, primaryType: "NegotiationMessage", message: messageData(message), signature: message.signature } as never);
      if (recovered.toLowerCase() !== expectedAddress.toLowerCase()) return false;
      const hash = typedMessageHash(message, domain);
      previousHash = hash;
      transcriptHash = appendTranscript(transcriptHash, hash);
    }
    const last = result.messages[result.messages.length - 1];
    if (!last || last.kind !== "accept") return false;
    if (transcriptHash !== result.transcriptHash) return false;
    if (JSON.stringify(termsFromMessage(last)) !== JSON.stringify(result.accepted)) return false;
    const expectedCommitmentHash = typedCommitmentHash(result, domain);
    if (expectedCommitmentHash !== result.commitment.commitmentHash) return false;
    const data = commitmentData(result);
    const buyerRecovered = await recoverTypedDataAddress({ domain, types: NEGOTIATION_COMMITMENT_TYPES, primaryType: "NegotiationCommitment", message: data, signature: result.commitment.buyerSignature } as never);
    const sellerRecovered = await recoverTypedDataAddress({ domain, types: NEGOTIATION_COMMITMENT_TYPES, primaryType: "NegotiationCommitment", message: data, signature: result.commitment.sellerSignature } as never);
    return buyerRecovered.toLowerCase() === result.commitment.buyerAddress.toLowerCase() && sellerRecovered.toLowerCase() === result.commitment.sellerAddress.toLowerCase();
  } catch {
    return false;
  }
}
