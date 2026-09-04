import type { SettleResponse } from "./client";

export function isVerifiedLiveSettlement(response: SettleResponse, hash: string | undefined): boolean {
  const liveMode = response.mode === "onchain" || response.mode === "live";
  const baseNetwork = response.network === "eip155:84532" || response.network === "base-sepolia" || response.network === "base-sepolia-testnet";
  return response.success && liveMode && baseNetwork && response.simulated !== true && typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

export function safeExplorerUrl(response: SettleResponse, hash: string | undefined): string | undefined {
  if (!isVerifiedLiveSettlement(response, hash) || typeof response.explorerUrl !== "string") return undefined;
  return /^https:\/\/sepolia\.basescan\.org\/tx\/0x[0-9a-fA-F]{64}$/.test(response.explorerUrl) ? response.explorerUrl : undefined;
}
