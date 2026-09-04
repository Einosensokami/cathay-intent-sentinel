import { DashboardState, PipelineStep } from "./types";

export const INITIAL_PIPELINE_STEPS: PipelineStep[] = [
  { id: 1, name: "Task Trigger", subtext: "Agent requests paid resource", status: "idle" },
  { id: 2, name: "HTTP 402 Quote", subtext: "Resource server challenges", status: "idle" },
  { id: 3, name: "Policy Gate", subtext: "6D Intent & OWASP Audit", status: "idle" },
  { id: 4, name: "Scoped Vault", subtext: "Isolated EIP-712 Signing", status: "idle" },
  { id: 5, name: "L2 Gas Router", subtext: "Base L2 optimal route", status: "idle" },
  { id: 6, name: "Facilitator", subtext: "Read-only /verify check", status: "idle" },
  { id: 7, name: "On-Chain Settle", subtext: "Base Sepolia ERC-3009", status: "idle" },
  { id: 8, name: "200 OK Delivery", subtext: "Atomic data release", status: "idle" },
];

export const INITIAL_STATE: DashboardState = {
  treasuryBalance: 9999.97,
  treasuryCap: 10000.0,
  activeScenario: null,
  isRunning: false,
  pipeline: INITIAL_PIPELINE_STEPS,
  transactions: [
    {
      id: "tx-init-01",
      timestamp: "14:10:02",
      scenario: "Initial Cold Start",
      task: "System Self-Test",
      merchant: "Cathay Verified Gateway",
      merchantUrl: "https://api.cathay-verified.com/health",
      amount: "0.01 USDC",
      status: "settled",
      txHash: "0x8f2c3d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      explorerUrl: "https://sepolia.basescan.org/tx/0x8f2c3d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      reputationScore: 99,
    }
  ],
  threatAlerts: [],
  agentLogs: [
    { time: "14:10:00", text: "Sentinel Security Guardrail initialized on Base Sepolia (84532)", type: "info" },
    { time: "14:10:02", text: "PolicyGate armed: 6-Dimensional Intent validation active (Fail-Closed mode)", type: "success" },
    { time: "14:10:02", text: "ScopedKeyVault isolated: LLM context cannot access private keys", type: "info" },
  ],
  policyGateArmed: true,
  activeModal: null,
};
