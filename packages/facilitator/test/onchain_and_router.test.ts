import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { BASE_SEPOLIA, BASE_SEPOLIA_USDC, type ExactEvmPayload, type PaymentPayload, type PaymentRequirements } from "@cathay/intent-sentinel-core";
import {
  BaseSepoliaSubmitter,
  CrossL2GasRouter,
  type AuthorizationContract,
  type CrossL2GasEstimate,
} from "../src/index.js";

const wallet = new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123");
const payTo = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";
const requirements: PaymentRequirements = {
  scheme: "exact",
  network: BASE_SEPOLIA,
  asset: BASE_SEPOLIA_USDC,
  payTo,
  amount: "10000",
  maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USDC", version: "2" },
};

const authorization = {
  from: wallet.address,
  to: payTo,
  value: "10000",
  validAfter: "1999999900",
  validBefore: "2000000100",
  nonce: `0x${"ab".repeat(32)}`,
};

async function payload(): Promise<PaymentPayload<ExactEvmPayload>> {
  const signature = await wallet.signTypedData(
    { name: "USDC", version: "2", chainId: 84532, verifyingContract: BASE_SEPOLIA_USDC },
    { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ] },
    authorization,
  );
  return { x402Version: 2, accepted: requirements, payload: { authorization, signature } };
}

test("mock settlement is isolated and cannot produce a Basescan URL", async () => {
  const submitter = new BaseSepoliaSubmitter({
    settlement_mode: "mock",
    mockTxHashFactory: () => "mock:test-settlement-1",
  });
  const result = await submitter.submit(await payload(), requirements);
  assert.equal(result.txHash, "mock:test-settlement-1");
  assert.equal(result.mode, "mock");
  assert.equal(result.simulated, true);
  assert.equal(result.explorerUrl, undefined);
  assert.throws(() => BaseSepoliaSubmitter.transactionUrl(result.txHash), /live 32-byte/);
});

test("live settlement submits transferWithAuthorization and returns a Basescan URL", async () => {
  const txHash = `0x${"12".repeat(32)}`;
  const calls: unknown[][] = [];
  const transfer = Object.assign(
    async (...args: unknown[]) => { calls.push(args); return { hash: txHash, wait: async () => ({ status: 1 }) }; },
    { staticCall: async (...args: unknown[]) => { calls.push(["simulate", ...args]); return true; } },
  );
  const contract = { transferWithAuthorization: transfer } as unknown as AuthorizationContract;
  const result = await new BaseSepoliaSubmitter({ settlement_mode: "onchain", contract }).submit(await payload(), requirements);
  assert.equal(result.txHash, txHash);
  assert.equal(result.explorerUrl, `https://sepolia.basescan.org/tx/${txHash}`);
  assert.equal(result.mode, "onchain");
  assert.equal(result.simulated, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.[0], "simulate");
  assert.equal(calls[1]?.[5], authorization.nonce);
});

test("receiveWithAuthorization is selectable and fallback is forbidden after authorization", async () => {
  let submitted = false;
  const receive = Object.assign(
    async () => { submitted = true; return { hash: `0x${"34".repeat(32)},`.replace(",", ""), wait: async () => ({ status: 1 }) }; },
    { staticCall: async () => true },
  );
  const submitter = new BaseSepoliaSubmitter({
    settlement_mode: "onchain",
    authorizationMethod: "receiveWithAuthorization",
    contract: { receiveWithAuthorization: receive } as unknown as AuthorizationContract,
  });
  await submitter.submit(await payload(), requirements);
  assert.equal(submitted, true);
  assert.equal(submitter.operationStage, "submitted");
  assert.throws(() => submitter.fallbackToMockBeforeAuthorization(), /forbidden/);
  assert.throws(() => submitter.switchSettlementMode("mock"), /cannot change/);
});

test("explicit mock fallback is allowed only during pre-authorization", () => {
  const submitter = new BaseSepoliaSubmitter({ settlement_mode: "onchain" });
  submitter.setOperationStage("preflight_failed");
  submitter.fallbackToMockBeforeAuthorization("preflight_failed");
  assert.equal(submitter.settlement_mode, "mock");
  assert.equal(submitter.operationStage, "preflight_failed");
  submitter.markAuthorizationIssued();
  assert.throws(() => submitter.fallbackToMockBeforeAuthorization(), /forbidden/);
});

const estimates: CrossL2GasEstimate[] = [
  { network: "eip155:8453", gasLimit: 100_000n, gasPriceWei: 1_000_000n, nativeTokenUsd: 2_500, expectedLatencySeconds: 2 },
  { network: "eip155:42161", gasLimit: 100_000n, gasPriceWei: 100_000_000n, nativeTokenUsd: 2_500, expectedLatencySeconds: 2 },
  { network: "eip155:137", gasLimit: 100_000n, gasPriceWei: 30_000_000_000n, nativeTokenUsd: 0.5, expectedLatencySeconds: 2 },
];

test("router compares all three enterprise L2 routes and recommends the lowest eligible score", async () => {
  const router = new CrossL2GasRouter({ clock: () => 1_758_000_000_000 });
  const comparison = await router.compare({ estimates });
  assert.deepEqual(comparison.quotes.map((quote) => quote.network), ["eip155:8453", "eip155:42161", "eip155:137"]);
  assert.equal(comparison.recommended?.network, "eip155:8453");
  assert.equal(comparison.quotes.every((quote) => quote.quoteHash.startsWith("0x") && quote.quoteHash.length === 66), true);
  assert.equal(comparison.quotes[0]?.estimatedFeeWei, 100_000_000_000n);
});

test("router excludes routes missing merchant, policy, trust, liquidity, or RPC prerequisites", async () => {
  const router = new CrossL2GasRouter();
  const comparison = await router.compare({
    estimates: estimates.map((estimate) => estimate.network === "eip155:42161" ? { ...estimate, merchantAdvertised: false } : estimate),
  });
  const arbitrum = comparison.quotes.find((quote) => quote.network === "eip155:42161");
  assert.equal(arbitrum?.eligible, false);
  assert.deepEqual(arbitrum?.reasons, ["merchant did not advertise this route"]);
  assert.equal(comparison.recommended?.network, "eip155:8453");
});

