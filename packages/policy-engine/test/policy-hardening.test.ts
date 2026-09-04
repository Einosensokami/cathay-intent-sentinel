import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryHumanApprovalWorkflow,
  InMemoryNonceRegistry,
  InMemoryTrustRegistry,
  InMemoryUsageLedger,
  PolicyGate,
  type PaymentIntent,
  type PolicyConfig,
  type TaskContext,
} from "../src/index.js";

const payee = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const intent: PaymentIntent = {
  task_id: "task-hardening",
  resource: "https://merchant.example/data",
  payee,
  max_amount: "10",
  asset_network: { asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", network: "eip155:84532" },
  expires_at: 2_000_000_100,
  nonce: `0x${"ab".repeat(32)}`,
};
const context: TaskContext = { ...intent, merchant_url: "https://merchant.example" };
const policy: PolicyConfig = {
  per_call_budget_cap: "100",
  daily_budget_cap: "100",
  task_specific_caps: { [intent.task_id]: "50" },
  velocity_limit: { max_calls: 1, window_seconds: 60 },
  allowed_merchant_url_patterns: ["https://merchant.example*"],
  allowed_payee_addresses: [payee],
  high_risk_threshold: "20",
};

function registry(): InMemoryTrustRegistry {
  const result = new InMemoryTrustRegistry();
  result.register({ address: payee, merchant_url: "https://merchant.example", reputation_score: 100 });
  return result;
}

test("policy controls are atomic at settlement recording and replay is denied", async () => {
  const nonces = new InMemoryNonceRegistry();
  const gate = new PolicyGate(policy, { trustRegistry: registry(), nonceRegistry: nonces, usageLedger: new InMemoryUsageLedger(), now: () => 2_000_000_000 });
  assert.equal((await gate.evaluate(intent, context)).allowed, true);
  await gate.recordSettlement(intent, "10");
  assert.equal((await gate.evaluate({ ...intent, nonce: `0x${"ac".repeat(32)}` }, { ...context, nonce: undefined } as TaskContext)).allowed, false);
  assert.ok((await gate.evaluate({ ...intent, nonce: `0x${"ac".repeat(32)}` }, context)).violations.some((v) => v.code === "VELOCITY_EXCEEDED"));
  await nonces.consume(intent.nonce!);
  assert.ok((await gate.evaluate(intent, context)).violations.some((v) => v.code === "NONCE_REPLAY"));
});

test("approval is bound to the exact intent and expires", async () => {
  const workflow = new InMemoryHumanApprovalWorkflow({ approval_ttl_seconds: 5 });
  const gate = new PolicyGate({ ...policy, high_risk_threshold: "5" }, { trustRegistry: registry(), approvalWorkflow: workflow, now: () => 2_000_000_000 });
  const pending = await gate.evaluate(intent, context);
  assert.equal(pending.status, "requires_approval");
  assert.ok(pending.approval_request);
  await workflow.approve(pending.approval_request!.id, "cfo", 2_000_000_001);
  assert.equal((await gate.evaluate(intent, { ...context, approval_id: pending.approval_request!.id })).allowed, true);
  const other = await gate.evaluate({ ...intent, resource: "https://merchant.example/other" }, { ...context, resource: "https://merchant.example/other", approval_id: pending.approval_request!.id });
  assert.equal(other.allowed, false);
  const expired = await workflow.requestApproval(intent, "manual", 2_000_000_000);
  assert.equal((await workflow.getApproval(expired.id, 2_000_000_006))?.status, "expired");
});
