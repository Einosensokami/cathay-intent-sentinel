import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_MAINNET,
  BASE_SEPOLIA,
  ERC3009_TYPES,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  decodePaymentPayload,
  decodePaymentRequired,
  decodeSettlementResponse,
  encodePaymentPayload,
  encodePaymentRequired,
  encodeSettlementResponse,
  intentMatchesPaymentRequirements,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettlementResponse,
  type ExactEvmPayload,
  type PaymentIntent,
  BATCH_SETTLEMENT_SPEC,
  EXACT_EIP3009_SPEC,
  UPTO_PERMIT2_SPEC,
} from "../src/index.js";

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: BASE_SEPOLIA,
  amount: "10000",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" },
};

test("x402 v2 headers encode and decode UTF-8 JSON without losing protocol fields", () => {
  const required: PaymentRequired = {
    x402Version: 2,
    resource: { url: "https://example.test/資料", description: "paid data" },
    accepts: [requirements],
  };
  const encoded = encodePaymentRequired(required);
  assert.match(encoded, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(decodePaymentRequired(encoded), required);
  assert.equal(PAYMENT_REQUIRED_HEADER, "PAYMENT-REQUIRED");
  assert.equal(PAYMENT_SIGNATURE_HEADER, "PAYMENT-SIGNATURE");
  assert.equal(PAYMENT_RESPONSE_HEADER, "PAYMENT-RESPONSE");
});

test("x402 v2 payload and settlement response preserve the canonical payload nesting", () => {
  const payload: PaymentPayload<ExactEvmPayload> = {
    x402Version: 2,
    resource: { url: "https://example.test/data" },
    accepted: requirements,
    payload: {
      signature: `0x${"11".repeat(65)}`,
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: requirements.payTo,
        value: requirements.amount,
        validAfter: "0",
        validBefore: "9999999999",
        nonce: `0x${"22".repeat(32)}`,
      },
    },
  };
  const response: SettlementResponse = {
    success: true,
    transaction: `0x${"33".repeat(32)}`,
    network: requirements.network,
    payer: payload.payload.authorization.from,
  };
  assert.deepEqual(decodePaymentPayload(encodePaymentPayload(payload)), payload);
  assert.deepEqual(decodeSettlementResponse(encodeSettlementResponse(response)), response);
});

test("payment intent binding is exact on resource, payee, asset/network, and amount ceiling", () => {
  const intent: PaymentIntent = {
    task_id: "task-123",
    resource: "https://example.test/data",
    payee: requirements.payTo,
    max_amount: "10000",
    asset_network: { asset: requirements.asset, network: requirements.network },
    expires_at: 2_000_000_000,
  };
  assert.equal(intentMatchesPaymentRequirements(intent, requirements, intent.resource), true);
  assert.equal(intentMatchesPaymentRequirements({ ...intent, resource: "https://evil.test/data" }, requirements, "https://example.test/data"), false);
  assert.equal(intentMatchesPaymentRequirements({ ...intent, max_amount: "9999" }, requirements), false);
});

test("Base EIP-712 constants include both Base chain IDs and canonical ERC-3009 fields", () => {
  assert.equal(BASE_MAINNET, "eip155:8453");
  assert.equal(BASE_SEPOLIA, "eip155:84532");
  assert.deepEqual(ERC3009_TYPES.TransferWithAuthorization.map(({ name, type }) => ({ name, type })), [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ]);
});

test("scheme specifications make unsupported extensions explicit and fail closed by default", () => {
  assert.equal(EXACT_EIP3009_SPEC.assetTransferMethod, "eip3009");
  assert.equal(EXACT_EIP3009_SPEC.paymentFlow, "authorization");
  assert.equal(UPTO_PERMIT2_SPEC.assetTransferMethod, "permit2");
  assert.equal(UPTO_PERMIT2_SPEC.settlement, "immediate");
  assert.equal(BATCH_SETTLEMENT_SPEC.settlement, "deferred");
  assert.throws(() => decodePaymentRequired(Buffer.from(JSON.stringify({ x402Version: 1 })).toString("base64")));
  assert.throws(() => decodePaymentRequired("not-base64!"));
});
