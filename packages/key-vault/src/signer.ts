import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { assertExactEip3009Requirements, assertIntentAllowsRequirements, chainIdForNetwork, createErc3009TypedData, type ExactEvmPayload, type Erc3009Authorization, type PaymentIntent, type PaymentPayload, type PaymentRequirements } from "@cathay/intent-sentinel-core";
import { ScopedKeyVault, VaultError } from "./vault.js";
export interface Erc3009Signature { v: number; r: Hex; s: Hex; wire: Hex; }
export interface SignPaymentOptions { now?: number; nonce?: Hex; validAfter?: number; validBefore?: number; }
function nonceHex(): Hex { return `0x${randomBytes(32).toString("hex")}` as Hex; }
function splitSignature(signature: Hex): Erc3009Signature { const bytes = signature.slice(2); if (bytes.length !== 130) throw new VaultError("ERC-3009 signature must be exactly 65 bytes"); const r = `0x${bytes.slice(0, 64)}` as Hex; const s = `0x${bytes.slice(64, 128)}` as Hex; const rawV = Number.parseInt(bytes.slice(128, 130), 16); if (![0, 1, 27, 28].includes(rawV)) throw new VaultError("invalid ECDSA recovery id"); const v = rawV < 27 ? rawV + 27 : rawV; return { v, r, s, wire: `0x${bytes.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex }; }
export class Erc3009Signer {
  public constructor(private readonly vault: ScopedKeyVault) {}
  public async signPayment(intent: PaymentIntent, requirements: PaymentRequirements, options: SignPaymentOptions = {}): Promise<PaymentPayload<ExactEvmPayload>> {
    return (await this.signPaymentDetailed(intent, requirements, options)).payment;
  }
  public async signPaymentDetailed(intent: PaymentIntent, requirements: PaymentRequirements, options: SignPaymentOptions = {}): Promise<{ payment: PaymentPayload<ExactEvmPayload>; signature: Erc3009Signature }> {
    const now = options.now ?? Math.floor(Date.now() / 1000); this.vault.assertScope(intent); assertIntentAllowsRequirements(intent, requirements, now); assertExactEip3009Requirements(requirements);
    if (!Number.isSafeInteger(requirements.maxTimeoutSeconds) || requirements.maxTimeoutSeconds <= 0) throw new VaultError("maxTimeoutSeconds must be a positive integer");
    const validAfter = options.validAfter ?? Math.max(0, now - 30); const timeoutLimit = now + requirements.maxTimeoutSeconds; const validBefore = options.validBefore ?? Math.min(intent.expires_at, timeoutLimit);
    if (!Number.isSafeInteger(validAfter) || !Number.isSafeInteger(validBefore) || validAfter < 0 || validBefore <= now || validBefore > intent.expires_at || validBefore > timeoutLimit) throw new VaultError("authorization validity window is outside the intent or x402 timeout");
    const nonce = options.nonce ?? nonceHex(); if (!/^0x[0-9a-fA-F]{64}$/.test(nonce)) throw new VaultError("nonce must be a 32-byte hex value");
    const authorization: Erc3009Authorization = { from: this.vault.address, to: requirements.payTo, value: requirements.amount, validAfter: String(validAfter), validBefore: String(validBefore), nonce };
    const typed = createErc3009TypedData({ chainId: chainIdForNetwork(requirements.network), verifyingContract: requirements.asset, name: requirements.extra.name, version: requirements.extra.version, message: authorization });
    const signature = splitSignature(await this.vault.signTransferWithAuthorization({ domain: typed.domain, authorization }));
    return { payment: { x402Version: 2, resource: { url: intent.resource }, accepted: requirements, payload: { signature: signature.wire, authorization } }, signature };
  }
  public static splitSignature(signature: Hex): Erc3009Signature { return splitSignature(signature); }
}
