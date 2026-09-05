import { randomBytes, randomUUID } from "node:crypto";
import type { Hex } from "viem";
import {
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  type JsonObject,
  type PaymentRequirements as CorePaymentRequirements,
  type PaymentIntent as CorePaymentIntent,
} from "@cathay/intent-sentinel-core";
import { Erc3009Signer, ScopedKeyVault } from "@cathay/intent-sentinel-key-vault";
import {
  ControlledRetryClient,
  createInMemoryFacilitator,
  createResourceServerMiddleware,
  PaymentPolicyError,
  type ClientEvent,
  type FetchLike,
  type PaymentIntent as AgentPaymentIntent,
  type PaymentRequirements as AgentPaymentRequirements,
  type PaymentSigner,
  type PolicyDecision as AgentPolicyDecision,
  type PolicyGate as AgentPolicyGate,
} from "@intent-sentinel/agent-client";
import {
  InMemoryIntentLogger,
  InMemoryNonceRegistry,
  InMemoryTrustRegistry,
  InMemoryUsageLedger,
  OWASP_AGENTIC_CONTROLS,
  PolicyGate,
  ThreatIntelReporter,
  intentHash as policyIntentHash,
  type IsolatedTaskContext,
  type PaymentIntent as PolicyPaymentIntent,
  type PolicyConfig,
  type PolicyDecision,
  type TaskContext,
  type ThreatIntelReport,
} from "@intent-sentinel/policy-engine";

const USDC_DECIMALS = 1_000_000;
const DEFAULT_PAYEE = "0x1111111111111111111111111111111111111111";
const DEFAULT_RESOURCE = "https://intel.cathay.example/reports/ai-threats";
const DEFAULT_PRIVATE_KEY = "0x0123456789012345678901234567890123456789012345678901234567890123" as Hex;
const SIMULATED_PRICE_UNITS = "10000";

export const LOCAL_MARKETPLACE_URL_PATTERNS = [
  "http://localhost:8402/*",
  "http://127.0.0.1:8402/*",
] as const;

const DEFAULT_ALLOWED_MERCHANT_URL_PATTERNS = [
  "https://*.cathay.example/*",
  ...LOCAL_MARKETPLACE_URL_PATTERNS,
] as const;

const SIMULATED_THREAT_REPORT = {
  stixVersion: "2.1",
  type: "bundle",
  id: "bundle--cathay-ai-threats-demo",
  source: "Cathay Intel simulated resource server",
  report: {
    title: "AI Threat Intelligence Report",
    severity: "high",
    summary: "Prompt-injection and tool-abuse indicators observed across agentic workflows.",
    indicators: [
      { type: "prompt-injection", name: "Instruction override attempt", confidence: 98 },
      { type: "tool-abuse", name: "Unbounded payment redirection", confidence: 94 },
    ],
    mitigations: [
      "Bind every payment to a trusted task intent.",
      "Require policy approval before signing.",
      "Treat resource content as untrusted data.",
    ],
  },
} as const;

export interface SentinelRuntimeOptions {
  perCallBudgetUsd?: number;
  dailyBudgetUsd?: number;
  privateKey?: Hex;
  trustedPayee?: string;
  trustedMerchantUrl?: string;
  allowedMerchantUrlPatterns?: readonly string[];
  fetch?: FetchLike;
}

export interface IntentEvaluationInput {
  payee: string;
  amountUsd: number;
  taskId: string;
  resourceUrl: string;
  promptContext?: string;
}

export interface IntentEvaluationResult {
  allowed: boolean;
  status: PolicyDecision["status"];
  intentHash: string;
  violations: readonly { code: string; message: string }[];
  reasons: readonly string[];
  owaspControls: typeof OWASP_AGENTIC_CONTROLS;
  threatReports: readonly ThreatIntelReport[];
}

