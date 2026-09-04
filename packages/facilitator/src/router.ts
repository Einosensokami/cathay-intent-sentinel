import { createHash } from "node:crypto";

export const CROSS_L2_ROUTES = {
  base: { network: "eip155:8453", chainId: 8453, name: "Base L2" },
  arbitrum: { network: "eip155:42161", chainId: 42161, name: "Arbitrum One" },
  polygon: { network: "eip155:137", chainId: 137, name: "Polygon" },
} as const;

export type CrossL2Network = typeof CROSS_L2_ROUTES[keyof typeof CROSS_L2_ROUTES]["network"];
export type NumericEstimate = bigint | number | string;

export interface CrossL2GasEstimate {
  network: CrossL2Network;
  gasLimit: NumericEstimate;
  gasPriceWei: NumericEstimate;
  nativeTokenUsd: number;
  settlementFeeUsd?: number;
  expectedLatencySeconds?: number;
  reorgRiskBps?: number;
  rpcErrorRate?: number;
  liquidityPenalty?: number;
  merchantAdvertised?: boolean;
  policyAllowed?: boolean;
  buyerHasLiquidity?: boolean;
  merchantHasLiquidity?: boolean;
  tokenCapability?: boolean;
  trustEvidence?: boolean;
  rpcHealthy?: boolean;
}

export interface CrossL2RouterWeights {
  latencyWeight?: number;
  riskWeight?: number;
  reliabilityWeight?: number;
}

export interface RouteQuote {
  network: CrossL2Network;
  chainId: number;
  name: string;
  gasLimit: bigint;
  gasPriceWei: bigint;
  estimatedFeeWei: bigint;
  estimatedFeeUsd: number;
  /** Compatibility alias used by the demo presentation. */
  estimatedGasUsd: number;
  settlementFeeUsd: number;
  expectedLatencySeconds: number;
  reorgRiskBps: number;
  rpcErrorRate: number;
  liquidityPenalty: number;
  score: number;
  eligible: boolean;
  reasons: string[];
  quotedAt: string;
  quoteHash: string;
}

export interface CrossL2Comparison {
  quotes: RouteQuote[];
  recommended?: RouteQuote;
  recommendedRoute?: RouteQuote;
  generatedAt: string;
}

export interface CrossL2RouterOptions {
  weights?: CrossL2RouterWeights;
  preferredNetwork?: CrossL2Network;
  clock?: () => number;
  /** Override deterministic defaults with current provider/merchant data. */
  estimate?: (route: typeof CROSS_L2_ROUTES[keyof typeof CROSS_L2_ROUTES]) => Promise<CrossL2GasEstimate>;
}

export interface CrossL2RouterRequest {
  estimates?: readonly CrossL2GasEstimate[];
  gasLimit?: NumericEstimate;
  gasPriceWei?: Partial<Record<CrossL2Network, NumericEstimate>>;
  nativeTokenUsd?: Partial<Record<CrossL2Network, number>>;
  merchantAdvertised?: readonly CrossL2Network[];
  policyAllowed?: readonly CrossL2Network[];
  buyerLiquidity?: readonly CrossL2Network[];
  merchantLiquidity?: readonly CrossL2Network[];
  tokenCapability?: readonly CrossL2Network[];
  trustEvidence?: readonly CrossL2Network[];
  rpcHealthy?: readonly CrossL2Network[];
}

export interface LegacyOptimalRouteRequest {
  amount?: string;
  supportedNetworks?: readonly CrossL2Network[];
}

const DEFAULT_GAS_PRICE_WEI: Record<CrossL2Network, bigint> = {
  "eip155:8453": 1_000_000n,
  "eip155:42161": 100_000_000n,
  "eip155:137": 30_000_000_000n,
};
const DEFAULT_NATIVE_USD: Record<CrossL2Network, number> = {
  "eip155:8453": 2_500,
  "eip155:42161": 2_500,
  "eip155:137": 0.5,
};
const ROUTE_BY_NETWORK = Object.values(CROSS_L2_ROUTES).reduce((result, route) => {
  result[route.network] = route;
  return result;
}, {} as Record<CrossL2Network, typeof CROSS_L2_ROUTES[keyof typeof CROSS_L2_ROUTES]>);

function asBigInt(value: NumericEstimate | undefined, fallback: bigint): bigint {
  if (value === undefined) return fallback;
  try {
    const result = BigInt(value);
    if (result < 0n) throw new Error("negative estimate");
    return result;
  } catch {
    throw new Error(`Invalid integer estimate: ${String(value)}`);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "bigint" ? item.toString() : item);
}

function feeUsd(feeWei: bigint, nativeTokenUsd: number): number {
  return Number(feeWei) / 1e18 * nativeTokenUsd;
}

/** Deterministic, policy-aware gas comparison for independently funded L2 routes. */
export class CrossL2GasRouter {
  private readonly options: CrossL2RouterOptions;

  constructor(options: CrossL2RouterOptions = {}) {
    this.options = options;
  }

  async simulate(request: CrossL2RouterRequest = {}): Promise<RouteQuote[]> {
    const estimates = request.estimates
      ? [...request.estimates]
      : await Promise.all(Object.values(CROSS_L2_ROUTES).map((route) => this.estimateRoute(route, request)));
    return estimates.map((estimate) => this.quote(estimate));
  }

  async compare(request: CrossL2RouterRequest = {}): Promise<CrossL2Comparison> {
    const quotes = await this.simulate(request);
    const eligible = quotes.filter((quote) => quote.eligible);
    const recommended = [...eligible].sort((left, right) => this.compareQuotes(left, right))[0];
    return { quotes, ...(recommended ? { recommended, recommendedRoute: recommended } : {}), generatedAt: new Date(this.now()).toISOString() };
  }

