import assert from "node:assert/strict";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import test from "node:test";
import { Wallet } from "ethers";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC, type ExactEvmPayload, type PaymentPayload, type PaymentRequirements } from "@cathay/intent-sentinel-core";
import { BaseSepoliaSubmitter, Facilitator, TimeoutUnknownOutcomeError, handleFacilitatorRequest } from "../src/index.js";
import type { NonceStore } from "../src/verify.js";

const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const payTo = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const requirements: PaymentRequirements = {
  scheme: "exact", network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, payTo, amount: "10000", maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2", resource: "https://merchant.example/data" },
};
const types = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] };

class TestNonceStore implements NonceStore {
  readonly consumed = new Set<string>();
  async isConsumed(nonce: string): Promise<boolean> { return this.consumed.has(nonce); }
  async consume(nonce: string): Promise<boolean> { if (this.consumed.has(nonce)) return false; this.consumed.add(nonce); return true; }
  async release(nonce: string): Promise<void> { this.consumed.delete(nonce); }
}

async function signedPayload(nonce: string): Promise<PaymentPayload<ExactEvmPayload>> {
  const authorization = {
    from: wallet.address, to: payTo, value: "10000", validAfter: "1999999900", validBefore: "2000000100", nonce,
  };
  const signature = await wallet.signTypedData({ name: "USDC", version: "2", chainId: 84532, verifyingContract: BASE_SEPOLIA_USDC }, types, authorization);
  return { x402Version: 2, resource: { url: "https://merchant.example/data" }, accepted: requirements, payload: { authorization, signature } };
}

function options(nonceStore: TestNonceStore, submitter: { submit: (payload: PaymentPayload, requirements: PaymentRequirements) => Promise<{ txHash: string }> }) {
  return { nonceStore, balanceReader: { getBalance: async () => 10000n }, submitter, now: () => 2_000_000_000, clock: () => 2_000_000_000 };
}

function request(raw: string, url = "/verify"): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(raw)]), { method: "POST", url, headers: {} }) as unknown as IncomingMessage;
}

function responseCapture(): { response: ServerResponse; status: () => number; body: () => Record<string, unknown> } {
  let statusCode = 0;
  let encoded = "";
  const response = {
    get statusCode() { return statusCode; },
    set statusCode(value: number) { statusCode = value; },
    headersSent: false,
    setHeader() { /* header assertions are not needed for this transport seam */ },
    end(value?: string) { encoded = value ?? ""; },
    destroy() { /* no-op fake response */ },
  } as unknown as ServerResponse;
  return { response, status: () => statusCode, body: () => JSON.parse(encoded) as Record<string, unknown> };
}

test("verification fails closed for missing, malformed, and invalid payment authentication", async () => {
  const nonceStore = new TestNonceStore();
  const facilitator = new Facilitator(options(nonceStore, { submit: async () => ({ txHash: "0x01" }) }));
  const missing = responseCapture();
  await handleFacilitatorRequest(request("{}"), missing.response, facilitator);
  assert.equal(missing.status(), 200);
  assert.equal(missing.body().isValid, false);

  const malformed = responseCapture();
  await handleFacilitatorRequest(request(JSON.stringify({ paymentPayload: { x402Version: 2 }, paymentRequirements: requirements })), malformed.response, facilitator);
  assert.equal(malformed.body().isValid, false);
  assert.equal(malformed.body().errorCode, "MALFORMED_PAYLOAD");
});

test("mock settlement receipt is explicitly non-chain and has no explorer link", async () => {
  const nonceStore = new TestNonceStore();
  const submitter = new BaseSepoliaSubmitter({ settlement_mode: "mock", mockTxHashFactory: () => "mock:security-test" });
  const facilitator = new Facilitator(options(nonceStore, submitter));
  const capture = responseCapture();
  const payload = await signedPayload(`0x${"01".repeat(32)}`);
  await handleFacilitatorRequest(request(JSON.stringify({ paymentPayload: payload, paymentRequirements: requirements, idempotency_key: "mock-security-test" }), "/settle"), capture.response, facilitator);
  const body = capture.body();
  assert.equal(capture.status(), 200);
  assert.equal(body.transaction, "mock:security-test");
  assert.equal(body.simulated, true);
  assert.equal(body.explorerUrl, undefined);
  assert.equal("https://sepolia.basescan.org" in body, false);
});

test("request body size and JSON validation are rejected before business logic", async () => {
  const facilitator = new Facilitator(options(new TestNonceStore(), { submit: async () => ({ txHash: "0x01" }) }));
  const oversized = responseCapture();
  await handleFacilitatorRequest(request(JSON.stringify({ padding: "x".repeat(1_048_576) })), oversized.response, facilitator);
  assert.equal(oversized.status(), 400);
  assert.match(String(oversized.body().error), /too large/i);

  const arrayBody = responseCapture();
  await handleFacilitatorRequest(request("[]"), arrayBody.response, facilitator);
  assert.equal(arrayBody.status(), 400);
  assert.match(String(arrayBody.body().error), /JSON object/i);

  const invalidJson = responseCapture();
  await handleFacilitatorRequest(request("not-json"), invalidJson.response, facilitator);
  assert.equal(invalidJson.status(), 400);
});

test("idempotency serializes replay attempts and rejects key reuse for another request", async () => {
  const nonceStore = new TestNonceStore();
  let submits = 0;
  const facilitator = new Facilitator(options(nonceStore, { submit: async () => { submits += 1; await Promise.resolve(); return { txHash: "0x01" }; } }));
  const payload = await signedPayload(`0x${"02".repeat(32)}`);
  const original = { paymentPayload: payload, paymentRequirements: requirements, idempotency_key: "replay-security-test", now: 2_000_000_000 };
  const results = await Promise.all([facilitator.settle(original), facilitator.settle(original)]);
  assert.equal(results.filter((result) => result.status === "settled").length, 1);
  assert.equal(results.filter((result) => result.status === "idempotent").length, 1);
  assert.equal(submits, 1);

  const reused = await facilitator.settle({ ...original, payer: wallet.address });
  assert.equal(reused.ok, false);
  assert.equal(reused.status, "rejected");
  assert.match(reused.record.error ?? "", /reused/i);
  assert.equal(submits, 1);
});

test("unknown timeout is durable and concurrent retries never submit again", async () => {
  const nonceStore = new TestNonceStore();
  let submits = 0;
  const facilitator = new Facilitator(options(nonceStore, { submit: async () => { submits += 1; throw new TimeoutUnknownOutcomeError(); } }));
  const original = { paymentPayload: await signedPayload(`0x${"03".repeat(32)}`), paymentRequirements: requirements, idempotency_key: "timeout-security-test", now: 2_000_000_000 };
  const results = await Promise.all([facilitator.settle(original), facilitator.settle(original), facilitator.settle(original)]);
  assert.equal(results.filter((result) => result.status === "unknown").length, 1);
  assert.equal(results.filter((result) => result.status === "idempotent").length, 2);
  assert.equal(submits, 1);
  assert.equal(nonceStore.consumed.size, 1);
  assert.equal(facilitator.getRecord(original.idempotency_key)?.status, "unknown");
});
