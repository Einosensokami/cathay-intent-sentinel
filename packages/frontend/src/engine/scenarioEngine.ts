import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC, MockPaymentAdapter, createEventStream, type EventStreamAdapter, type PaymentAdapter, type SignRequest } from "./adapters";
import type { AuditLogEntry, DashboardState, EngineEvent, EngineListener, PipelineStep, PipelineStepId, ScenarioExecutionResult, ScenarioId, SettlementEvidence, StixBundle, ThreatAlert, Transaction } from "./types";

export const BUYER_ADDRESS = "0x8B7a3B7F0dB0b1E9d0A2f3C4d5E6f708192A3B4C5";
export const TRUSTED_PAYEE = "0x2a8e7c5d4b3a29181716151413121110f0e0d0c0b";
export const MERCHANT_NAME = "DataHarbor Analytics";
const META: Record<ScenarioId, { title: string; merchant: string }> = {
  "legitimate-purchase": { title: "Legitimate data purchase", merchant: MERCHANT_NAME },
  "prompt-injection": { title: "Prompt injection attempt", merchant: "Untrusted merchant payload" },
  "a2a-negotiation": { title: "A2A dynamic negotiation", merchant: "ReputationHub Agent #4421" },
};

export function createInitialPipeline(scenario: ScenarioId = "legitimate-purchase"): PipelineStep[] {
  const labels: Record<ScenarioId, string[]> = {
    "legitimate-purchase": ["402 challenge", "Policy gate", "Budget reserve", "EIP-712 sign", "Route", "Settle", "Confirm", "200 OK"],
    "prompt-injection": ["402 challenge", "Quarantine input", "Policy gate", "Funds protected", "No signature", "No broadcast", "STIX report", "Blocked"],
    "a2a-negotiation": ["Offer received", "Price negotiated", "ERC-8004 trust", "SLA bond lock", "Policy bind", "Base L2 route", "EIP-712 sign", "Settle"],
  };
  const details: Record<ScenarioId, string[]> = {
    "legitimate-purchase": ["Server returned PAYMENT-REQUIRED", "Merchant, asset, amount and task match", "0.01 USDC reserved", "ERC-3009 TransferWithAuthorization", "Base Sepolia selected", "Facilitator accepted exact payload", "Mock receipt reconciled", "Protected resource released"],
    "prompt-injection": ["Server returned a 500 USDC request", "Merchant text isolated from policy context", "MERCHANT_MISMATCH + BUDGET_EXCEEDED", "Atomic balance unchanged", "Custody boundary never reached", "No transaction submitted", "Redacted STIX 2.1 bundle created", "Payment denied fail-closed"],
    "a2a-negotiation": ["Seller opened at 0.05 USDC", "Buyer accepted 0.03 USDC (40% saved)", "98/100 weighted reputation", "Stake coverage locked through SLA", "Intent frozen to signed transcript and policy", "Gas and liquidity route on Base L2", "ERC-3009 authorization signed", "Exact negotiated amount settled"],
  };
  return labels[scenario].map((label, index) => ({ id: (index + 1) as PipelineStepId, label, detail: details[scenario][index] ?? "", status: "idle" }));
}

export function createInitialState(): DashboardState {
  const created = new Date().toISOString();
  return { version: 1, mode: "mock", connection: "connected", treasuryBalance: "9999.97", dailyBudget: "1000.00", committedSpend: "0.00", reservedSpend: "0.00", activeTask: "Enterprise Q3 Financial Intel Collection", selectedScenario: null, running: false, activeStepId: null, pipeline: createInitialPipeline(), transactions: [], alerts: [], logs: [{ id: "boot", at: created, kind: "success", message: "Policy guard armed · mock event stream connected" }], latestThreat: null, selectedTransactionId: null, lastUpdatedAt: created };
}