  async recommend(request: CrossL2RouterRequest = {}): Promise<RouteQuote> {
    const result = await this.compare(request);
    if (!result.recommended) throw new Error("No eligible L2 route is available");
    return result.recommended;
  }

  async select(request: CrossL2RouterRequest = {}): Promise<RouteQuote> {
    return this.recommend(request);
  }

  /** Presentation-friendly alias retained for callers that want one winner. */
  async getOptimalRoute(request: LegacyOptimalRouteRequest = {}): Promise<CrossL2Comparison & { recommended: RouteQuote; recommendedRoute: RouteQuote }> {
    const comparison = await this.compare({
      ...(request.supportedNetworks ? { merchantAdvertised: request.supportedNetworks } : {}),
    });
    if (!comparison.recommended || !comparison.recommendedRoute) throw new Error("No eligible L2 route is available");
    return { ...comparison, recommended: comparison.recommended, recommendedRoute: comparison.recommendedRoute };
  }

  private async estimateRoute(route: typeof CROSS_L2_ROUTES[keyof typeof CROSS_L2_ROUTES], request: CrossL2RouterRequest): Promise<CrossL2GasEstimate> {
    if (this.options.estimate) return this.options.estimate(route);
    const network = route.network;
    return {
      network,
      gasLimit: request.gasLimit ?? 100_000n,
      gasPriceWei: request.gasPriceWei?.[network] ?? DEFAULT_GAS_PRICE_WEI[network],
      nativeTokenUsd: request.nativeTokenUsd?.[network] ?? DEFAULT_NATIVE_USD[network],
      merchantAdvertised: request.merchantAdvertised ? request.merchantAdvertised.includes(network) : true,
      policyAllowed: request.policyAllowed ? request.policyAllowed.includes(network) : true,
      buyerHasLiquidity: request.buyerLiquidity ? request.buyerLiquidity.includes(network) : true,
      merchantHasLiquidity: request.merchantLiquidity ? request.merchantLiquidity.includes(network) : true,
      tokenCapability: request.tokenCapability ? request.tokenCapability.includes(network) : true,
      trustEvidence: request.trustEvidence ? request.trustEvidence.includes(network) : true,
      rpcHealthy: request.rpcHealthy ? request.rpcHealthy.includes(network) : true,
    };
  }

  private quote(estimate: CrossL2GasEstimate): RouteQuote {
    const route = ROUTE_BY_NETWORK[estimate.network];
    if (!route) throw new Error(`Unsupported L2 route ${estimate.network}`);
    const gasLimit = asBigInt(estimate.gasLimit, 100_000n);
    const gasPriceWei = asBigInt(estimate.gasPriceWei, DEFAULT_GAS_PRICE_WEI[estimate.network]);
    const estimatedFeeWei = gasLimit * gasPriceWei;
    const estimatedFeeUsd = feeUsd(estimatedFeeWei, estimate.nativeTokenUsd);
    const settlementFeeUsd = estimate.settlementFeeUsd ?? estimatedFeeUsd;
    const expectedLatencySeconds = estimate.expectedLatencySeconds ?? 2;
    const reorgRiskBps = estimate.reorgRiskBps ?? 0;
    const rpcErrorRate = estimate.rpcErrorRate ?? 0;
    const liquidityPenalty = estimate.liquidityPenalty ?? 0;
    const reasons: string[] = [];
    const requirements: Array<[string, boolean | undefined]> = [
      ["merchant did not advertise this route", estimate.merchantAdvertised],
      ["policy disallows this route", estimate.policyAllowed],
      ["buyer liquidity is unavailable", estimate.buyerHasLiquidity],
      ["merchant liquidity is unavailable", estimate.merchantHasLiquidity],
      ["token ERC-3009 capability is unavailable", estimate.tokenCapability],
      ["trust evidence is unavailable", estimate.trustEvidence],
      ["RPC health check failed", estimate.rpcHealthy],
    ];
    for (const [reason, condition] of requirements) if (condition === false) reasons.push(reason);
    const score = settlementFeeUsd + expectedLatencySeconds * (this.options.weights?.latencyWeight ?? 0) + reorgRiskBps * (this.options.weights?.riskWeight ?? 0) + rpcErrorRate * (this.options.weights?.reliabilityWeight ?? 0) + liquidityPenalty;
    const quotedAt = new Date(this.now()).toISOString();
    const snapshot = { network: route.network, chainId: route.chainId, gasLimit, gasPriceWei, estimatedFeeWei, estimatedFeeUsd, settlementFeeUsd, expectedLatencySeconds, reorgRiskBps, rpcErrorRate, liquidityPenalty, score, quotedAt };
    return { ...snapshot, name: route.name, estimatedGasUsd: estimatedFeeUsd, eligible: reasons.length === 0, reasons, quoteHash: `0x${createHash("sha256").update(stableJson(snapshot)).digest("hex")}` };
  }

  private compareQuotes(left: RouteQuote, right: RouteQuote): number {
    if (left.score !== right.score) return left.score - right.score;
    if (this.options.preferredNetwork) {
      if (left.network === this.options.preferredNetwork && right.network !== this.options.preferredNetwork) return -1;
      if (right.network === this.options.preferredNetwork && left.network !== this.options.preferredNetwork) return 1;
    }
    if (left.network === "eip155:8453" && right.network !== "eip155:8453") return -1;
    if (right.network === "eip155:8453" && left.network !== "eip155:8453") return 1;
    return left.network.localeCompare(right.network);
  }

  private now(): number {
    return (this.options.clock ?? (() => Date.now()))();
  }
}
