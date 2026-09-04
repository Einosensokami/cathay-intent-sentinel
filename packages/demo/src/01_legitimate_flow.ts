import {
  ControlledRetryClient,
  createInMemoryFacilitator,
  createResourceServerMiddleware,
  decodeHeader,
  type PaymentRequired,
  type PaymentSigner,
  type PolicyGate,
} from "@intent-sentinel/agent-client";
import { printDashboard, type DashboardState } from "./dashboard.js";

const INTEL_URL = "https://intel.cathay.example/reports/ai-threats";
const MERCHANT = "0x1111111111111111111111111111111111111111";
const AGENT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USDC_UNITS = "10000"; // 0.01 USDC at six decimals

const quote: PaymentRequired = {
  x402Version: 2,
  resource: INTEL_URL,
  accepts: [{ scheme: "exact", network: "base", asset: "USDC", amount: USDC_UNITS, payTo: MERCHANT }],
};

const policyGate: PolicyGate = {
  evaluate(intent) {
    const reasons: string[] = [];
    if (intent.payTo.toLowerCase() !== MERCHANT.toLowerCase()) reasons.push("[MERCHANT MISMATCH]");
    if (BigInt(intent.maxAmount) > BigInt(USDC_UNITS)) reasons.push("[BUDGET EXCEEDED]");
    return { allowed: reasons.length === 0, reasons, policyId: "demo-cfo-policy-v1" };
  },
};

const signer: PaymentSigner = {
  async sign(intent) {
    const now = Math.floor(Date.now() / 1000);
    return {
      authorization: {
        from: AGENT,
        to: intent.payTo,
        value: intent.amount,
        validAfter: String(now - 5),
        validBefore: String(now + 300),
        nonce: intent.nonce,
      },
      // A real deployment delegates this operation to the isolated key vault.
      signature: "0x" + "ab".repeat(65),
    };
  },
};

export async function runLegitimateFlow(): Promise<void> {
  const facilitator = createInMemoryFacilitator("0xlegitimate");
  const protectedResource = createResourceServerMiddleware({
    paymentRequired: quote,
    facilitator,
    handler: async () => new Response(JSON.stringify({ report: "critical CVE intelligence", receipt: "issued" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  const events: string[] = [];
  const client = new ControlledRetryClient({
    fetch: (input, init) => protectedResource(new Request(input, init)),
    policyGate,
    signer,
    onEvent: (event) => events.push(event.type),
  });
  const response = await client.fetch(INTEL_URL, undefined, { taskId: "threat-intel-purchase", purpose: "protect customer systems" });
  const body = await response.json() as { receipt: string };
  const receiptHeader = response.headers.get("PAYMENT-RESPONSE");
  const receipt = receiptHeader ? decodeHeader<{ txHash?: string }>(receiptHeader) : {};
  const state: DashboardState = {
    transactions: [{ id: "legitimate-1", scenario: "Legitimate threat intel", merchant: "Cathay Intel", amount: "0.01 USDC", status: "settled", ...(receipt.txHash ? { txHash: receipt.txHash } : {}) }],
    spent: 10000n,
    budget: 100000n,
    alerts: [{ severity: "info", message: `Policy approved · ${events.join(" → ")}` }],
  };
  printDashboard(state);
  console.log(`\n✅ 200 OK — ${body.receipt}; receipt ${receipt.txHash ?? "pending"}`);
}

runLegitimateFlow().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
