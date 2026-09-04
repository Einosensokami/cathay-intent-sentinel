import type { Erc3009Authorization, NetworkId } from "./types.js";
export interface Eip712Domain {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
}
export declare const ERC3009_TYPES: {
    readonly TransferWithAuthorization: readonly [{
        readonly name: "from";
        readonly type: "address";
    }, {
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly name: "value";
        readonly type: "uint256";
    }, {
        readonly name: "validAfter";
        readonly type: "uint256";
    }, {
        readonly name: "validBefore";
        readonly type: "uint256";
    }, {
        readonly name: "nonce";
        readonly type: "bytes32";
    }];
};
export interface Erc3009TypedData {
    domain: Eip712Domain;
    types: typeof ERC3009_TYPES;
    primaryType: "TransferWithAuthorization";
    message: Erc3009Authorization;
}
export declare function chainIdForNetwork(network: NetworkId): 8453 | 84532;
export declare function createErc3009TypedData(input: {
    chainId: 8453 | 84532;
    verifyingContract: string;
    name: string;
    version: string;
    message: Erc3009Authorization;
}): Erc3009TypedData;
