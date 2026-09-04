import assert from "node:assert/strict";
import test from "node:test";
import { recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  createErc3009TypedData,
  type PaymentIntent,
  type PaymentRequirements,
} from "@cathay/intent-sentinel-core";
import { Erc3009Signer, KeyHierarchy, ScopedKeyVault } from "../src/index.js";

const PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123" as const;
const account = privateKeyToAccount(PRIVATE_KEY);
const intent: PaymentIntent = {
  task_id: "task-abc",
  resource: "https://api.example.test/generate",
  payee: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
  max_amount: "5000000",
  asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
  expires_at: 2_000_000_100,
};
const requirements: PaymentRequirements = {
  scheme: "exact",
  network: BASE_SEPOLIA,
  amount: "10000",
  asset: BASE_SEPOLIA_USDC,
  payTo: intent.payee,
  maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
};

test("scoped vault signs ERC-3009 typed data and never serializes its private key", async () => {
  const vault = new ScopedKeyVault({ privateKey: PRIVATE_KEY, intent, clock: () => 2_000_000_000 });
  const signer = new Erc3009Signer(vault);
  const payment = await signer.signPayment(intent, requirements, {
    now: 2_000_000_000,
    nonce: `0x${"ab".repeat(32)}`,
  });
  const typed = createErc3009TypedData({
    chainId: 84532,
    verifyingContract: requirements.asset,
    name: "USDC",
    version: "2",
    message: payment.payload.authorization,
  });
  const recovered = await recoverTypedDataAddress({
    ...typed,
    signature: payment.payload.signature as `0x${string}`,
  });
  assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  assert.equal(payment.payload.signature.length, 132);
  assert.ok(payment.payload.signature.startsWith("0x"));
  assert.equal(JSON.stringify(vault).includes(PRIVATE_KEY.slice(2)), false);
  assert.equal(vault.address.toLowerCase(), account.address.toLowerCase());
});

test("vault fails closed for a different payee, amount over the scope, or expired intent", async () => {
  const vault = new ScopedKeyVault({ privateKey: PRIVATE_KEY, intent, clock: () => 2_000_000_000 });
  const signer = new Erc3009Signer(vault);
  await assert.rejects(() => signer.signPayment(intent, { ...requirements, payTo: account.address }, { now: 2_000_000_000 }));
  await assert.rejects(() => signer.signPayment(intent, { ...requirements, amount: "5000001" }, { now: 2_000_000_000 }));
  await assert.rejects(() => signer.signPayment({ ...intent, expires_at: 1_999_999_999 }, requirements, { now: 2_000_000_000 }));
});

test("key hierarchy enforces session quota and revocation", () => {
  const hierarchy = new KeyHierarchy({ rootAddress: account.address, clock: () => 2_000_000_000 });
  const pool = hierarchy.createFundingPool({ id: "pool-main", address: "0x3333333333333333333333333333333333333333", maxSpend: "100000" });
  const session = hierarchy.createSessionKey({
    id: "session-1",
    fundingPoolId: pool.id,
    intent,
    quota: "20000",
    privateKey: PRIVATE_KEY,
  });
  assert.equal(session.status, "active");
  session.reserveSpend("15000");
  assert.equal(session.spent, "15000");
  assert.throws(() => session.reserveSpend("5001"));
  session.revoke("operator-request");
  assert.equal(session.status, "revoked");
  assert.throws(() => session.reserveSpend("1"));
  assert.equal(hierarchy.getSession("session-1")?.revocationReason, "operator-request");
});

test("funding-pool quota is enforced across multiple session keys", () => {
  const hierarchy = new KeyHierarchy({ rootAddress: account.address, clock: () => 2_000_000_000 });
  const pool = hierarchy.createFundingPool({ id: "small", address: "0x4444444444444444444444444444444444444444", maxSpend: "100" });
  const first = hierarchy.createSessionKey({ id: "a", fundingPoolId: pool.id, intent: { ...intent, task_id: "a", max_amount: "100" }, quota: "100", privateKey: PRIVATE_KEY });
  const second = hierarchy.createSessionKey({ id: "b", fundingPoolId: pool.id, intent: { ...intent, task_id: "b", max_amount: "100" }, quota: "100", privateKey: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" });
  first.reserveSpend("60");
  assert.throws(() => second.reserveSpend("41"));
  second.reserveSpend("40");
});
