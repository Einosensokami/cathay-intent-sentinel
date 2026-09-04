import assert from "node:assert/strict";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import {
  A2ANegotiator,
  verifyNegotiationCommitment,
  type NegotiationSigner,
} from "../src/index.js";

const buyer = privateKeyToAccount("0x0123456789012345678901234567890123456789012345678901234567890123");
const seller = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const buyerSigner: NegotiationSigner = buyer;
const sellerSigner: NegotiationSigner = seller;
const input = {
  sessionId: "session-volume-1",
  buyerAgentId: "buyer-8004",
  sellerAgentId: "seller-8004",
  resourceHash: `0x${"11".repeat(32)}` as `0x${string}`,
  quantity: "10",
  listUnitPrice: "5000",
  buyerCeiling: "50000",
  sellerFloor: "30000",
  volumeDiscountBps: 4000,
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  network: "eip155:84532",
  sla: { deliverBy: 2_000_000_100, availabilityBps: 9900, stakeRequired: "300000" },
  validUntil: 2_000_000_200,
};

test("A2A negotiation signs a bounded discount before commitment", async () => {
  const negotiator = new A2ANegotiator({ buyer: buyerSigner, seller: sellerSigner, clock: () => 2_000_000_000 });
  const result = await negotiator.negotiate(input);

  assert.equal(result.accepted.totalPrice, "30000");
  assert.equal(result.accepted.unitPrice, "3000");
  assert.equal(result.savings, "20000");
  assert.equal(result.messages.length, 2);
  assert.equal(result.commitment.buyerAddress.toLowerCase(), buyer.address.toLowerCase());
  assert.equal(result.commitment.sellerAddress.toLowerCase(), seller.address.toLowerCase());
  assert.equal(await verifyNegotiationCommitment(result), true);
});

test("negotiation verification rejects a changed accepted price", async () => {
  const negotiator = new A2ANegotiator({ buyer: buyerSigner, seller: sellerSigner, clock: () => 2_000_000_000 });
  const result = await negotiator.negotiate(input);
  const tampered = {
    ...result,
    accepted: { ...result.accepted, totalPrice: "31000" },
  };

  assert.equal(await verifyNegotiationCommitment(tampered), false);
});

test("seller floor and buyer ceiling are enforced before intent binding", async () => {
  const negotiator = new A2ANegotiator({ buyer: buyerSigner, seller: sellerSigner, clock: () => 2_000_000_000 });
  await assert.rejects(() => negotiator.negotiate({ ...input, buyerCeiling: "29000" }), /ceiling|floor/i);
  await assert.rejects(() => negotiator.negotiate({ ...input, sellerFloor: "60000" }), /ceiling|floor/i);
});