export interface FetchResult {
  url: string;
  taskId: string;
  status: number;
  ok: boolean;
  policy: { allowed: boolean; intentHash?: string; reasons: readonly string[] };
  body: string;
  contentType?: string;
  paymentResponse?: string;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function amountUsdToUnits(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("amountUsd must be a finite non-negative number");
  const units = Math.round(value * USDC_DECIMALS);
  if (!Number.isSafeInteger(units)) throw new RangeError("amountUsd is too large");
  return BigInt(units);
}

function unitsToUsd(units: bigint): number { return Number(units) / USDC_DECIMALS; }

function requireTaskId(value: string): string {
  if (!value.trim() || value.length > 200) throw new TypeError("taskId must be a non-empty string of at most 200 characters");
  return value;
}

function isLocalMarketplaceUrl(value: URL): boolean {
  return value.protocol === "http:" &&
    (value.hostname.toLowerCase() === "localhost" || value.hostname === "127.0.0.1") &&
    value.port === "8402";
}

function requireResourceUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !isLocalMarketplaceUrl(url)) {
    throw new TypeError("Only HTTPS resource URLs or HTTP localhost:8402 marketplace URLs are allowed");
  }
  return url.toString();
}

function randomNonce(): string { return `0x${randomBytes(32).toString("hex")}`; }

function parsePromptContext(promptContext: string | undefined): unknown {
  if (!promptContext?.trim().startsWith("{")) return promptContext;
  try {
    const parsed: unknown = JSON.parse(promptContext);
    return parsed && typeof parsed === "object" ? parsed : promptContext;
  } catch {
    return promptContext;
  }
}

function asCoreRequirements(requirements: AgentPaymentRequirements): CorePaymentRequirements {
  return {
    scheme: requirements.scheme,
    network: requirements.network,
    asset: requirements.asset,
    amount: requirements.amount,
    payTo: requirements.payTo,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds ?? 300,
    ...(requirements.extra ? { extra: requirements.extra as JsonObject } : {}),
  };
}

function coreIntentFromAgent(intent: AgentPaymentIntent): CorePaymentIntent {
  return {
    task_id: intent.taskId,
    resource: intent.resource,
    payee: intent.payTo,
    max_amount: intent.maxAmount,
    asset_network: { asset: intent.asset, network: intent.network },
    expires_at: Math.max(1, Math.floor(intent.expiresAt / 1000)),
  };
}

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSimulatedCathayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase().endsWith(".cathay.example");
  } catch {
    return false;
  }
}

