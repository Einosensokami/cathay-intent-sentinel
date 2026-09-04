import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  type PaymentIntent,
  type PaymentRequirements,
} from "../../core/src/index.js";
import {
  PolicyGate,
  InMemoryTrustRegistry,
  InMemoryUsageLedger,
  InMemoryNonceRegistry,
  InMemoryHumanApprovalWorkflow,
} from "../src/index.js";
import {
  ScopedKeyVault,
  Erc3009Signer,
} from "../../key-vault/src/index.js";
import {
  verifyPayment,
  Facilitator,
  type NonceStore,
  type BalanceReader,
} from "../../facilitator/src/index.js";

const VALID_PAYEE = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const ATTACKER_PAYEE = "0x9999999999999999999999999999999999999999";
const PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123" as const;

class MockBalanceReader implements BalanceReader {
  async getBalance(): Promise<bigint> {
    return 10_000_000n; // 10 USDC
  }
}

class TestNonceStore implements NonceStore {
  private readonly consumed = new Set<string>();
  async isConsumed(nonce: string): Promise<boolean> { return this.consumed.has(nonce); }
  async consume(nonce: string): Promise<boolean> {
    if (this.consumed.has(nonce)) return false;
    this.consumed.add(nonce);
    return true;
  }
  async release(nonce: string): Promise<void> { this.consumed.delete(nonce); }
}

function setupEnvironment() {
  const trustRegistry = new InMemoryTrustRegistry();
  trustRegistry.register({
    identity: {
      address: VALID_PAYEE,
      merchant_url: "https://api.cathay-verified.com/intel",
      name: "Cathay Verified Provider",
    },
    reputation: {
      score: 98,
      successful_settlements: 500,
      disputes: 0,
      last_updated: 2_000_000_000,
    },
  });

  const gate = new PolicyGate(
    {
      per_call_budget_cap: "50000",
      daily_budget_cap: "1000000",
      allowed_merchant_url_patterns: [
        "https://api.cathay-verified.com/*",
        "https://api.cathay-verified.com",
      ],
      allowed_payee_addresses: [VALID_PAYEE.toLowerCase()],
      high_risk_threshold: "200000",
      velocity_limit: { max_calls: 5, window_seconds: 60 },
      task_specific_caps: { "task-research-42": "100000" },
    },
    {
      trustRegistry,
      usageLedger: new InMemoryUsageLedger(),
      nonceRegistry: new InMemoryNonceRegistry(),
      approvalWorkflow: new InMemoryHumanApprovalWorkflow(),
      now: () => 2_000_000_000,
    }
  );

  return { gate, trustRegistry };
}

test("⚔️ RED-TEAM ATTACK 1: Prompt Injection Subdomain / Homograph Hijack (ASI01/ASI02)", async () => {
  const { gate } = setupEnvironment();
  const spoofedIntent: PaymentIntent = {
    task_id: "task-research-42",
    resource: "https://api.cathay-verified.com.attacker-fake.net/data",
    payee: ATTACKER_PAYEE,
    max_amount: "10000",
    asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
    expires_at: 2_000_000_100,
  };

  const decision = await gate.evaluate(spoofedIntent, {
    task_id: spoofedIntent.task_id,
    resource: spoofedIntent.resource,
    payee: spoofedIntent.payee,
    max_amount: spoofedIntent.max_amount,
    asset_network: spoofedIntent.asset_network,
    expires_at: spoofedIntent.expires_at,
    merchant_url: spoofedIntent.resource,
  });

  assert.equal(decision.allowed, false, "Homograph domain hijack must be blocked");
  assert.equal(decision.status, "deny");
  assert.ok(decision.reasons.some((r) => r.toLowerCase().includes("payee") || r.toLowerCase().includes("merchant")));
});

