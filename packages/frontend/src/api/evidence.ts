import type { SettleResponse } from "./client";

export function isSha256EvidenceHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function hasEip712Evidence(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Record<string, unknown>;
  const typedData = evidence.typedData;
  if (!typedData || typeof typedData !== "object") return false;
  const typed = typedData as Record<string, unknown>;
  const domain = typed.domain as Record<string, unknown> | undefined;
  return typed.primaryType === "TransferWithAuthorization"
    && Boolean(domain && typeof domain.name === "string" && typeof domain.version === "string" && typeof domain.chainId === "number" && typeof domain.verifyingContract === "string")
    && typeof evidence.domainSeparatorHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(evidence.domainSeparatorHash);
}

export function isVerifiedLiveSettlement(response: SettleResponse, hash: string | undefined): boolean {
  const liveMode = response.mode === "onchain" || response.mode === "live";
  const baseNetwork = response.network === "eip155:84532" || response.network === "base-sepolia" || response.network === "base-sepolia-testnet";
  return response.success && liveMode && baseNetwork && response.simulated !== true && typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

export function safeExplorerUrl(response: SettleResponse, hash: string | undefined): string | undefined {
  if (!isVerifiedLiveSettlement(response, hash) || typeof response.explorerUrl !== "string") return undefined;
  return /^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-fA-F]{64}$/.test(response.explorerUrl) ? response.explorerUrl : undefined;
}
