export declare const CROSS_L2_ROUTES: {
    readonly base: {
        readonly network: "eip155:8453";
        readonly chainId: 8453;
        readonly name: "Base L2";
    };
    readonly arbitrum: {
        readonly network: "eip155:42161";
        readonly chainId: 42161;
        readonly name: "Arbitrum One";
    };
    readonly polygon: {
        readonly network: "eip155:137";
        readonly chainId: 137;
        readonly name: "Polygon";
    };
};
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
/** Deterministic, policy-aware gas comparison for independently funded L2 routes. */
export declare class CrossL2GasRouter {
    private readonly options;
    constructor(options?: CrossL2RouterOptions);
    simulate(request?: CrossL2RouterRequest): Promise<RouteQuote[]>;
    compare(request?: CrossL2RouterRequest): Promise<CrossL2Comparison>;
    recommend(request?: CrossL2RouterRequest): Promise<RouteQuote>;
    select(request?: CrossL2RouterRequest): Promise<RouteQuote>;
    /** Presentation-friendly alias retained for callers that want one winner. */
    getOptimalRoute(request?: LegacyOptimalRouteRequest): Promise<CrossL2Comparison & {
        recommended: RouteQuote;
        recommendedRoute: RouteQuote;
    }>;
    private estimateRoute;
    private quote;
    private compareQuotes;
    private now;
}
