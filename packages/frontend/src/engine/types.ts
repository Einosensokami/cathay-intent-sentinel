export type ScenarioId = "legitimate-purchase" | "prompt-injection" | "a2a-negotiation" | "custom-intent";
export type ExecutionMode = "mock" | "live" | "shadow";
export type ConnectionState = "connected" | "connecting" | "offline";
export type PipelineStepStatus = "idle" | "running" | "complete" | "blocked" | "skipped" | "error";
export type PipelineStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type DefenseMode = "strict" | "standard" | "permissive";

export interface PolicyConfig {
  /** Per-transaction limit in USDC, not atomic units. */
  perTxBudgetCap: number;
  /** Hostnames, compared case-insensitively against URL.hostname. */
  allowedMerchants: string[];
  defenseMode: DefenseMode;
}

export interface CustomIntentInput {
  prompt: string;
  merchantUrl: string;
  amount: string | number;
  memo?: string;
}

export interface PipelineStep {
  id: PipelineStepId;
  label: string;
  detail: string;
  status: PipelineStepStatus;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, string>;
}

export type TransactionStatus = "pending" | "settled" | "blocked" | "failed";

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface Eip712TypeField {
  name: string;
  type: string;
}

export interface Eip712TypedData {
  domain: Eip712Domain;
  types: {
    EIP712Domain: Eip712TypeField[];
    TransferWithAuthorization: Eip712TypeField[];
  };
  primaryType: "TransferWithAuthorization";
  message: Record<string, string>;
}

export interface Evidence {
  typedData?: Eip712TypedData;
  domainSeparatorHash?: string;
  authorizationNonce?: string;
  signature?: string;
  /** SHA-256 over the canonical evidence payload, represented as 0x + 64 hex chars. */
  sha256?: string;
  policyViolationReason?: string;
}

export interface SettlementEvidence {
  txHash: string;
  mode: ExecutionMode;
  verified: boolean;
  payer: string;
  payee: string;
  amountAtomic: string;
  blockNumber?: number;
  gasUsed?: string;
  explorerUrl?: string;
  simulated?: boolean;
  evidenceHash?: string;
}

export interface Transaction {
  id: string;
  scenario: ScenarioId;
  title: string;
  merchant: string;
  merchantUrl?: string;
  resource: string;
  payee: string;
  amount: string;
  amountAtomic: string;
  asset: string;
  network: string;
  status: TransactionStatus;
  mode: ExecutionMode;
  createdAt: string;
  reason?: string;
  policyViolationReason?: string;
  evidenceHash?: string;
  domainSeparatorHash?: string;
  authorizationNonce?: string;
  evidence?: Evidence;
  settlement?: SettlementEvidence;
}

export interface StixObject {
  type: string;
  spec_version: "2.1";
  id: string;
  created: string;
  modified: string;
  name?: string;
  description?: string;
  labels?: string[];
  [key: string]: unknown;
}

export interface StixBundle {
  type: "bundle";
  id: string;
  spec_version?: "2.1";
  objects: StixObject[];
}

export interface ThreatAlert {
  id: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
  detectedAt: string;
  techniques: string[];
  indicators: string[];
  blockedAmountAtomic: string;
  fundsMovedAtomic: string;
  evidenceHash?: string;
  stixBundle: StixBundle;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  kind: "info" | "success" | "warning" | "critical";
  message: string;
}

export interface DashboardState {
  version: 1;
  mode: ExecutionMode;
  connection: ConnectionState;
  policyConfig: PolicyConfig;
  treasuryBalance: string;
  dailyBudget: string;
  committedSpend: string;
  reservedSpend: string;
  activeTask: string;
  selectedScenario: ScenarioId | null;
  running: boolean;
  activeStepId: PipelineStepId | null;
  pipeline: PipelineStep[];
  transactions: Transaction[];
  alerts: ThreatAlert[];
  logs: AuditLogEntry[];
  latestThreat: ThreatAlert | null;
  selectedTransactionId: string | null;
  lastUpdatedAt: string;
}

export interface SignatureEvidence {
  signature: string;
  nonce: string;
  typedData: Eip712TypedData;
  domainSeparatorHash: string;
  evidenceHash: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  reason?: string;
  reasons: string[];
  amountAtomic: string;
  merchantHost?: string;
  promptInjection: boolean;
}

export interface ScenarioExecutionResult {
  scenarioId: ScenarioId;
  outcome: "settled" | "blocked";
  transaction: Transaction;
  alert?: ThreatAlert;
  signature?: SignatureEvidence;
  evidence?: Evidence;
  policyEvaluation?: PolicyEvaluation;
  policyConfig?: PolicyConfig;
  input?: CustomIntentInput;
  steps: PipelineStep[];
  totalMovedAtomic: string;
  summary: string;
}

export type EngineEvent =
  | { type: "run.started"; scenarioId: ScenarioId; at: string; message: string }
  | { type: "step.updated"; scenarioId: ScenarioId; at: string; step: PipelineStep }
  | { type: "log.created"; scenarioId: ScenarioId; at: string; log: AuditLogEntry }
  | { type: "transaction.created"; scenarioId: ScenarioId; at: string; transaction: Transaction }
  | { type: "alert.created"; scenarioId: ScenarioId; at: string; alert: ThreatAlert }
  | { type: "policy.updated"; at: string; policyConfig: PolicyConfig }
  | { type: "state.updated"; at: string; state: DashboardState }
  | { type: "run.completed"; scenarioId: ScenarioId; at: string; result: ScenarioExecutionResult };

export type EngineListener = (event: EngineEvent) => void;
