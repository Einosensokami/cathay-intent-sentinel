import type { PipelineStep, ThreatRecord, Transaction } from "./types";

export const PIPELINE_TEMPLATE: PipelineStep[] = [
  { id: 1, shortLabel: "REQ", label: "Request resource", state: "waiting" },
  { id: 2, shortLabel: "402", label: "Payment challenge", state: "waiting" },
  { id: 3, shortLabel: "BIND", label: "Bind intent", state: "waiting" },
  { id: 4, shortLabel: "POL", label: "Policy gate", state: "waiting" },
  { id: 5, shortLabel: "SIGN", label: "Scoped signature", state: "waiting" },
  { id: 6, shortLabel: "VFY", label: "Verify payment", state: "waiting" },
  { id: 7, shortLabel: "SET", label: "Settle onchain", state: "waiting" },
  { id: 8, shortLabel: "200", label: "Resource unlocked", state: "waiting" },
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: "TX-83A1",
    time: "14:32:08",
    merchant: "AlphaSense MCP",
    resource: "/v1/market-intel/q3",
    amount: "0.01 USDC",
    status: "settled",
    mode: "mock",
    verified: false,
    network: "Base Sepolia · 84532",
    block: "18,942,381",
    gasSponsored: true,
  },
  {
    id: "TX-729F",
    time: "14:29:42",
    merchant: "MarketLens API",
    resource: "/reports/sector-risk",
    amount: "0.02 USDC",
    status: "settled",
    mode: "mock",
    verified: false,
    network: "Base Sepolia · 84532",
    block: "18,942,216",
    gasSponsored: true,
  },
];

export const ATTACK_THREAT: ThreatRecord = {
  id: "THR-ASI01-8842",
  time: "just now",
  title: "Prompt Injection 付款劫持已封鎖",
  description: "不受信任內容試圖將任務綁定的 0.01 USDC 意圖，替換為向未核准收款方支付 500 USDC。",
  evidenceHash: "0xe9275a8a1254392c3437279787efb43dadbe78e58ce14f072283c734ade5f93c",
  stix: {
    type: "bundle",
    id: "bundle--e9275a8a-1254-593c-8437-279787efb43d",
    spec_version: "2.1",
    objects: [
      {
        type: "indicator",
        spec_version: "2.1",
        id: "indicator--18a24cd8-a948-5cc4-8491-536cfdc7604d",
        name: "OWASP ASI01 Prompt Injection",
        pattern_type: "stix",
        confidence: 99,
        labels: ["intent-sentinel", "owasp-agentic-security", "ASI01", "prompt_injection"],
        x_evidence_sha256: "0xe9275a8a1254392c3437279787efb43dadbe78e58ce14f072283c734ade5f93c",
      },
      {
        type: "note",
        spec_version: "2.1",
        id: "note--d2a9ff7b-d750-54b4-a4e7-f77675c7c6da",
        content: "已清理偵測結果。惡意 prompt 已隔離。提議 max_amount: 500000000；可信 max_amount: 10000。",
      },
    ],
  },
};
