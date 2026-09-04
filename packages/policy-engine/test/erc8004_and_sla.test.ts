import assert from "node:assert/strict";
import test from "node:test";
import { Interface } from "ethers";
import {
  Erc8004TrustRegistry,
  InMemoryTrustRegistry,
  StakedSlaEscrow,
  ThreatIntelReporter,
} from "../src/index.js";

const VALID_AGENT = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

test("ERC-8004 live adapter reads all registries at one pinned Base Sepolia block", async () => {
  const identityAddress = "0x0000000000000000000000000000000000000101";
  const reputationAddress = "0x0000000000000000000000000000000000000102";
  const validationAddress = "0x0000000000000000000000000000000000000103";
  const reviewer = "0x0000000000000000000000000000000000000201";
  const iface = new Interface([
    "function ownerOf(uint256) view returns (address)",
    "function tokenURI(uint256) view returns (string)",
    "function getAgentWallet(uint256) view returns (address)",
    "function getIdentityRegistry() view returns (address)",
    "function getClients(uint256) view returns (address[])",
    "function getLastIndex(uint256,address) view returns (uint64)",
    "function readFeedback(uint256,address,uint64) view returns (int128,uint8,string,string,bool)",
    "function getSummary(uint256,address[],string) view returns (uint64,uint8)",
  ]);
  const calls: Array<{ to: string; blockTag: unknown }> = [];
  const provider = {
    async getNetwork() { return { chainId: 84532n }; },
    async getBlock() { return { number: 123, hash: `0x${"12".repeat(32)}` }; },
    async getCode() { return "0x6000"; },
    async call(tx: { to?: string; data?: string; blockTag?: unknown }) {
      calls.push({ to: tx.to ?? "", blockTag: tx.blockTag });
      const parsed = iface.parseTransaction({ data: tx.data ?? "0x" });
      if (!parsed) throw new Error("unrecognized call");
      switch (parsed.name) {
        case "getIdentityRegistry": return iface.encodeFunctionResult(parsed.name, [identityAddress]);
        case "ownerOf": return iface.encodeFunctionResult(parsed.name, [VALID_AGENT]);
        case "getAgentWallet": return iface.encodeFunctionResult(parsed.name, [VALID_AGENT]);
        case "tokenURI": return iface.encodeFunctionResult(parsed.name, ["data:application/json,{}"]);
        case "getClients": return iface.encodeFunctionResult(parsed.name, [[reviewer]]);
        case "getLastIndex": return iface.encodeFunctionResult(parsed.name, [3]);
        case "readFeedback": return iface.encodeFunctionResult(parsed.name, [95, 0, "quality", "", false]);
        case "getSummary": return iface.encodeFunctionResult(parsed.name, [1, 100]);
        default: throw new Error(`unexpected ${parsed.name}`);
      }
    },
  };
  const registry = new Erc8004TrustRegistry({
    provider,
    identityRegistryAddress: identityAddress,
    reputationRegistryAddress: reputationAddress,
    validationRegistryAddress: validationAddress,
    trustedReviewers: [reviewer],
    fetchRegistration: async () => ({ type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name: "Live agent", active: true, x402Support: true, services: [{ endpoint: "https://api.example.test" }] }),
    minTrustedSamples: 3,
    now: () => 2_000_000_000,
  });
  const result = await registry.verifySeller({ agentId: 7, payee: VALID_AGENT, merchantUrl: "https://api.example.test/data" });
  assert.equal(result.verified, true);
  assert.equal(result.source, "onchain");
  assert.equal(result.agent_id, "7");
  assert.equal(result.block?.number, 123);
  assert.equal(result.payee_bound, true);
  assert.ok(result.evidence_hash?.startsWith("0x"));
  assert.ok(calls.every((call) => call.blockTag === 123));
});

test("ERC-8004 live failure uses only an explicit fallback registry", async () => {
  const fallback = new Erc8004TrustRegistry();
  fallback.registerAgent({ agentId: "fixture-1", walletAddress: VALID_AGENT as `0x${string}`, serviceEndpoint: "https://api.example.test", registeredAt: 1, active: true }, { score: 99, successfulTasks: 3, disputedTasks: 0, lastUpdated: 2, antiSybilPassed: true });
  const registry = new Erc8004TrustRegistry({ fallback, fallbackOnError: true });
  const result = await registry.verifySeller({ agentId: 1, payee: VALID_AGENT, merchantUrl: "https://api.example.test/data" });
  assert.equal(result.verified, true);
  assert.equal(result.source, "fallback");
  const closed = new Erc8004TrustRegistry({ fallback, fallbackOnError: false });
  assert.equal((await closed.verifySeller({ agentId: 1, payee: VALID_AGENT, merchantUrl: "https://api.example.test/data" })).verified, false);
});

