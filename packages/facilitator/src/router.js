import { createHash } from "node:crypto";
export const CROSS_L2_ROUTES = {
    base: { network: "eip155:8453", chainId: 8453, name: "Base L2" },
    arbitrum: { network: "eip155:42161", chainId: 42161, name: "Arbitrum One" },
    polygon: { network: "eip155:137", chainId: 137, name: "Polygon" },
};
const DEFAULT_GAS_PRICE_WEI = {
    "eip155:8453": 1000000n,
    "eip155:42161": 100000000n,
    "eip155:137": 30000000000n,
};
const DEFAULT_NATIVE_USD = {
    "eip155:8453": 2_500,
    "eip155:42161": 2_500,
    "eip155:137": 0.5,
};
const ROUTE_BY_NETWORK = Object.values(CROSS_L2_ROUTES).reduce((result, route) => {
    result[route.network] = route;
    return result;
}, {});
function asBigInt(value, fallback) {
    if (value === undefined)
        return fallback;
    try {
        const result = BigInt(value);
        if (result < 0n)
            throw new Error("negative estimate");
        return result;
    }
    catch {
        throw new Error(`Invalid integer estimate: ${String(value)}`);
    }
}
function stableJson(value) {
    return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}
function feeUsd(feeWei, nativeTokenUsd) {
    return Number(feeWei) / 1e18 * nativeTokenUsd;
}
/** Deterministic, policy-aware gas comparison for independently funded L2 routes. */
export class CrossL2GasRouter {
    options;
    constructor(options = {}) {
        this.options = options;
    }
    async simulate(request = {}) {
        const estimates = request.estimates
            ? [...request.estimates]
            : await Promise.all(Object.values(CROSS_L2_ROUTES).map((route) => this.estimateRoute(route, request)));
        return estimates.map((estimate) => this.quote(estimate));
    }
    async compare(request = {}) {
        const quotes = await this.simulate(request);
        const eligible = quotes.filter((quote) => quote.eligible);
        const recommended = [...eligible].sort((left, right) => this.compareQuotes(left, right))[0];
        return { quotes, ...(recommended ? { recommended, recommendedRoute: recommended } : {}), generatedAt: new Date(this.now()).toISOString() };
    }
    async recommend(request = {}) {
        const result = await this.compare(request);
        if (!result.recommended)
            throw new Error("No eligible L2 route is available");
        return result.recommended;
    }
    async select(request = {}) {
        return this.recommend(request);
    }
    /** Presentation-friendly alias retained for callers that want one winner. */
    async getOptimalRoute(request = {}) {
        const comparison = await this.compare({
            ...(request.supportedNetworks ? { merchantAdvertised: request.supportedNetworks } : {}),
        });
        if (!comparison.recommended || !comparison.recommendedRoute)
            throw new Error("No eligible L2 route is available");
        return { ...comparison, recommended: comparison.recommended, recommendedRoute: comparison.recommendedRoute };
    }
    async estimateRoute(route, request) {
        if (this.options.estimate)
            return this.options.estimate(route);
        const network = route.network;
        return {
            network,
            gasLimit: request.gasLimit ?? 100000n,
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
    quote(estimate) {
        const route = ROUTE_BY_NETWORK[estimate.network];
        if (!route)
            throw new Error(`Unsupported L2 route ${estimate.network}`);
        const gasLimit = asBigInt(estimate.gasLimit, 100000n);
        const gasPriceWei = asBigInt(estimate.gasPriceWei, DEFAULT_GAS_PRICE_WEI[estimate.network]);
        const estimatedFeeWei = gasLimit * gasPriceWei;
        const estimatedFeeUsd = feeUsd(estimatedFeeWei, estimate.nativeTokenUsd);
        const settlementFeeUsd = estimate.settlementFeeUsd ?? estimatedFeeUsd;
        const expectedLatencySeconds = estimate.expectedLatencySeconds ?? 2;
        const reorgRiskBps = estimate.reorgRiskBps ?? 0;
        const rpcErrorRate = estimate.rpcErrorRate ?? 0;
        const liquidityPenalty = estimate.liquidityPenalty ?? 0;
        const reasons = [];
        const requirements = [
            ["merchant did not advertise this route", estimate.merchantAdvertised],
            ["policy disallows this route", estimate.policyAllowed],
            ["buyer liquidity is unavailable", estimate.buyerHasLiquidity],
            ["merchant liquidity is unavailable", estimate.merchantHasLiquidity],
            ["token ERC-3009 capability is unavailable", estimate.tokenCapability],
            ["trust evidence is unavailable", estimate.trustEvidence],
            ["RPC health check failed", estimate.rpcHealthy],
        ];
        for (const [reason, condition] of requirements)
            if (condition === false)
                reasons.push(reason);
        const score = settlementFeeUsd + expectedLatencySeconds * (this.options.weights?.latencyWeight ?? 0) + reorgRiskBps * (this.options.weights?.riskWeight ?? 0) + rpcErrorRate * (this.options.weights?.reliabilityWeight ?? 0) + liquidityPenalty;
        const quotedAt = new Date(this.now()).toISOString();
        const snapshot = { network: route.network, chainId: route.chainId, gasLimit, gasPriceWei, estimatedFeeWei, estimatedFeeUsd, settlementFeeUsd, expectedLatencySeconds, reorgRiskBps, rpcErrorRate, liquidityPenalty, score, quotedAt };
        return { ...snapshot, name: route.name, estimatedGasUsd: estimatedFeeUsd, eligible: reasons.length === 0, reasons, quoteHash: `0x${createHash("sha256").update(stableJson(snapshot)).digest("hex")}` };
    }
    compareQuotes(left, right) {
        if (left.score !== right.score)
            return left.score - right.score;
        if (this.options.preferredNetwork) {
            if (left.network === this.options.preferredNetwork && right.network !== this.options.preferredNetwork)
                return -1;
            if (right.network === this.options.preferredNetwork && left.network !== this.options.preferredNetwork)
                return 1;
        }
        if (left.network === "eip155:8453" && right.network !== "eip155:8453")
            return -1;
        if (right.network === "eip155:8453" && left.network !== "eip155:8453")
            return 1;
        return left.network.localeCompare(right.network);
    }
    now() {
        return (this.options.clock ?? (() => Date.now()))();
    }
}
