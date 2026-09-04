export type ScenarioId = "legitimate" | "attack" | "negotiation";

export type PipelineStepStatus = "idle" | "active" | "success" | "blocked";

export interface PipelineStep {
  id: number;
  name: string;
  subtext: string;
  status: PipelineStepStatus;
  detail?: string;
}

export interface Transaction {
  id: string;
  timestamp: string;
  scenario: string;
  task: string;
  merchant: string;
  merchantUrl: string;
  amount: string;
  status: "settled" | "blocked" | "negotiating";
  txHash?: string;
  explorerUrl?: string;
  violations?: string[];
  reputationScore?: number;
  discountPct?: number;
  slaBond?: string;
}

export interface ThreatAlert {
  id: string;
  timestamp: string;
  severity: "critical" | "high" | "medium" | "info";
  attackType: string;
  owaspCategory: string;
  message: string;
  targetResource: string;
  stixBundle: any;
}

export interface DashboardState {
  treasuryBalance: number; // in USDC
  treasuryCap: number; // in USDC
  activeScenario: ScenarioId | null;
  isRunning: boolean;
  pipeline: PipelineStep[];
  transactions: Transaction[];
  threatAlerts: ThreatAlert[];
  agentLogs: Array<{ time: string; text: string; type: "info" | "success" | "error" | "warn" }>;
  policyGateArmed: boolean;
  activeModal: { type: "stix" | "receipt"; data: any } | null;
}
