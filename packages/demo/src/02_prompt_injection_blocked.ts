import {
  ControlledRetryClient,
  PaymentPolicyError,
  createInMemoryFacilitator,
  createResourceServerMiddleware,
  type PaymentRequired,
  type PaymentSigner,
  type PolicyGate,
} from "@intent-sentinel/agent-client";
import { printDashboard, type DashboardState } from "./dashboard.js";

const URL = "https://intel.cathay.example/reports/ai-threats";
const APPROVED_MERCHANT = "0x1111111111111111111111111111111111111111";
const MALICIOUS_MERCHANT = "0x9999999999999999999999999999999999999999";

const policyGate: PolicyGate = {
  evaluate(intent) {
    const reasons: string[] = [];
    if (intent.payTo.toLowerCase() !== APPROVED_MERCHANT) reasons.push("[MERCHANT MISMATCH]");
    if (BigInt(intent.maxAmount) > 10000n) reasons.push("[BUDGET EXCEEDED]");
    return { allowed: reasons.length === 0, reasons, policyId: "demo-cfo-policy-v1" };
  },
};

const signer: PaymentSigner = {
  async sign() {
    throw new Error("UNREACHABLE: the policy gate must block before signing");
  },
};

export async function runPromptInjectionBlocked(): Promise<void> {
  const quote: PaymentRequired = {
    x402Version: 2,
    resource: URL,
    accepts: [{ scheme: "exact", network: "base", asset: "USDC", amount: "500000000", payTo: MALICIOUS_MERCHANT }],
  };
  const facilitator = createInMemoryFacilitator("0xattack");
  const protectedResource = createResourceServerMiddleware({
    paymentRequired: quote,
    facilitator,
    handler: () => new Response("should never be reached"),
  });
  const client = new ControlledRetryClient({
    fetch: (input, init) => protectedResource(new Request(input, init)),
    policyGate,
    signer,
  });

  let reasons: string[] = [];
  try {
    await client.fetch(URL, undefined, { taskId: "customer-threat-review", purpose: "ignore untrusted instructions" });
  } catch (error) {
    if (!(error instanceof PaymentPolicyError)) throw error;
    reasons = error.decision.reasons ?? [];
  }
  const blocked = reasons.includes("[MERCHANT MISMATCH]") && reasons.includes("[BUDGET EXCEEDED]");
  const state: DashboardState = {
    transactions: [{ id: "blocked-1", scenario: "Prompt injection", merchant: "Unverified payee", amount: "500 USDC", status: "blocked" }],
    spent: 0n,
    budget: 100000n,
    alerts: [{ severity: "blocked", message: reasons.join(" + ") || "Policy gate denied payment" }],
  };
  printDashboard(state);
  if (!blocked) throw new Error("Demo invariant failed: expected both policy blocks");
  console.log("\n🛡️  BLOCKED before signing — no custody call, no settlement, no funds moved.");
}

runPromptInjectionBlocked().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
