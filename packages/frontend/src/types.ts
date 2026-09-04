export type Scenario = "legitimate" | "attack" | "negotiation";
export type RunState = "idle" | "running" | "settled" | "blocked" | "failed" | "unknown";
export type StepState = "waiting" | "active" | "complete" | "blocked" | "error";

export interface PipelineStep {
  id: number;
  shortLabel: string;
  label: string;
  state: StepState;
}

export interface Transaction {
  id: string;
  time: string;
  merchant: string;
  resource: string;
  amount: string;
  status: "settled" | "blocked" | "pending" | "failed" | "unknown";
  mode: "mock" | "live";
  verified: boolean;
  txHash?: string;
  network?: string;
  block?: string;
  gasSponsored?: boolean;
  explorerUrl?: string;
  requestId?: string;
  correlationId?: string;
  reason?: string;
}

export interface ThreatRecord {
  id: string;
  time: string;
  title: string;
  description: string;
  evidenceHash: string;
  stix: Record<string, unknown>;
}