export class ScenarioEngine {
  private readonly listeners = new Set<EngineListener>();
  private readonly eventStream: EventStreamAdapter;
  private running = false;
  constructor(private readonly payment: PaymentAdapter = new MockPaymentAdapter(), eventStream?: EventStreamAdapter) { this.eventStream = eventStream ?? createEventStream(); void this.eventStream.connect(); }
  subscribe(listener: EngineListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async runScenario(scenarioId: ScenarioId): Promise<ScenarioExecutionResult> {
    if (this.running) throw new Error("A scenario is already running");
    this.running = true;
    this.emit({ type: "run.started", scenarioId, at: iso(), message: `Started ${META[scenarioId].title}` });
    try {
      const steps = createInitialPipeline(scenarioId);
      const result = scenarioId === "legitimate-purchase" ? await this.legitimate(scenarioId, steps) : scenarioId === "prompt-injection" ? await this.injection(scenarioId, steps) : await this.negotiation(scenarioId, steps);
      this.emit({ type: "run.completed", scenarioId, at: iso(), result });
      return result;
    } finally { this.running = false; }
  }

  private async legitimate(id: ScenarioId, steps: PipelineStep[]): Promise<ScenarioExecutionResult> {
    await this.complete(id, steps, 1, "402 challenge accepted · 0.01 USDC exact"); await this.complete(id, steps, 2, "ALLOW · merchant and task binding verified"); await this.complete(id, steps, 3, "Reservation created before custody access");
    const { signature, request } = await this.sign(id, steps, 4, "10000", "Legitimate purchase"); await this.complete(id, steps, 5, "Base Sepolia · eip155:84532"); const settlement = await this.payment.settle(request); await this.complete(id, steps, 6, "Facilitator simulated exact ERC-3009 settlement"); await this.complete(id, steps, 7, "Mock receipt reconciled · no on-chain claim"); await this.complete(id, steps, 8, "Protected resource released");
    const transaction = this.transaction(id, "0.01", "10000", "settled", settlement); this.emit({ type: "transaction.created", scenarioId: id, at: iso(), transaction }); this.log(id, "success", "Legitimate purchase settled · 0.01 USDC · mock mode");
    return { scenarioId: id, outcome: "settled", transaction, signature, steps, totalMovedAtomic: "10000", summary: "Policy-approved purchase completed in isolated mock mode." };
  }

  private async injection(id: ScenarioId, steps: PipelineStep[]): Promise<ScenarioExecutionResult> {
    await this.complete(id, steps, 1, "402 challenge advertised 500 USDC"); await this.complete(id, steps, 2, "Untrusted instructions quarantined"); await pause(250); this.update(id, steps, 3, "blocked", "DENY · MERCHANT_MISMATCH · BUDGET_EXCEEDED");
    for (const step of steps.slice(3, 7)) this.update(id, steps, step.id, "skipped", "Custody boundary not reached"); const alert = this.threatAlert(); this.emit({ type: "alert.created", scenarioId: id, at: iso(), alert }); this.update(id, steps, 8, "blocked", "Payment denied fail-closed");
    const transaction = this.transaction(id, "500.00", "500000000", "blocked", undefined, "Zero funds moved · policy rejection"); this.emit({ type: "transaction.created", scenarioId: id, at: iso(), transaction }); this.log(id, "critical", "Blocked unauthorized 500 USDC transfer · STIX alert emitted");
    return { scenarioId: id, outcome: "blocked", transaction, alert, steps, totalMovedAtomic: "0", summary: "Prompt injection quarantined before signing; funds remained untouched." };
  }

  private async negotiation(id: ScenarioId, steps: PipelineStep[]): Promise<ScenarioExecutionResult> {
    await this.complete(id, steps, 1, "Seller offer: 0.05 USDC"); await this.complete(id, steps, 2, "Accepted counter: 0.03 USDC · 40% discount"); await this.complete(id, steps, 3, "ERC-8004 reputation verified · 98/100"); await this.complete(id, steps, 4, "SLA bond locked · 10× payment coverage"); await this.complete(id, steps, 5, "Intent frozen to signed transcript and policy"); await this.complete(id, steps, 6, "Base L2 gas route selected · 0.03 USDC");
    const { signature, request } = await this.sign(id, steps, 7, "30000", "Negotiated A2A service"); const settlement = await this.payment.settle(request); await this.complete(id, steps, 8, "Settlement confirmed · SLA remains locked");
    const transaction = this.transaction(id, "0.03", "30000", "settled", settlement); this.emit({ type: "transaction.created", scenarioId: id, at: iso(), transaction }); this.log(id, "success", "A2A negotiation settled · 40% discount captured");
    return { scenarioId: id, outcome: "settled", transaction, signature, steps, totalMovedAtomic: "30000", summary: "Negotiated terms, trust, stake, and route were frozen before settlement." };
  }

  private async sign(id: ScenarioId, steps: PipelineStep[], stepId: PipelineStepId, amountAtomic: string, label: string): Promise<{ signature: NonNullable<ScenarioExecutionResult["signature"]>; request: SignRequest }> {
    this.update(id, steps, stepId, "running", "Vault validating approved intent"); const request: SignRequest = { from: BUYER_ADDRESS, to: TRUSTED_PAYEE, amountAtomic, nonce: `0x${randomHex(32)}`, validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) + 900) }; const signature = await this.payment.signErc3009(request); this.update(id, steps, stepId, "complete", `${label} · signature ${signature.signature.slice(0, 25)}…`); this.log(id, "info", `Scoped signer produced ERC-3009 EIP-712 authorization for ${amountAtomic} atomic units`); return { signature, request };
  }

  private transaction(scenario: ScenarioId, amount: string, amountAtomic: string, status: Transaction["status"], settlement?: SettlementEvidence, reason?: string): Transaction { return { id: `tx-${randomHex(8)}`, scenario, title: META[scenario].title, merchant: META[scenario].merchant, payee: TRUSTED_PAYEE, amount, amountAtomic, asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA_NETWORK, status, mode: "mock", createdAt: iso(), ...(reason ? { reason } : {}), ...(settlement ? { settlement } : {}) }; }

  private threatAlert(): ThreatAlert {
    const detectedAt = iso(); const bundle: StixBundle = { type: "bundle", id: `bundle--${randomHex(16)}`, objects: [
      { type: "identity", spec_version: "2.1", id: `identity--${randomHex(16)}`, created: detectedAt, modified: detectedAt, name: "Cathay IntentSentinel", identity_class: "system" },
      { type: "indicator", spec_version: "2.1", id: `indicator--${randomHex(16)}`, created: detectedAt, modified: detectedAt, name: "Merchant instruction override", pattern: "[x-intent:merchant_mismatch = true]", pattern_type: "sentinel-rule", labels: ["prompt-injection", "goal-hijack"] },
      { type: "attack-pattern", spec_version: "2.1", id: `attack-pattern--${randomHex(16)}`, created: detectedAt, modified: detectedAt, name: "Agent goal hijacking", description: "Untrusted merchant content attempted to redirect payment authority.", external_references: [{ source_name: "OWASP Agentic Security", external_id: "ASI01" }] },
      { type: "report", spec_version: "2.1", id: `report--${randomHex(16)}`, created: detectedAt, modified: detectedAt, name: "IntentSentinel policy denial", description: "500 USDC request denied by independent merchant and budget controls.", labels: ["blocked", "redacted"] },
    ] }; return { id: `alert-${randomHex(8)}`, severity: "critical", title: "Prompt injection blocked", message: "Merchant content attempted to rewrite the authorized payee and exceed the task budget.", detectedAt, techniques: ["ASI01 · Agent Goal Hijack", "ASI03 · Privilege Abuse"], indicators: ["MERCHANT_MISMATCH", "BUDGET_EXCEEDED", "requested: 500.00 USDC", "funds moved: 0.00 USDC"], blockedAmountAtomic: "500000000", fundsMovedAtomic: "0", stixBundle: bundle };
  }

  private async complete(id: ScenarioId, steps: PipelineStep[], stepId: PipelineStepId, detail: string): Promise<void> { const step = steps[stepId - 1]; this.update(id, steps, stepId, "running", step?.detail ?? detail); await pause(260); this.update(id, steps, stepId, "complete", detail); }
  private update(scenarioId: ScenarioId, steps: PipelineStep[], id: PipelineStepId, status: PipelineStep["status"], detail: string): void { const index = id - 1; const previous = steps[index]; if (!previous) return; const step: PipelineStep = { ...previous, status, detail, ...(status === "running" ? { startedAt: Date.now() } : {}), ...(status === "complete" || status === "blocked" ? { completedAt: Date.now() } : {}) }; steps[index] = step; this.emit({ type: "step.updated", scenarioId, at: iso(), step }); }
  private log(scenarioId: ScenarioId, kind: AuditLogEntry["kind"], message: string): void { const log: AuditLogEntry = { id: `log-${randomHex(6)}`, at: iso(), kind, message }; this.emit({ type: "log.created", scenarioId, at: log.at, log }); }
  private emit(event: EngineEvent): void { this.eventStream.publish(event); this.listeners.forEach((listener) => listener(event)); }
}

function iso(): string { return new Date().toISOString(); }
function pause(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function randomHex(bytes: number): string { const values = new Uint8Array(bytes); if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(values); else for (let index = 0; index < bytes; index += 1) values[index] = (Date.now() + index * 31) % 256; return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join(""); }

export { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC };
