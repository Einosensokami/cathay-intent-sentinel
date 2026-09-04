import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { BASE_SEPOLIA, type ExactEvmPayload, type PaymentPayload, type PaymentRequirements } from "@cathay/intent-sentinel-core";
import { Facilitator, TimeoutUnknownOutcomeError } from "../src/index.js";
import { verifyPayment, type NonceStore } from "../src/verify.js";

const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const asset = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const payTo = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const requirements: PaymentRequirements = {
  scheme: "exact", network: BASE_SEPOLIA, asset, payTo, amount: "10000", maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2", resource: "https://merchant.example/data" },
};
const authorization = {
  from: wallet.address,
  to: payTo,
  value: "10000",
  validAfter: "1999999900",
  validBefore: "2000000100",
  nonce: `0x${"aa".repeat(32)}`,
};

async function signedPayload(nonce = authorization.nonce): Promise<PaymentPayload<ExactEvmPayload>> {
  const message = { ...authorization, nonce };
  const signature = await wallet.signTypedData(
    { name: "USDC", version: "2", chainId: 84532, verifyingContract: asset },
    { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] }, message,
  );
  return { x402Version: 2, resource: { url: "https://merchant.example/data" }, accepted: requirements, payload: { authorization: message, signature } };
}

class TestNonceStore implements NonceStore {
  readonly consumed = new Set<string>();
  async isConsumed(nonce: string): Promise<boolean> { return this.consumed.has(nonce); }
  async consume(nonce: string): Promise<boolean> { if (this.consumed.has(nonce)) return false; this.consumed.add(nonce); return true; }
  async release(nonce: string): Promise<void> { this.consumed.delete(nonce); }
}

function common(nonceStore: TestNonceStore, submitter: { submit: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<{ txHash: string }> }) {
  return {
    nonceStore,
    balanceReader: { getBalance: async () => 10000n },
    submitter,
    now: () => 2_000_000_000,
    clock: () => 2_000_000_000,
  };
}

test("verifyPayment validates canonical x402 v2/ERC-3009 and remains read-only", async () => {
  const nonceStore = new TestNonceStore();
  const payload = await signedPayload();
  const request = { paymentPayload: payload, paymentRequirements: requirements, now: 2_000_000_000 };
  const options = { nonceStore, balanceReader: { getBalance: async () => 10000n } };
  assert.deepEqual(await verifyPayment(request, options), { ok: true, payer: wallet.address, amount: "10000", nonce: authorization.nonce });
  assert.equal(nonceStore.consumed.size, 0);
  assert.equal((await verifyPayment(request, options)).ok, true);
});

test("verifyPayment rejects mismatches, replay, invalid window, bad signature, and low balance", async () => {
  const nonceStore = new TestNonceStore();
  const payload = await signedPayload();
  const options = { nonceStore, balanceReader: { getBalance: async () => 10000n } };
  const mismatch = await verifyPayment({ paymentPayload: payload, paymentRequirements: { ...requirements, amount: "10001" }, now: 2_000_000_000 }, options);
  assert.equal(mismatch.error?.code, "REQUIREMENTS_MISMATCH");
  const badWindow = await verifyPayment({ paymentPayload: await signedPayload(`0x${"bb".repeat(32)}`), paymentRequirements: requirements, now: 2_000_000_200 }, options);
  assert.equal(badWindow.error?.code, "INVALID_TIME_WINDOW");
  const badSignature = await verifyPayment({ paymentPayload: { ...payload, payload: { ...payload.payload, signature: `0x${"00".repeat(65)}` } }, paymentRequirements: requirements, now: 2_000_000_000 }, options);
  assert.equal(badSignature.error?.code, "INVALID_SIGNATURE");
  await nonceStore.consume(authorization.nonce);
  const replay = await verifyPayment({ paymentPayload: payload, paymentRequirements: requirements, now: 2_000_000_000 }, options);
  assert.equal(replay.error?.code, "NONCE_CONSUMED");
  const lowBalance = await verifyPayment({ paymentPayload: await signedPayload(`0x${"cc".repeat(32)}`), paymentRequirements: requirements, now: 2_000_000_000 }, { ...options, balanceReader: { getBalance: async () => 1n } });
  assert.equal(lowBalance.error?.code, "INSUFFICIENT_BALANCE");
});

test("settlement is idempotent and submits ERC-3009 exactly once", async () => {
  const nonceStore = new TestNonceStore();
  let submits = 0;
  const facilitator = new Facilitator(common(nonceStore, { submit: async () => { submits += 1; return { txHash: "0xabc" }; } }));
  const request = { paymentPayload: await signedPayload(), paymentRequirements: requirements, idempotency_key: "payment-1", now: 2_000_000_000 };
  const first = await facilitator.settle(request);
  const second = await facilitator.settle(request);
  assert.equal(first.ok, true);
  assert.equal(first.record.status, "settled");
  assert.equal(second.status, "idempotent");
  assert.equal(submits, 1);
  assert.equal(nonceStore.consumed.size, 1);
});

test("settlement persists timeout as unknown and never retries the payment", async () => {
  const nonceStore = new TestNonceStore();
  let submits = 0;
  const facilitator = new Facilitator(common(nonceStore, { submit: async () => { submits += 1; throw new TimeoutUnknownOutcomeError(); } }));
  const request = { paymentPayload: await signedPayload(`0x${"dd".repeat(32)}`), paymentRequirements: requirements, idempotency_key: "payment-timeout", now: 2_000_000_000 };
  const first = await facilitator.settle(request);
  const second = await facilitator.settle(request);
  assert.equal(first.status, "unknown");
  assert.equal(second.status, "idempotent");
  assert.equal(second.record.status, "unknown");
  assert.equal(submits, 1);
  assert.equal(nonceStore.consumed.size, 1);
});
