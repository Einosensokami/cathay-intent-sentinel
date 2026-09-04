export type ScenarioId = "legitimate-purchase" | "prompt-injection" | "a2a-negotiation";
export type ExecutionMode = "mock" | "live" | "shadow";
export type ConnectionState = "connected" | "connecting" | "offline";
export type PipelineStepStatus = "idle" | "running" | "complete" | "blocked" | "skipped" | "error";
export type PipelineStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface PipelineStep { id: PipelineStepId; label: string; detail: string; status: PipelineStepStatus; startedAt?: number; completedAt?: number; metadata?: Record<string, string>; }
export type TransactionStatus = "pending" | "settled" | "blocked" | "failed";
export interface SettlementEvidence { txHash: string; mode: ExecutionMode; verified: boolean; payer: string; payee: string; amountAtomic: string; blockNumber?: number; gasUsed?: string; explorerUrl?: string; }
export interface Transaction { id: string; scenario: ScenarioId; title: string; merchant: string; payee: string; amount: string; amountAtomic: string; asset: string; network: string; status: TransactionStatus; mode: ExecutionMode; createdAt: string; reason?: string; settlement?: SettlementEvidence; }
export interface StixObject { type: string; spec_version: "2.1"; id: string; created: string; modified: string; name?: string; description?: string; labels?: string[]; [key: string]: unknown; }
export interface StixBundle { type: "bundle"; id: string; objects: StixObject[]; }
export interface ThreatAlert { id: string; severity: "warning" | "critical"; title: string; message: string; detectedAt: string; techniques: string[]; indicators: string[]; blockedAmountAtomic: string; fundsMovedAtomic: string; stixBundle: StixBundle; }
export interface AuditLogEntry { id: string; at: string; kind: "info" | "success" | "warning" | "critical"; message: string; }
export interface DashboardState { version: 1; mode: ExecutionMode; connection: ConnectionState; treasuryBalance: string; dailyBudget: string; committedSpend: string; reservedSpend: string; activeTask: string; selectedScenario: ScenarioId | null; running: boolean; activeStepId: PipelineStepId | null; pipeline: PipelineStep[]; transactions: Transaction[]; alerts: ThreatAlert[]; logs: AuditLogEntry[]; latestThreat: ThreatAlert | null; selectedTransactionId: string | null; lastUpdatedAt: string; }
export interface SignatureEvidence { signature: string; nonce: string; typedData: { domain: { name: string; version: string; chainId: number; verifyingContract: string }; primaryType: "TransferWithAuthorization"; message: Record<string, string> }; }
export interface ScenarioExecutionResult { scenarioId: ScenarioId; outcome: "settled" | "blocked"; transaction: Transaction; alert?: ThreatAlert; signature?: SignatureEvidence; steps: PipelineStep[]; totalMovedAtomic: string; summary: string; }
export type EngineEvent =
  | { type: "run.started"; scenarioId: ScenarioId; at: string; message: string }
  | { type: "step.updated"; scenarioId: ScenarioId; at: string; step: PipelineStep }
  | { type: "log.created"; scenarioId: ScenarioId; at: string; log: AuditLogEntry }
  | { type: "transaction.created"; scenarioId: ScenarioId; at: string; transaction: Transaction }
  | { type: "alert.created"; scenarioId: ScenarioId; at: string; alert: ThreatAlert }
  | { type: "run.completed"; scenarioId: ScenarioId; at: string; result: ScenarioExecutionResult };
export type EngineListener = (event: EngineEvent) => void;