function createDefaultFetcher(): FetchLike {
  const facilitator = createInMemoryFacilitator("0xcathay_intel");
  const resourceServer = createResourceServerMiddleware({
    paymentRequired: (request) => ({
      x402Version: 2,
      resource: request.url,
      accepts: [{
        scheme: "exact",
        network: BASE_SEPOLIA,
        asset: BASE_SEPOLIA_USDC,
        amount: SIMULATED_PRICE_UNITS,
        payTo: DEFAULT_PAYEE,
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      }],
    }),
    facilitator,
    handler: async (request) => new Response(JSON.stringify({
      ...SIMULATED_THREAT_REPORT,
      resource: request.url,
      generatedAt: new Date().toISOString(),
    }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
  });
  const networkFetch = globalThis.fetch.bind(globalThis);
  return (input, init) => {
    const request = new Request(input, init);
    return isSimulatedCathayUrl(request.url) ? resourceServer(request) : networkFetch(request);
  };
}

class PaymentPolicyAdapter implements AgentPolicyGate {
  private approved: { gate: PolicyGate; intent: PolicyPaymentIntent; amount: string } | undefined;

  public constructor(
    private readonly runtime: SentinelRuntime,
    private readonly gate: PolicyGate,
    private readonly taskId: string,
  ) {}

  public async evaluate(
    intent: AgentPaymentIntent,
    requirement: AgentPaymentRequirements,
    context: { taskId?: string; purpose?: string; metadata?: Record<string, unknown> },
  ): Promise<AgentPolicyDecision> {
    const coreIntent = coreIntentFromAgent(intent);
    const trusted: TaskContext = {
      ...coreIntent,
      task_id: context.taskId ?? this.taskId,
      merchant_url: intent.resource,
    };
    const promptContext = context.metadata?.promptContext;
    const isolated: IsolatedTaskContext = {
      trusted,
      ...(promptContext !== undefined ? { untrusted: promptContext } : {}),
    };
    const decision = await this.gate.evaluate(coreIntent, isolated);
    const requirementAmount = BigInt(requirement.amount);
    const capExceeded = requirementAmount > BigInt(intent.maxAmount);
    const reasons = [...decision.reasons, ...(capExceeded ? ["Quoted amount exceeds the requested maxAmountUsd cap"] : [])];
    const allowed = decision.allowed && !capExceeded;
    if (allowed) this.approved = { gate: this.gate, intent: coreIntent, amount: requirement.amount };
    if (!allowed) this.runtime.recordThreats(reasons, intent, requirement);
    return {
      allowed,
      reasons,
      policyId: "intent-sentinel-cfo-policy-v1",
      metadata: { intentHash: decision.intent_hash, violations: decision.violations.map((violation) => violation.code) },
    };
  }

  public async recordSettlement(): Promise<void> {
    if (!this.approved) return;
    await this.approved.gate.recordSettlement(this.approved.intent, this.approved.amount);
  }

  public get intentHash(): string | undefined {
    return this.approved ? this.runtime.intentHash(this.approved.intent) : undefined;
  }
}

export class SentinelRuntime {
  public readonly perCallBudgetUnits: bigint;
  public readonly dailyBudgetUnits: bigint;
  public readonly trustedPayee: string;
  public readonly trustedMerchantUrl: string;
  public readonly allowedMerchantUrlPatterns: readonly string[];
  private readonly privateKey: Hex;
  private readonly fetcher: FetchLike;
  private readonly usageLedger = new InMemoryUsageLedger();
  private readonly nonceRegistry = new InMemoryNonceRegistry();
  private readonly trustRegistry = new InMemoryTrustRegistry();
  private readonly intentLogger = new InMemoryIntentLogger();
  private readonly threatReporter = new ThreatIntelReporter({ sourceName: "IntentSentinel MCP" });

  public constructor(options: SentinelRuntimeOptions = {}) {
    this.perCallBudgetUnits = amountUsdToUnits(options.perCallBudgetUsd ?? envNumber("SENTINEL_PER_CALL_BUDGET_USD", 1));
    this.dailyBudgetUnits = amountUsdToUnits(options.dailyBudgetUsd ?? envNumber("SENTINEL_DAILY_BUDGET_USD", 100));
    if (this.perCallBudgetUnits <= 0n || this.dailyBudgetUnits <= 0n) throw new RangeError("Budgets must be greater than zero");
    this.trustedPayee = options.trustedPayee ?? process.env.SENTINEL_TRUSTED_PAYEE ?? DEFAULT_PAYEE;
    this.trustedMerchantUrl = options.trustedMerchantUrl ?? process.env.SENTINEL_TRUSTED_MERCHANT_URL ?? DEFAULT_RESOURCE;
    this.allowedMerchantUrlPatterns = options.allowedMerchantUrlPatterns ?? (process.env.SENTINEL_ALLOWED_MERCHANT_URL_PATTERNS?.split(",").map((value) => value.trim()).filter(Boolean) ?? DEFAULT_ALLOWED_MERCHANT_URL_PATTERNS);
    this.privateKey = options.privateKey ?? (process.env.SENTINEL_PRIVATE_KEY as Hex | undefined) ?? DEFAULT_PRIVATE_KEY;
    this.fetcher = options.fetch ?? createDefaultFetcher();
    this.trustRegistry.register({ address: this.trustedPayee, merchant_url: this.trustedMerchantUrl, reputation_score: 100 });
  }

  private policyConfig(taskId: string): PolicyConfig {
    return {
      per_call_budget_cap: this.perCallBudgetUnits,
      daily_budget_cap: this.dailyBudgetUnits,
      task_specific_caps: { [taskId]: this.dailyBudgetUnits },
      velocity_limit: { max_calls: 20, window_seconds: 60 },
      allowed_merchant_url_patterns: this.allowedMerchantUrlPatterns,
      allowed_payee_addresses: [this.trustedPayee],
      high_risk_threshold: this.perCallBudgetUnits,
      allowed_assets: [BASE_SEPOLIA_USDC],
      allowed_networks: [BASE_SEPOLIA],
    };
  }

  private gateFor(taskId: string, merchantUrl = this.trustedMerchantUrl): PolicyGate {
    const trustRegistry = merchantUrl === this.trustedMerchantUrl ? this.trustRegistry : new InMemoryTrustRegistry();
    if (trustRegistry !== this.trustRegistry) {
      trustRegistry.register({ address: this.trustedPayee, merchant_url: merchantUrl, reputation_score: 100 });
    }
    return new PolicyGate(this.policyConfig(taskId), {
      usageLedger: this.usageLedger,
      nonceRegistry: this.nonceRegistry,
      trustRegistry,
      logger: this.intentLogger,
    });
  }

  public intentHash(intent: PolicyPaymentIntent): string {
    return policyIntentHash(intent);
  }

  public async evaluateIntent(input: IntentEvaluationInput): Promise<IntentEvaluationResult> {
    const taskId = requireTaskId(input.taskId);
    const resourceUrl = requireResourceUrl(input.resourceUrl);
    const maxAmount = amountUsdToUnits(input.amountUsd);
    const intent: PolicyPaymentIntent = {
      task_id: taskId,
      resource: resourceUrl,
      payee: input.payee,
      max_amount: maxAmount.toString(),
      asset_network: { asset: BASE_SEPOLIA_USDC, network: BASE_SEPOLIA },
      expires_at: Math.floor(Date.now() / 1000) + 300,
      nonce: randomNonce(),
    };
    const context: IsolatedTaskContext = {
      trusted: { ...intent, merchant_url: resourceUrl },
      ...(input.promptContext !== undefined ? { untrusted: parsePromptContext(input.promptContext) } : {}),
    };
    const gate = this.gateFor(taskId, resourceUrl);
    const decision = await gate.evaluate(intent, context);
    const threatReports = decision.violations.map((violation) => this.threatReporter.report({
      code: violation.code,
      message: violation.message,
      proposedFields: { payee: input.payee, amount_usd: input.amountUsd, resource_url: resourceUrl },
      trustedFields: { task_id: taskId, resource: resourceUrl, max_amount: maxAmount.toString() },
      merchantUrl: resourceUrl,
    }));
    return {
      allowed: decision.allowed,
      status: decision.status,
      intentHash: decision.intent_hash,
      violations: decision.violations,
      reasons: decision.reasons,
      owaspControls: OWASP_AGENTIC_CONTROLS,
      threatReports,
    };
  }

  public recordThreats(reasons: readonly string[], intent: AgentPaymentIntent, requirement: AgentPaymentRequirements): void {
    for (const reason of reasons) this.threatReporter.report({
      message: reason,
      proposedFields: { payee: requirement.payTo, amount: requirement.amount },
      trustedFields: { task_id: intent.taskId, resource: intent.resource, max_amount: intent.maxAmount },
      merchantUrl: intent.resource,
      merchantWallet: requirement.payTo,
    });
  }

  public async payAndFetch(
    urlInput: string,
    taskIdInput: string,
    purpose: string,
    maxAmountUsd: number,
    options: { onEvent?: (event: ClientEvent) => void } = {},
  ): Promise<FetchResult> {
    const url = requireResourceUrl(urlInput);
    const taskId = requireTaskId(taskIdInput);
    const maxAmountUnits = amountUsdToUnits(maxAmountUsd);
    if (maxAmountUnits <= 0n) throw new RangeError("maxAmountUsd must be greater than zero");
    const gate = this.gateFor(taskId, url);
    const policy = new PaymentPolicyAdapter(this, gate, taskId);
    const signer: PaymentSigner = {
      sign: async (intent, requirement) => {
        const coreIntent = coreIntentFromAgent(intent);
        const vault = new ScopedKeyVault({ privateKey: this.privateKey, intent: coreIntent });
        const payment = await new Erc3009Signer(vault).signPayment(coreIntent, asCoreRequirements(requirement));
        return { authorization: payment.payload.authorization, signature: payment.payload.signature };
      },
    };
    const client = new ControlledRetryClient({
      fetch: this.fetcher,
      policyGate: policy,
      signer,
      maxRetries: 1,
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      bindIntent: (requirement, request, context): AgentPaymentIntent => ({
        intentId: `intent_${randomUUID()}`,
        taskId: context.taskId ?? taskId,
        resource: requirement.resource ?? request.url,
        payTo: requirement.payTo,
        amount: requirement.amount,
        maxAmount: maxAmountUnits.toString(),
        asset: requirement.asset,
        network: requirement.network,
        scheme: requirement.scheme,
        expiresAt: Date.now() + (requirement.maxTimeoutSeconds ?? 300) * 1000,
        nonce: randomNonce(),
        createdAt: Date.now(),
        ...(context.metadata ? { metadata: context.metadata } : {}),
      }),
    });
    let response: Response;
    try {
      response = await client.fetch(url, undefined, { taskId, purpose, metadata: { promptContext: purpose } });
    } catch (error) {
      if (error instanceof PaymentPolicyError) {
        const metadata = error.decision.metadata;
        const intentHash = typeof metadata?.intentHash === "string" ? metadata.intentHash : undefined;
        return {
          url,
          taskId,
          status: 402,
          ok: false,
          policy: { allowed: false, ...(intentHash ? { intentHash } : {}), reasons: error.decision.reasons ?? [error.message] },
          body: "Payment blocked by the IntentSentinel policy gate",
        };
      }
      throw error;
    }
    if (response.status < 400) await policy.recordSettlement();
    const body = (await response.text()).slice(0, 32_768);
    const contentType = response.headers.get("content-type") ?? undefined;
    const paymentResponse = response.headers.get("PAYMENT-RESPONSE") ?? undefined;
    return {
      url,
      taskId,
      status: response.status,
      ok: response.ok,
      policy: { allowed: true, ...(policy.intentHash ? { intentHash: policy.intentHash } : {}), reasons: [] },
      body,
      ...(contentType ? { contentType } : {}),
      ...(paymentResponse ? { paymentResponse } : {}),
    };
  }

  public async policyAndBudget(): Promise<Record<string, unknown>> {
    const usage = await this.usageLedger.snapshot("__treasury__", Math.floor(Date.now() / 1000));
    const remaining = this.dailyBudgetUnits > usage.daily_spent ? this.dailyBudgetUnits - usage.daily_spent : 0n;
    return {
      currency: "USDC",
      network: BASE_SEPOLIA,
      treasury: {
        dailyBudgetUsd: unitsToUsd(this.dailyBudgetUnits),
        spentUsd: unitsToUsd(usage.daily_spent),
        remainingUsd: unitsToUsd(remaining),
        dailyBudgetAtomicUnits: this.dailyBudgetUnits.toString(),
        spentAtomicUnits: usage.daily_spent.toString(),
        remainingAtomicUnits: remaining.toString(),
      },
      policies: {
        perCallCapUsd: unitsToUsd(this.perCallBudgetUnits),
        perCallCapAtomicUnits: this.perCallBudgetUnits.toString(),
        velocity: { maxCalls: 20, windowSeconds: 60 },
        allowedMerchantUrlPatterns: this.allowedMerchantUrlPatterns,
        allowedPayeeAddresses: [this.trustedPayee],
        allowedAsset: BASE_SEPOLIA_USDC,
        allowedNetwork: BASE_SEPOLIA,
        owaspControls: OWASP_AGENTIC_CONTROLS,
      },
    };
  }

  public threatIntel(): Record<string, unknown> {
    return { stixVersion: "2.1", reports: this.threatReporter.listReports(), feed: this.threatReporter.feed() };
  }
}

export { DEFAULT_PAYEE, DEFAULT_RESOURCE, displayError, amountUsdToUnits, unitsToUsd };
