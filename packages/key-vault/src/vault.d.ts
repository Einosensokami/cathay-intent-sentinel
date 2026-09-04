import type { Hex } from "viem";
import { type Erc3009Authorization, type Eip712Domain, type PaymentIntent } from "@cathay/intent-sentinel-core";
export declare class VaultError extends Error {
    constructor(message: string);
}
export interface ScopedKeyVaultOptions {
    privateKey: Hex;
    intent: PaymentIntent;
    clock?: () => number;
}
/** Private-key signing boundary. No API returns or serializes the key material. */
export declare class ScopedKeyVault {
    #private;
    constructor(options: ScopedKeyVaultOptions);
    get address(): string;
    get scope(): PaymentIntent;
    get intent(): PaymentIntent;
    get isOpen(): boolean;
    assertScope(intent: PaymentIntent): void;
    /** Sign only an ERC-3009 authorization that fits this vault's immutable scope. */
    signTransferWithAuthorization(input: {
        domain: Eip712Domain;
        authorization: Erc3009Authorization;
    }): Promise<Hex>;
    /** Raw typed-data signing is intentionally unavailable at the vault boundary. */
    signTypedData(_params: unknown): Promise<Hex>;
    close(): void;
    toJSON(): {
        address: string;
        scope: PaymentIntent;
        isOpen: boolean;
    };
}
