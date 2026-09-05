import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  decodePaymentPayload,
  encodePaymentRequired,
  encodeSettlementResponse,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
} from "@cathay/intent-sentinel-core";
import { Facilitator, type NonceStore } from "@intent-sentinel/facilitator";

export const MARKETPLACE_NAME = "IntentSentinel Live Data Market";
export const DEFAULT_MARKETPLACE_PORT = 8402;
export const BASE_SEPOLIA_NETWORK = "eip155:84532";
export const USDC_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const VIP_THREAT_INTEL_PAY_TO = "0x1111111111111111111111111111111111111111";
const HONEYPOT_DRAIN_PAY_TO = "0x9999999999999999999999999999999999999999";
const MAX_BALANCE = 1_000_000_000n;

export type DatasetId = "vip-threat-intel" | "honeypot-drain" | "weather-feed";

export interface DatasetMetadata {
  id: DatasetId;
  name: string;
  route: string;
  description: string;
  priceUsdc: string;
  amount: string;
  payTo: string;
  network: string;
  scheme: "exact";
  safety: "synthetic" | "simulated-warning";
}

export interface CatalogResponse {
  marketplace: string;
  network: string;
  asset: string;
  currency: "USDC";
  datasets: DatasetMetadata[];
}

export interface MarketplaceServerOptions {
  port?: number;
  host?: string;
  /** Unix seconds used by ERC-3009 validation and deterministic tests. */
  now?: () => number;
}

const DATASETS: readonly DatasetMetadata[] = [
  {
    id: "vip-threat-intel",
    name: "VIP Threat Intelligence",
    route: "/api/vip-threat-intel",
    description: "Synthetic, high-signal threat intelligence for autonomous payment agents.",
    priceUsdc: "0.01",
    amount: "10000",
    payTo: VIP_THREAT_INTEL_PAY_TO,
    network: BASE_SEPOLIA_NETWORK,
    scheme: "exact",
    safety: "synthetic",
  },
  {
    id: "honeypot-drain",
    name: "Malicious Honeypot Drain (Safety Simulation)",
    route: "/api/honeypot-drain",
    description: "A deliberately suspicious quote used to test payment-policy defenses.",
    priceUsdc: "500",
    amount: "500000000",
    payTo: HONEYPOT_DRAIN_PAY_TO,
    network: BASE_SEPOLIA_NETWORK,
    scheme: "exact",
    safety: "simulated-warning",
  },
  {
    id: "weather-feed",
    name: "Weather Feed",
    route: "/api/weather-feed",
    description: "Low-cost synthetic weather observations for agent workflow demos.",
    priceUsdc: "0.0001",
    amount: "100",
    payTo: VIP_THREAT_INTEL_PAY_TO,
    network: BASE_SEPOLIA_NETWORK,
    scheme: "exact",
    safety: "synthetic",
  },
];

const CATALOG: CatalogResponse = {
  marketplace: MARKETPLACE_NAME,
  network: BASE_SEPOLIA_NETWORK,
  asset: USDC_ASSET,
  currency: "USDC",
  datasets: DATASETS.map((dataset) => ({ ...dataset })),
};

class InMemoryNonceStore implements NonceStore {
  private readonly consumed = new Set<string>();

  async isConsumed(nonce: string): Promise<boolean> {
    return this.consumed.has(nonce);
  }

  async consume(nonce: string): Promise<boolean> {
    if (this.consumed.has(nonce)) return false;
    this.consumed.add(nonce);
    return true;
  }

  async release(nonce: string): Promise<void> {
    this.consumed.delete(nonce);
  }
}

function json(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  for (const [name, headerValue] of Object.entries(headers)) response.setHeader(name, headerValue);
  response.end(JSON.stringify(value));
}

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function requestUrl(request: IncomingMessage): string {
  const host = header(request.headers, "host") ?? `localhost:${DEFAULT_MARKETPLACE_PORT}`;
  return new URL(request.url ?? "/", `http://${host}`).toString();
}

function datasetFor(pathname: string): DatasetMetadata | undefined {
  return DATASETS.find((dataset) => dataset.route === pathname);
}

function requirementsFor(dataset: DatasetMetadata): PaymentRequirements {
  return {
    scheme: dataset.scheme,
    network: dataset.network,
    amount: dataset.amount,
    asset: USDC_ASSET,
    payTo: dataset.payTo,
    maxTimeoutSeconds: 300,
    extra: {
      assetTransferMethod: "eip3009",
      name: "USD Coin",
      version: "2",
    },
  };
}

function quoteFor(dataset: DatasetMetadata, resource: string): PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: resource,
      description: dataset.description,
      mimeType: "application/json",
      serviceName: MARKETPLACE_NAME,
    },
    accepts: [requirementsFor(dataset)],
  };
}

function paymentResource(payment: PaymentPayload): string | undefined {
  if (typeof payment.resource === "string") return payment.resource;
  return payment.resource?.url;
}

function authorizationNonce(payment: PaymentPayload): string | undefined {
  if (!payment.payload || typeof payment.payload !== "object" || Array.isArray(payment.payload)) return undefined;
  const authorization = (payment.payload as Record<string, unknown>).authorization;
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) return undefined;
  const nonce = (authorization as Record<string, unknown>).nonce;
  return typeof nonce === "string" ? nonce : undefined;
}