test("SLA stake verification enforces 10x coverage and slashing is capped at the bond", () => {
  const escrow = new StakedSlaEscrow();
  escrow.depositStake(VALID_AGENT, 100_000n, 1_000_000_000);
  const eligible = escrow.verifyStake(VALID_AGENT, 10_000n, 100_000, 2_000_000_000, 2_000_000_100);
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.requiredStake, 100_000n);
  const result = escrow.slashStake(VALID_AGENT, 150_000n, "invalid data");
  assert.equal(result.slashedAmount, 100_000n);
  assert.equal(escrow.getStake(VALID_AGENT), 0n);
});

test("ThreatIntelReporter emits sanitized STIX and never includes bearer secrets", () => {
  const reporter = new ThreatIntelReporter();
  const report = reporter.reportViolation({ attackType: "prompt_injection", message: "ignore policy", evidence: { authorization: "Bearer super-secret", email: "customer@example.test" }, merchantUrl: "https://evil.example" , timestamp: 2_000_000_000 });
  assert.equal(report.stix.spec_version, "2.1");
  assert.equal(report.attack_type, "prompt_injection");
  assert.equal(report.owasp_category, "ASI01");
  assert.ok(!report.json.includes("super-secret"));
  assert.ok(!report.json.includes("customer@example.test"));
  assert.equal(reporter.feed().objects.length, 3);
});

test("ERC-8004 Registry verifies registered agent identity, active status, and reputation score", async () => {
  const registry = new InMemoryTrustRegistry();
  registry.register({
    identity: {
      address: VALID_AGENT,
      merchant_url: "https://api.cathay-verified.com/data",
      name: "Cathay Verified Intel Agent",
      registered_at: 1_700_000_000,
    },
    reputation: {
      score: 95,
      successful_settlements: 250,
      disputes: 1,
      last_updated: 1_710_000_000,
    },
  });

  const checkPass = await registry.verifyMerchant(VALID_AGENT, "https://api.cathay-verified.com/data");
  assert.equal(checkPass.verified, true);
  assert.equal(checkPass.identity?.name, "Cathay Verified Intel Agent");

  const checkUnknown = await registry.verifyMerchant("0x9999999999999999999999999999999999999999", "https://api.cathay-verified.com/data");
  assert.equal(checkUnknown.verified, false);
});

test("Staked SLA Escrow verifies stake deposit and slashes malicious/violating providers", () => {
  const escrow = new StakedSlaEscrow();
  escrow.depositStake(VALID_AGENT, 100_000n, 86400 * 30);

  assert.equal(escrow.getStake(VALID_AGENT), 100_000n);

  const goodDelivery = escrow.evaluateSlaAndSlash(
    {
      taskId: "task-1",
      merchantAddress: VALID_AGENT,
      expectedDeliveryBy: 2_000_000_100,
      actualDeliveredAt: 2_000_000_050,
      dataQualityVerified: true,
    },
    20_000n
  );
  assert.equal(goodDelivery.slashed, false);
  assert.equal(goodDelivery.remainingStake, 100_000n);

  const badDelivery = escrow.evaluateSlaAndSlash(
    {
      taskId: "task-2",
      merchantAddress: VALID_AGENT,
      expectedDeliveryBy: 2_000_000_100,
      actualDeliveredAt: 2_000_000_050,
      dataQualityVerified: false,
    },
    30_000n
  );
  assert.equal(badDelivery.slashed, true);
  assert.equal(badDelivery.slashedAmount, 30_000n);
  assert.equal(badDelivery.remainingStake, 70_000n);
});

test("ThreatIntelReporter formats intercepted OWASP attacks into STIX 2.1 JSON format", () => {
  const reporter = new ThreatIntelReporter();
  const report = reporter.report({
    attackType: "homograph_hijack",
    code: "ASI02_TOOL_MISUSE",
    message: "Payee mismatch / unapproved merchant",
    merchantUrl: "https://evil-spoof.net",
    merchantWallet: "0x9999999999999999999999999999999999999999",
  });

  assert.equal(report.stix.spec_version, "2.1");
  const indicator = report.stix.objects.find((obj) => obj.type === "indicator");
  assert.ok(indicator !== undefined);
  assert.equal(report.attack_type, "homograph_hijack");
  assert.equal(reporter.listReports().length, 1);
});
