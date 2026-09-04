import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { assertValidPaymentIntent, createErc3009TypedData, type Erc3009Authorization, type Eip712Domain, type PaymentIntent } from "@cathay/intent-sentinel-core";

export class VaultError extends Error { public constructor(message: string) { super(message); this.name = "VaultError"; } }
export interface ScopedKeyVaultOptions { privateKey: Hex; intent: PaymentIntent; clock?: () => number; }

/** Private-key signing boundary. No API returns or serializes the key material. */
export class ScopedKeyVault {
  #account: ReturnType<typeof privateKeyToAccount> | undefined;
  readonly #clock: () => number;
  readonly #scope: PaymentIntent;
  public constructor(options: ScopedKeyVaultOptions) { assertValidPaymentIntent(options.intent); this.#account = privateKeyToAccount(options.privateKey); this.#scope = structuredClone(options.intent); this.#clock = options.clock ?? (() => Math.floor(Date.now() / 1000)); }
  public get address(): string { if (!this.#account) throw new VaultError("vault is closed"); return this.#account.address; }
  public get scope(): PaymentIntent { return structuredClone(this.#scope); }
  public get intent(): PaymentIntent { return this.scope; }
  public get isOpen(): boolean { return this.#account !== undefined; }
  public assertScope(intent: PaymentIntent): void { if (!this.#account) throw new VaultError("vault is closed"); if (JSON.stringify(this.#scope) !== JSON.stringify(intent)) throw new VaultError("payment intent is outside vault scope"); }
  /** Sign only an ERC-3009 authorization that fits this vault's immutable scope. */
  public async signTransferWithAuthorization(input: { domain: Eip712Domain; authorization: Erc3009Authorization }): Promise<Hex> {
    const account = this.#account; if (!account) throw new VaultError("vault is closed"); assertValidPaymentIntent(this.#scope, this.#clock());
    if (input.authorization.from.toLowerCase() !== account.address.toLowerCase()) throw new VaultError("authorization.from does not match vault address");
    if (input.authorization.to.toLowerCase() !== this.#scope.payee.toLowerCase()) throw new VaultError("authorization recipient is outside vault scope");
    let value: bigint; try { value = BigInt(input.authorization.value); } catch { throw new VaultError("invalid authorization amount"); }
    if (value < 0n || value > BigInt(this.#scope.max_amount)) throw new VaultError("authorization amount exceeds vault scope");
    if (BigInt(input.authorization.validBefore) > BigInt(this.#scope.expires_at)) throw new VaultError("authorization expires after vault scope");
    if (BigInt(input.authorization.validAfter) >= BigInt(input.authorization.validBefore)) throw new VaultError("authorization validity window is empty");
    const typed = createErc3009TypedData({ chainId: input.domain.chainId as 8453 | 84532, verifyingContract: input.domain.verifyingContract, name: input.domain.name, version: input.domain.version, message: input.authorization });
    return account.signTypedData({ domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract as `0x${string}` }, types: typed.types, primaryType: typed.primaryType, message: { from: input.authorization.from as `0x${string}`, to: input.authorization.to as `0x${string}`, value: BigInt(input.authorization.value), validAfter: BigInt(input.authorization.validAfter), validBefore: BigInt(input.authorization.validBefore), nonce: input.authorization.nonce as `0x${string}` } });
  }
  /** Raw typed-data signing is intentionally unavailable at the vault boundary. */
  public async signTypedData(_params: unknown): Promise<Hex> { throw new VaultError("raw typed-data signing is disabled; use signTransferWithAuthorization"); }
  public close(): void { this.#account = undefined; }
  public toJSON(): { address: string; scope: PaymentIntent; isOpen: boolean } { return { address: this.address, scope: this.scope, isOpen: this.isOpen }; }
}
