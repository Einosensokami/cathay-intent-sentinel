import { getAddress, verifyTypedData } from "ethers";
import type { ExactEvmPayload, PaymentPayload, PaymentRequirements, Erc3009Authorization } from "@cathay/intent-sentinel-core";

export interface BalanceReader {
  getBalance(address: string, asset: string, network: string): Promise<bigint>;
}

export interface NonceStore {
  isConsumed(nonce: string): Promise<boolean>;
  consume(nonce: string): Promise<boolean>;
  release?(nonce: string): Promise<void>;
}

export interface VerifyRequest {
  /** Short form accepted by this package. */
  payload?: unknown;
  requirements?: PaymentRequirements;
  /** Canonical x402 v2 POST body names. */
  paymentPayload?: unknown;
  paymentRequirements?: PaymentRequirements;
  payer?: string;
  now?: number;
}

export type TransferAuthorization = Erc3009Authorization;

export type VerifyErrorCode =
  | "MALFORMED_PAYLOAD"
  | "REQUIREMENTS_MISMATCH"
  | "INVALID_SIGNATURE"
  | "NONCE_CONSUMED"
  | "INVALID_TIME_WINDOW"
  | "INSUFFICIENT_BALANCE"
  | "UNSUPPORTED_SCHEME"
  | "VERIFICATION_ERROR";

export interface VerifyResult {
  ok: boolean;
  payer?: string;
  amount?: string;
  nonce?: string;
  error?: { code: VerifyErrorCode; message: string };
}

export interface VerifyOptions {
  balanceReader: BalanceReader;
  nonceStore: NonceStore;
  now?: () => number;
  domainName?: string;
  domainVersion?: string;
}

const authorizationTypes: Record<string, Array<{ name: string; type: string }>> = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function fail(code: VerifyErrorCode, message: string): VerifyResult {
  return { ok: false, error: { code, message } };
}

function isAuthorization(value: unknown): value is TransferAuthorization {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["from", "to", "value", "validAfter", "validBefore", "nonce"].every((key) => typeof candidate[key] === "string");
}

function isPaymentPayload(value: unknown): value is PaymentPayload<ExactEvmPayload> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const payload = candidate.payload;
  return candidate.x402Version === 2 &&
    (!candidate.resource || typeof candidate.resource === "string" || (typeof candidate.resource === "object" && typeof (candidate.resource as Record<string, unknown>).url === "string")) &&
    !!candidate.accepted && typeof candidate.accepted === "object" && !!payload && typeof payload === "object" &&
    isAuthorization((payload as Record<string, unknown>).authorization) && typeof (payload as Record<string, unknown>).signature === "string";
}

function chainId(network: string, requirements: PaymentRequirements): number | undefined {
  const configured = requirements.extra?.chainId;
  if (typeof configured === "number" && Number.isSafeInteger(configured)) return configured;
  if (network === "base" || network === "eip155:8453") return 8453;
  if (network === "base-sepolia" || network === "base-sepolia-testnet" || network === "eip155:84532") return 84532;
  return undefined;
}

function sameRequirement(payload: PaymentPayload, requirements: PaymentRequirements): boolean {
  const accepted = payload.accepted;
  return accepted.scheme === requirements.scheme && accepted.network === requirements.network &&
    accepted.asset.toLowerCase() === requirements.asset.toLowerCase() && accepted.amount === requirements.amount &&
    accepted.payTo.toLowerCase() === requirements.payTo.toLowerCase() &&
    (!requirements.extra?.resource || (typeof requirements.extra.resource === "string" && ((typeof payload.resource === "string" && payload.resource === requirements.extra.resource) || (typeof payload.resource === "object" && payload.resource.url === requirements.extra.resource))));
}

export async function verifyPayment(request: VerifyRequest, options: VerifyOptions): Promise<VerifyResult> {
  const now = request?.now ?? (options.now ?? (() => Math.floor(Date.now() / 1000)))();
  try {
    const requirements = request?.paymentRequirements ?? request?.requirements;
    const rawPayload = request?.paymentPayload ?? request?.payload;
    if (!request || !requirements || !Number.isFinite(now)) return fail("MALFORMED_PAYLOAD", "Request and verification time are required");
    if (requirements.scheme !== "exact") return fail("UNSUPPORTED_SCHEME", "Only x402 exact/ERC-3009 is executable");
    if (!isPaymentPayload(rawPayload)) return fail("MALFORMED_PAYLOAD", "PaymentPayload.payload is malformed");
    const payload = rawPayload;
    if (!sameRequirement(payload, requirements)) return fail("REQUIREMENTS_MISMATCH", "Payment requirements do not match the payload");
    const authorization = payload.payload.authorization;
    let from: string;
    let to: string;
    let asset: string;
    try {
      from = getAddress(authorization.from);
      to = getAddress(authorization.to);
      asset = getAddress(requirements.asset);
      if (to.toLowerCase() !== getAddress(requirements.payTo).toLowerCase()) return fail("REQUIREMENTS_MISMATCH", "Authorization recipient does not match payTo");
    } catch { return fail("MALFORMED_PAYLOAD", "Address field is invalid"); }
    if (request.payer && from.toLowerCase() !== getAddress(request.payer).toLowerCase()) return fail("REQUIREMENTS_MISMATCH", "Payer does not match authorization.from");
    if (authorization.value !== requirements.amount) return fail("REQUIREMENTS_MISMATCH", "Authorization value does not match amount");
    if (BigInt(authorization.validAfter) > BigInt(Math.floor(now)) || BigInt(authorization.validBefore) <= BigInt(Math.floor(now))) {
      return fail("INVALID_TIME_WINDOW", "Authorization is outside its valid time window");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) return fail("MALFORMED_PAYLOAD", "ERC-3009 nonce must be bytes32");
    if (await options.nonceStore.isConsumed(authorization.nonce)) return fail("NONCE_CONSUMED", "Authorization nonce has already been consumed");
    const id = chainId(requirements.network, requirements);
    if (id === undefined) return fail("VERIFICATION_ERROR", "Unsupported network; chainId is required");
    let recovered: string;
    try {
      const extraName = requirements.extra?.name;
      const extraVersion = requirements.extra?.version;
      const domain = { name: options.domainName ?? (typeof extraName === "string" ? extraName : "USD Coin"), version: options.domainVersion ?? (typeof extraVersion === "string" ? extraVersion : "2"), chainId: id, verifyingContract: asset };
      recovered = getAddress(verifyTypedData(domain, authorizationTypes as Record<string, { name: string; type: string }[]>, authorization, payload.payload.signature));
    } catch { return fail("INVALID_SIGNATURE", "EIP-712 ERC-3009 signature is invalid"); }
    if (recovered.toLowerCase() !== from.toLowerCase()) return fail("INVALID_SIGNATURE", "Signature does not recover authorization.from");
    const balance = await options.balanceReader.getBalance(from, asset, requirements.network);
    if (balance < BigInt(requirements.amount)) return fail("INSUFFICIENT_BALANCE", "Payer balance is insufficient");
    return { ok: true, payer: from, amount: authorization.value, nonce: authorization.nonce };
  } catch (error) {
    return fail("VERIFICATION_ERROR", `Verification failed closed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export const createVerifyHandler = (options: VerifyOptions) => (request: VerifyRequest) => verifyPayment(request, options);
export const verify = verifyPayment;
