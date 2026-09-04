import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  type PaymentIntent,
} from "@cathay/intent-sentinel-core";
import {
  PolicyGate,
  InMemoryTrustRegistry,
  InMemoryUsageLedger,
  InMemoryHumanApprovalWorkflow,
} from "../src/index.js";

const VALID_PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

const baseIntent: PaymentIntent = {
  task_id: "task-001",
  resource: "https://api.example.test/intel",
  payee: VALID_PAYEE,
  max_amount: "10000",
  asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
  expires_at: 2_000_000_100,
};

function createGate(trustRegistry = new InMemoryTrustRegistry()) {
  trustRegistry.register({
    identity: {
      address: VALID_PAYEE,
      merchant_url: "https://api.example.test/intel",
      name: "Example Provider",
    },
    reputation: {
      score: 95,
      successful_settlements: 100,
      disputes: 0,
      last_updated: 2_000_000_000,
    },
  });

  return new PolicyGate(
    {
      per_call_budget_cap: "50000",
      daily_budget_cap: "1000000",
      allowed_merchant_url_patterns: ["https://api.example.test/*", "https://api.example.test"],
      allowed_payee_addresses: [VALID_PAYEE.toLowerCase()],
      high_risk_threshold: "200000",
      velocity_limit: { max_calls: 10, window_seconds: 60 },
      task_specific_caps: { "task-001": "100000" },
    },
    {
      trustRegistry,
      usageLedger: new InMemoryUsageLedger(),
      approvalWorkflow: new InMemoryHumanApprovalWorkflow(),
      now: () => 2_000_000_000,
    }
  );
}

test("policy gate allows valid intent within budget and allowlist", async () => {
  const gate = createGate();
  const decision = await gate.evaluate(baseIntent, {
    task_id: baseIntent.task_id,
    resource: baseIntent.resource,
    payee: baseIntent.payee,
    max_amount: baseIntent.max_amount,
    asset_network: baseIntent.asset_network,
    expires_at: baseIntent.expires_at,
    merchant_url: "https://api.example.test/intel",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.status, "allow");
  assert.equal(decision.violations.length, 0);
});

test("policy gate blocks unauthorized merchant or payee (OWASP ASI02 / Merchant Mismatch)", async () => {
  const gate = createGate();
  const maliciousIntent: PaymentIntent = {
    ...baseIntent,
    payee: "0x9999999999999999999999999999999999999999",
  };

  const decision = await gate.evaluate(maliciousIntent, {
    task_id: maliciousIntent.task_id,
    resource: maliciousIntent.resource,
    payee: maliciousIntent.payee,
    max_amount: maliciousIntent.max_amount,
    asset_network: maliciousIntent.asset_network,
    expires_at: maliciousIntent.expires_at,
    merchant_url: "https://attacker.evil.test",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((r) => r.toLowerCase().includes("payee") || r.toLowerCase().includes("merchant") || r.toLowerCase().includes("allowlist") || r.toLowerCase().includes("trust")));
});

test("policy gate blocks amount exceeding per-call budget (OWASP ASI03 / Budget Exceeded)", async () => {
  const gate = createGate();
  const overBudgetIntent: PaymentIntent = {
    ...baseIntent,
    max_amount: "999999",
  };

  const decision = await gate.evaluate(overBudgetIntent, {
    task_id: overBudgetIntent.task_id,
    resource: overBudgetIntent.resource,
    payee: overBudgetIntent.payee,
    max_amount: overBudgetIntent.max_amount,
    asset_network: overBudgetIntent.asset_network,
    expires_at: overBudgetIntent.expires_at,
    merchant_url: "https://api.example.test/intel",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((r) => r.toLowerCase().includes("budget") || r.toLowerCase().includes("cap") || r.toLowerCase().includes("amount")));
});

test("policy gate blocks expired intent", async () => {
  const gate = createGate();
  const expiredIntent: PaymentIntent = {
    ...baseIntent,
    expires_at: 1_999_999_000,
  };

  const decision = await gate.evaluate(expiredIntent, {
    task_id: expiredIntent.task_id,
    resource: expiredIntent.resource,
    payee: expiredIntent.payee,
    max_amount: expiredIntent.max_amount,
    asset_network: expiredIntent.asset_network,
    expires_at: expiredIntent.expires_at,
    merchant_url: "https://api.example.test/intel",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "deny");
});
