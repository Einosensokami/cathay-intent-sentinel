import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryTrustRegistry,
  StakedSlaEscrow,
  ThreatIntelReporter,
} from "../src/index.js";

const VALID_AGENT = "0x209693Bc6afc0C5328bA36FaF03C514EF312287C";

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
