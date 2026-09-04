import type { Erc3009Authorization, NetworkId } from "./types.js";
import { BASE_MAINNET, BASE_SEPOLIA } from "./schemes.js";

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export const ERC3009_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface Erc3009TypedData {
  domain: Eip712Domain;
  types: typeof ERC3009_TYPES;
  primaryType: "TransferWithAuthorization";
  message: Erc3009Authorization;
}

export function chainIdForNetwork(network: NetworkId): 8453 | 84532 {
  if (network === BASE_MAINNET) return 8453;
  if (network === BASE_SEPOLIA) return 84532;
  throw new Error(`unsupported ERC-3009 network: ${network}`);
}

export function createErc3009TypedData(input: {
  chainId: 8453 | 84532;
  verifyingContract: string;
  name: string;
  version: string;
  message: Erc3009Authorization;
}): Erc3009TypedData {
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
