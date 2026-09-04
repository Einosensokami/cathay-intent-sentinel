import {
  ControlledRetryClient,
  createResourceServerMiddleware,
  decodeHeader,
  type PaymentRequired,
  type PaymentSigner,
  type PolicyGate,
  type SettlementResult,
} from "@intent-sentinel/agent-client";
import { printDashboard, type DashboardState } from "./dashboard.js";

const URL = "https://llm.cathay.example/v1/stream";
const PAYEE = "0x2222222222222222222222222222222222222222";
const CAP = "50000"; // 0.05 USDC in six-decimal base units
const ACTUAL = "32750"; // 0.03275 USDC, determined by the stream

const quote: PaymentRequired = {
  x402Version: 2,
  resource: URL,
  accepts: [{ scheme: "upto", network: "base", asset: "USDC", amount: CAP, payTo: PAYEE }],
};

const policyGate: PolicyGate = { evaluate: (intent) => ({ allowed: BigInt(intent.maxAmount) <= BigInt(CAP), policyId: "stream-cap-v1" }) };
const signer: PaymentSigner = {
  async sign(intent) {
    const now = Math.floor(Date.now() / 1000);
    return {
      authorization: { from: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", to: intent.payTo, value: intent.maxAmount, validAfter: String(now - 5), validBefore: String(now + 300), nonce: intent.nonce },
      signature: "0x" + "cd".repeat(65),
      extensions: { billing: "token-metered", capUnits: intent.maxAmount },
    };
  },
};

const facilitator = {
  async settle(): Promise<SettlementResult> {
    return { success: true, status: "settled", txHash: "0xstream_00000001", receipt: { authorizedCap: CAP, charged: ACTUAL, unit: "USDC base units", usageTokens: 3275 } };
  },
};

export async function runStreamingUptoFlow(): Promise<void> {
  const protectedResource = createResourceServerMiddleware({
    paymentRequired: quote,
    facilitator,
    handler: async () => new Response("data: tokenized threat intelligence\n\ndata: [DONE]\n", { status: 200, headers: { "content-type": "text/event-stream" } }),
  });
  const client = new ControlledRetryClient({ fetch: (input, init) => protectedResource(new Request(input, init)), policyGate, signer });
  const response = await client.fetch(URL, undefined, { taskId: "streaming-threat-summary", purpose: "metered LLM analysis" });
  const paymentResponse = decodeHeader<{ txHash?: string; receipt?: { charged?: string; usageTokens?: number } }>(response.headers.get("PAYMENT-RESPONSE") ?? "{}");
  const charged = paymentResponse.receipt?.charged ?? ACTUAL;
  const state: DashboardState = {
    transactions: [{ id: "stream-1", scenario: "Streaming LLM (upto)", merchant: "Cathay LLM", amount: `${Number(charged) / 1_000_000} USDC`, status: "settled", ...(paymentResponse.txHash ? { txHash: paymentResponse.txHash } : {}) }],
    spent: BigInt(charged),
    budget: 100000n,
    alerts: [{ severity: "info", message: `Cap ${Number(CAP) / 1_000_000} USDC · charged ${Number(charged) / 1_000_000} USDC · 32.75% of cap` }],
  };
  printDashboard(state);
  console.log(`\n✅ Stream complete — upto cap ${Number(CAP) / 1_000_000} USDC; actual charge ${Number(charged) / 1_000_000} USDC.`);
}

runStreamingUptoFlow().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