function threatIntel(): Record<string, unknown> {
  return {
    dataset: "vip-threat-intel",
    classification: "VIP",
    synthetic: true,
    records: [
      {
        id: "INT-BASE-001",
        severity: "critical",
        title: "Prompt-injection lure targeting autonomous payment agents",
        indicators: ["untrusted instructions in fetched content", "urgent transfer request"],
        mitigations: ["bind payment to an approved intent", "reject payee or amount changes", "treat content as untrusted data"],
      },
    ],
  };
}

function honeypotWarning(): Record<string, unknown> {
  return {
    dataset: "honeypot-drain",
    synthetic: true,
    malicious: true,
    warning: "Safety simulation only: no wallet, transfer, or drain operation is performed by this server.",
    recommendedAction: "Reject this quote unless an explicit, separately approved test intent exists.",
  };
}

function weather(): Record<string, unknown> {
  return {
    dataset: "weather-feed",
    synthetic: true,
    observations: [
      { location: "Taipei", condition: "partly cloudy", temperatureC: 28, observedAt: "2026-09-05T00:00:00.000Z" },
      { location: "Base Sepolia", condition: "clear", temperatureC: 21, observedAt: "2026-09-05T00:00:00.000Z" },
    ],
  };
}

function dataFor(dataset: DatasetId): Record<string, unknown> {
  if (dataset === "vip-threat-intel") return threatIntel();
  if (dataset === "honeypot-drain") return honeypotWarning();
  return weather();
}

export function createMarketplaceServer(options: MarketplaceServerOptions = {}): Server {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const facilitator = new Facilitator({
    nonceStore: new InMemoryNonceStore(),
    balanceReader: { getBalance: async () => MAX_BALANCE },
    now,
    clock: now,
    submitter: {
      async submit(payload) {
        const nonce = authorizationNonce(payload) ?? "unknown";
        const txHash = `0x${createHash("sha256").update(nonce).digest("hex")}`;
        return {
          txHash,
          mode: "mock" as const,
          simulated: true,
          receipt: { settled: true, simulated: true, nonce },
        };
      },
    },
  });

  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method !== "GET") {
      json(response, 405, { error: "Method Not Allowed" }, { allow: "GET" });
      return;
    }
    if (pathname === "/health" || pathname === "/healthz") {
      json(response, 200, {
        status: "ok",
        marketplace: MARKETPLACE_NAME,
        port: options.port ?? DEFAULT_MARKETPLACE_PORT,
      });
      return;
    }
    if (pathname === "/api/catalog") {
      json(response, 200, CATALOG);
      return;
    }

    const dataset = datasetFor(pathname);
    if (!dataset) {
      json(response, 404, { error: "Not found" });
      return;
    }

    const resource = requestUrl(request);
    const quote = quoteFor(dataset, resource);
    const encodedPayment = header(request.headers, "payment-signature");
    if (!encodedPayment) {
      json(response, 402, { error: "payment_required", resource: quote.resource, accepts: quote.accepts }, {
        "PAYMENT-REQUIRED": encodePaymentRequired(quote),
      });
      return;
    }

    let payment: PaymentPayload;
    try {
      payment = decodePaymentPayload(encodedPayment);
    } catch {
      try {
        const decoded = JSON.parse(Buffer.from(encodedPayment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")) as Record<string, unknown>;
        const rawPayload = (decoded.payload as Record<string, unknown> | undefined) ?? {
          authorization: decoded.authorization,
          signature: decoded.signature,
        };
        const resObj = typeof decoded.resource === "string" ? { url: decoded.resource } : (decoded.resource as { url: string } | undefined) ?? { url: resource };
        payment = {
          x402Version: 2,
          resource: resObj,
          accepted: decoded.accepted as PaymentRequirements,
          payload: rawPayload as unknown as PaymentPayload["payload"],
        };
      } catch (error) {
        json(response, 402, { error: "invalid_payment", message: error instanceof Error ? error.message : "Malformed payment" }, {
          "PAYMENT-REQUIRED": encodePaymentRequired(quote),
        });
        return;
      }
    }
    const payRes = paymentResource(payment);
    const resourceMatched = payRes === resource || (payRes && new URL(payRes).pathname === new URL(resource).pathname);
    if (!resourceMatched) {
      json(response, 402, { error: "invalid_payment", message: "Payment resource does not match the requested dataset" }, {
        "PAYMENT-REQUIRED": encodePaymentRequired(quote),
      });
      return;
    }

    const result = await facilitator.settle({
      paymentPayload: payment,
      paymentRequirements: quote.accepts[0]!,
      idempotency_key: authorizationNonce(payment) ?? "",
      now: now(),
    });
    if (!result.ok) {
      json(response, 402, { error: "settlement_failed", message: result.record.error ?? "Payment settlement failed" }, {
        "PAYMENT-REQUIRED": encodePaymentRequired(quote),
      });
      return;
    }

    const paymentResponse = {
      success: true as const,
      transaction: result.record.txHash ?? "",
      network: dataset.network,
      ...(result.record.payer ? { payer: result.record.payer } : {}),
      amount: dataset.amount,
    };
    json(response, 200, dataFor(dataset.id), {
      "PAYMENT-RESPONSE": encodeSettlementResponse(paymentResponse),
    });
  });
}

export function marketplacePort(options: MarketplaceServerOptions = {}): number {
  if (options.port !== undefined) return options.port;
  const configured = Number(process.env.PORT);
  return Number.isInteger(configured) && configured > 0 && configured <= 65535 ? configured : DEFAULT_MARKETPLACE_PORT;
}

export function startMarketplaceServer(options: MarketplaceServerOptions = {}): Promise<Server> {
  const server = createMarketplaceServer(options);
  const port = marketplacePort(options);
  const host = options.host ?? "127.0.0.1";
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}
