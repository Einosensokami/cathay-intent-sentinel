export type Scenario = "legitimate" | "attack" | "negotiation";
export type RunState = "idle" | "running" | "settled" | "blocked" | "failed" | "unknown";
export type StepState = "waiting" | "active" | "complete" | "blocked" | "error";

/** CFO controls used by the interactive policy inspector. Amounts are USDC. */
export interface PolicyConfig {
  perTxBudgetCap: number;
  allowedMerchants: string[];
  defenseMode: "strict" | "standard" | "permissive";
}

export interface CustomIntentInput {
  prompt: string;
  merchantUrl: string;
  amount: string | number;
  memo?: string;
}

export interface PipelineStep {
  id: number;
  shortLabel: string;
  label: string;
  state: StepState;
}

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
  sha256?: string;
  policyViolationReason?: string;
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
  evidence?: Evidence;
  policyViolationReason?: string;
  evidenceHash?: string;
  domainSeparatorHash?: string;
  authorizationNonce?: string;
}

export interface ThreatRecord {
  id: string;
  time: string;
  title: string;
  description: string;
  evidenceHash: string;
  stix: Record<string, unknown>;
}
