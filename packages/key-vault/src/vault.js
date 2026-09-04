import { privateKeyToAccount } from "viem/accounts";
import { assertValidPaymentIntent, createErc3009TypedData } from "@cathay/intent-sentinel-core";
export class VaultError extends Error {
    constructor(message) { super(message); this.name = "VaultError"; }
}
/** Private-key signing boundary. No API returns or serializes the key material. */
export class ScopedKeyVault {
    #account;
    #clock;
    #scope;
    constructor(options) { assertValidPaymentIntent(options.intent); this.#account = privateKeyToAccount(options.privateKey); this.#scope = structuredClone(options.intent); this.#clock = options.clock ?? (() => Math.floor(Date.now() / 1000)); }
    get address() { if (!this.#account)
        throw new VaultError("vault is closed"); return this.#account.address; }
    get scope() { return structuredClone(this.#scope); }
    get intent() { return this.scope; }
    get isOpen() { return this.#account !== undefined; }
    assertScope(intent) {
        if (!this.#account)
            throw new VaultError("vault is closed");
        const same = this.#scope.task_id === intent.task_id &&
            this.#scope.resource === intent.resource &&
            this.#scope.payee.toLowerCase() === intent.payee.toLowerCase() &&
            this.#scope.max_amount === intent.max_amount &&
            this.#scope.asset_network.asset.toLowerCase() === intent.asset_network.asset.toLowerCase() &&
            this.#scope.asset_network.network === intent.asset_network.network &&
            this.#scope.expires_at === intent.expires_at;
        if (!same)
            throw new VaultError("payment intent is outside vault scope");
    }
    /** Sign only an ERC-3009 authorization that fits this vault's immutable scope. */
    async signTransferWithAuthorization(input) {
        const account = this.#account;
        if (!account)
            throw new VaultError("vault is closed");
        assertValidPaymentIntent(this.#scope, this.#clock());
        if (input.authorization.from.toLowerCase() !== account.address.toLowerCase())
            throw new VaultError("authorization.from does not match vault address");
        if (input.authorization.to.toLowerCase() !== this.#scope.payee.toLowerCase())
            throw new VaultError("authorization recipient is outside vault scope");
        let value;
        try {
            value = BigInt(input.authorization.value);
        }
        catch {
            throw new VaultError("invalid authorization amount");
        }
        if (value < 0n || value > BigInt(this.#scope.max_amount))
            throw new VaultError("authorization amount exceeds vault scope");
        if (BigInt(input.authorization.validBefore) > BigInt(this.#scope.expires_at))
            throw new VaultError("authorization expires after vault scope");
        if (BigInt(input.authorization.validAfter) >= BigInt(input.authorization.validBefore))
            throw new VaultError("authorization validity window is empty");
        const typed = createErc3009TypedData({ chainId: input.domain.chainId, verifyingContract: input.domain.verifyingContract, name: input.domain.name, version: input.domain.version, message: input.authorization });
        return account.signTypedData({ domain: { ...typed.domain, verifyingContract: typed.domain.verifyingContract }, types: typed.types, primaryType: typed.primaryType, message: { from: input.authorization.from, to: input.authorization.to, value: BigInt(input.authorization.value), validAfter: BigInt(input.authorization.validAfter), validBefore: BigInt(input.authorization.validBefore), nonce: input.authorization.nonce } });
    }
    /** Raw typed-data signing is intentionally unavailable at the vault boundary. */
    async signTypedData(_params) { throw new VaultError("raw typed-data signing is disabled; use signTransferWithAuthorization"); }
    close() { this.#account = undefined; }
    toJSON() { return { address: this.#account?.address ?? "", scope: this.scope, isOpen: this.isOpen }; }
}