test("⚔️ RED-TEAM ATTACK 2: High-Frequency Micro-Drain Velocity Bypass (ASI03)", async () => {
  const { gate } = setupEnvironment();
  const legitimateIntent: PaymentIntent = {
    task_id: "task-research-42",
    resource: "https://api.cathay-verified.com/intel",
    payee: VALID_PAYEE,
    max_amount: "5000",
    asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
    expires_at: 2_000_000_100,
  };

  for (let i = 0; i < 5; i++) {
    const decision = await gate.evaluate(legitimateIntent, {
      task_id: legitimateIntent.task_id,
      resource: legitimateIntent.resource,
      payee: legitimateIntent.payee,
      max_amount: legitimateIntent.max_amount,
      asset_network: legitimateIntent.asset_network,
      expires_at: legitimateIntent.expires_at,
      merchant_url: "https://api.cathay-verified.com/intel",
    });
    assert.equal(decision.allowed, true, `Call ${i + 1} should be within velocity limit`);
    await gate.recordSettlement(legitimateIntent, "5000", 2_000_000_000);
  }

  const blockedDecision = await gate.evaluate(legitimateIntent, {
    task_id: legitimateIntent.task_id,
    resource: legitimateIntent.resource,
    payee: legitimateIntent.payee,
    max_amount: legitimateIntent.max_amount,
    asset_network: legitimateIntent.asset_network,
    expires_at: legitimateIntent.expires_at,
    merchant_url: "https://api.cathay-verified.com/intel",
  });

  assert.equal(blockedDecision.allowed, false, "6th micro-drain call must be blocked by velocity limit");
  assert.ok(blockedDecision.reasons.some((r) => r.toLowerCase().includes("velocity") || r.toLowerCase().includes("cap")));
});

test("⚔️ RED-TEAM ATTACK 3: Cross-Network Replay Attack (Testnet Sepolia -> Mainnet) (ASI08)", async () => {
  const intent: PaymentIntent = {
    task_id: "task-research-42",
    resource: "https://api.cathay-verified.com/intel",
    payee: VALID_PAYEE,
    max_amount: "10000",
    asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
    expires_at: 2_000_000_100,
  };

  const reqSepolia: PaymentRequirements = {
    scheme: "exact",
    network: BASE_SEPOLIA,
    amount: "10000",
    asset: BASE_SEPOLIA_USDC,
    payTo: VALID_PAYEE,
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
  };

  const vault = new ScopedKeyVault({ privateKey: PRIVATE_KEY, intent, clock: () => 2_000_000_000 });
  const signer = new Erc3009Signer(vault);
  const paymentPayload = await signer.signPayment(intent, reqSepolia, { now: 2_000_000_000 });

  const nonceStore = new TestNonceStore();
  const balanceReader = new MockBalanceReader();

  const reqMainnet: PaymentRequirements = {
    ...reqSepolia,
    network: BASE_MAINNET,
  };

  const verifyResult = await verifyPayment(
    { paymentPayload, paymentRequirements: reqMainnet },
    { nonceStore, balanceReader, now: () => 2_000_000_000, domainName: "USDC", domainVersion: "2" }
  );

  assert.equal(verifyResult.ok, false, "Cross-network signature replay must be rejected");
  if (!verifyResult.ok) {
    assert.ok(
      verifyResult.error?.code === "INVALID_SIGNATURE" ||
      verifyResult.error?.code === "REQUIREMENTS_MISMATCH",
      `Expected signature/mismatch error, got ${verifyResult.error?.code}`
    );
  }
});

test("⚔️ RED-TEAM ATTACK 4: Concurrent Double-Spend Replay Race in Settlement (ASI08)", async () => {
  const intent: PaymentIntent = {
    task_id: "task-research-42",
    resource: "https://api.cathay-verified.com/intel",
    payee: VALID_PAYEE,
    max_amount: "10000",
    asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
    expires_at: 2_000_000_100,
  };

  const req: PaymentRequirements = {
    scheme: "exact",
    network: BASE_SEPOLIA,
    amount: "10000",
    asset: BASE_SEPOLIA_USDC,
    payTo: VALID_PAYEE,
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
  };

  const vault = new ScopedKeyVault({ privateKey: PRIVATE_KEY, intent, clock: () => 2_000_000_000 });
  const signer = new Erc3009Signer(vault);
  const paymentPayload = await signer.signPayment(intent, req, { now: 2_000_000_000 });

  const nonceStore = new TestNonceStore();
  const balanceReader = new MockBalanceReader();
  let submitCount = 0;
  const facilitator = new Facilitator({
    nonceStore,
    balanceReader,
    domainName: "USDC",
    domainVersion: "2",
    submitter: {
      async submit() {
        submitCount++;
        return { txHash: "0xsettle_tx_hash_001" };
      },
    },
    now: () => 2_000_000_000,
  });

  const settle1 = await facilitator.settle({
    idempotency_key: "idem-key-1",
    paymentPayload,
    paymentRequirements: req,
  });
  assert.equal(settle1.ok, true, "Initial settlement must succeed");
  assert.equal(submitCount, 1, "Submitter should have been called once");

  const settle2 = await facilitator.settle({
    idempotency_key: "idem-key-1",
    paymentPayload,
    paymentRequirements: req,
  });
  assert.equal(settle2.ok, true);
  assert.equal(settle2.status, "idempotent");
  assert.equal(submitCount, 1, "Submitter must NOT be called a second time (zero double-spending)");
});
