import { BASE_MAINNET, BASE_SEPOLIA } from "./schemes.js";
export const ERC3009_TYPES = {
    TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
    ],
};
export function chainIdForNetwork(network) {
    if (network === BASE_MAINNET)
        return 8453;
    if (network === BASE_SEPOLIA)
        return 84532;
    throw new Error(`unsupported ERC-3009 network: ${network}`);
}
export function createErc3009TypedData(input) {
    return {
        domain: {
            name: input.name,
            version: input.version,
            chainId: input.chainId,
            verifyingContract: input.verifyingContract,
        },
        types: ERC3009_TYPES,
        primaryType: "TransferWithAuthorization",
        message: input.message,
    };
}
