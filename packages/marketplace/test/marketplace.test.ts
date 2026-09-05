import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import {
  decodePaymentRequired,
  decodeSettlementResponse,
  encodePaymentPayload,
  type ExactEvmPayload,
  type PaymentPayload,
  type PaymentRequirements,
} from "@cathay/intent-sentinel-core";
import { createMarketplaceServer } from "../src/server.js";

const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

async function runningServer(): Promise<{ server: ReturnType<typeof createMarketplaceServer>; url: string }> {
  const server = createMarketplaceServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: ReturnType<typeof createMarketplaceServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("protected catalog item returns an x402 challenge", async () => {
  const { server, url } = await runningServer();
  try {
    const response = await fetch(`${url}/api/vip-threat-intel`);
    assert.equal(response.status, 402);
    const encoded = response.headers.get("PAYMENT-REQUIRED");
    assert.ok(encoded);
    const quote = decodePaymentRequired(encoded);
    assert.equal(quote.x402Version, 2);
    assert.equal(quote.accepts[0]?.amount, "10000");
    assert.equal(quote.accepts[0]?.scheme, "exact");
    assert.equal(quote.accepts[0]?.network, "eip155:84532");
    assert.equal(quote.accepts[0]?.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    assert.equal(quote.accepts[0]?.payTo, "0x1111111111111111111111111111111111111111");
  } finally {
    await closeServer(server);
  }
});

test("valid PAYMENT-SIGNATURE settles and releases threat intel", async () => {
  const now = Math.floor(Date.now() / 1000);
  const { server, url } = await runningServer();
  try {
    const challenge = await fetch(`${url}/api/vip-threat-intel`);
    const quote = decodePaymentRequired(challenge.headers.get("PAYMENT-REQUIRED") ?? "");
    const requirement = quote.accepts[0] as PaymentRequirements;
    const authorization = {
      from: wallet.address,
      to: requirement.payTo,
      value: requirement.amount,
      validAfter: String(now - 30),
      validBefore: String(now + 300),
      nonce: `0x${"ab".repeat(32)}`,
    };
    const signature = await wallet.signTypedData(
      { name: "USD Coin", version: "2", chainId: 84532, verifyingContract: requirement.asset },
      types,
      authorization,
    );
    const payment: PaymentPayload<ExactEvmPayload> = {
      x402Version: 2,
      resource: quote.resource,
      accepted: requirement,
      payload: { authorization, signature },
    };

    const response = await fetch(`${url}/api/vip-threat-intel`, {
      headers: { "PAYMENT-SIGNATURE": encodePaymentPayload(payment) },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).dataset, "vip-threat-intel");
    const settlement = decodeSettlementResponse(response.headers.get("PAYMENT-RESPONSE") ?? "");
    assert.equal(settlement.success, true);
    assert.equal(settlement.network, "eip155:84532");
    assert.equal(settlement.amount, "10000");
    assert.match(settlement.transaction, /^0x[0-9a-f]{64}$/);
  } finally {
    await closeServer(server);
  }
});
