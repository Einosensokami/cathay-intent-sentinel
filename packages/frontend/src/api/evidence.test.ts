import assert from "node:assert/strict";
import test from "node:test";
import { safeExplorerUrl, isVerifiedLiveSettlement } from "./evidence";

const hash = `0x${"a".repeat(64)}`;

test("mock and simulated receipts remain non-explorer evidence", () => {
  assert.equal(safeExplorerUrl({ success: true, mode: "mock", network: "eip155:84532", transaction: hash, explorerUrl: `https://sepolia.basescan.org/tx/${hash}` }, hash), undefined);
  assert.equal(isVerifiedLiveSettlement({ success: true, mode: "onchain", simulated: true, network: "eip155:84532", transaction: hash }, hash), false);
});

test("only verified Base Sepolia live receipts may expose Basescan", () => {
  const response = { success: true, mode: "onchain" as const, network: "eip155:84532", transaction: hash, explorerUrl: `https://sepolia.basescan.org/tx/${hash}` };
  assert.equal(isVerifiedLiveSettlement(response, hash), true);
  assert.equal(safeExplorerUrl(response, hash), response.explorerUrl);
  assert.equal(safeExplorerUrl({ ...response, explorerUrl: "https://evil.example/steal" }, hash), undefined);
  assert.equal(safeExplorerUrl({ ...response, network: "eip155:1" }, hash), undefined);
});
