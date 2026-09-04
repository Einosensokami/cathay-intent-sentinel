import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createApiClient, createCorrelationId, getRuntimeConfig, type SettleResponse, type VerifyRequest } from "./api/client";
import { isVerifiedLiveSettlement, safeExplorerUrl } from "./api/evidence";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { StixModal } from "./components/StixModal";
import { TxReceiptModal } from "./components/TxReceiptModal";
import type { CustomIntent } from "./components/LeftPanel";
import type { PolicyState } from "./components/PolicyInspector";
import { ATTACK_THREAT, INITIAL_TRANSACTIONS, PIPELINE_TEMPLATE } from "./data";
import type { PipelineStep, RunState, Scenario, ThreatRecord, Transaction } from "./types";

const runtime = getRuntimeConfig();
const api = createApiClient({ baseUrl: runtime.baseUrl, eventTransport: runtime.eventTransport });
const wait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const clock = () => new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());

interface RunContext { correlationId: string; idempotencyKey: string; }
interface PolicyEvaluation { scenario: Scenario; blocked: boolean; reason: string; owaspDetected: boolean; amount: number; merchant: string; resource: string; }

export default function App() {
  const [mode, setMode] = useState<"mock" | "live">(import.meta.env.VITE_EXECUTION_MODE === "live" ? "live" : "mock");
  const [connection, setConnection] = useState<"connected" | "connecting" | "offline">(mode === "mock" ? "connected" : "connecting");
  const [runState, setRunState] = useState<RunState>("idle");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(PIPELINE_TEMPLATE.map((step) => ({ ...step })));
  const [balance, setBalance] = useState(9999.97);
  const [spent, setSpent] = useState(0.05);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [threat, setThreat] = useState<ThreatRecord | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<ThreatRecord | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [policy, setPolicy] = useState<PolicyState>({ perTxCap: 1, strictAllowlist: true, owaspProtection: true });
  const runToken = useRef(0);
  const retryContext = useRef<RunContext | null>(null);
  const retryIntent = useRef<CustomIntent | null>(null);

  const updateStep = useCallback((index: number, state: PipelineStep["state"]) => {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, state } : step));
  }, []);

  useEffect(() => {
    let subscription: { close: () => void } | undefined;
    let cancelled = false;
    setError(null);
    if (mode === "mock") {
      setConnection("connected");
      return () => { cancelled = true; subscription?.close(); };
    }
    setConnection("connecting");
    void api.health().then(() => {
      if (!cancelled) setConnection("connected");
    }).catch((reason: unknown) => {
      if (!cancelled) { setConnection("offline"); setError(asApiError(reason, "無法連線至 Live API。")); }
    });
    subscription = api.events({
      onEvent: () => undefined,
      onState: (state) => { if (!cancelled) setConnection(state); },
      onError: (reason) => { if (!cancelled) setError(reason); },
    });
    return () => { cancelled = true; subscription?.close(); };
  }, [mode]);

  const run = useCallback(async (next: Scenario, suppliedContext?: RunContext, customIntent?: CustomIntent) => {
    if (runState === "running") return;
    const context = suppliedContext ?? { correlationId: createCorrelationId(), idempotencyKey: `settle-${createCorrelationId()}` };
    retryContext.current = context;
    retryIntent.current = customIntent ?? null;
    const evaluation = customIntent ? evaluateCustomIntent(customIntent, policy) : quickEvaluation(next);
    const token = ++runToken.current;
    setRunState("running"); setScenario(evaluation.scenario); setThreat(null); setError(null);
    setSteps(PIPELINE_TEMPLATE.map((step) => ({ ...step })));
    const stale = () => token !== runToken.current;

    if (mode === "mock") {
      await runMock(evaluation, context, customIntent, stale, updateStep, (transaction) => setTransactions((items) => [transaction, ...items]));
      if (!stale()) { if (evaluation.owaspDetected) setThreat(ATTACK_THREAT); setRunState(evaluation.blocked ? "blocked" : "settled"); }
      return;
    }

    let settlementStarted = false;
    try {
      for (let index = 0; index < 4; index += 1) {
        if (stale()) return;
        updateStep(index, "active");
        await wait(220);
        if (stale()) return;
        if (evaluation.blocked && index === 3) {
          updateStep(index, "blocked");
          const denied = deniedTransaction(context, evaluation.reason, "live", customIntent);
          setTransactions((items) => [denied, ...items]); if (evaluation.owaspDetected) setThreat(ATTACK_THREAT); setRunState("blocked");
          return;
        }
        updateStep(index, "complete");
      }

      const request = livePaymentRequest(evaluation, customIntent);
      const verified = await api.verify(request, { correlationId: context.correlationId });
      if (!verified.isValid) {
        updateStep(3, "blocked");
        const denied = deniedTransaction(context, verified.invalidReason ?? "Live policy rejected this payment", "live", customIntent);
        setTransactions((items) => [denied, ...items]); setRunState("blocked");
        setError(new ApiError(verified.invalidReason ?? "Live policy rejected this payment", { code: verified.errorCode ?? "POLICY_DENIED", correlationId: context.correlationId }));
        return;
      }
      updateStep(4, "active"); await wait(220); updateStep(4, "complete");
      updateStep(5, "active");
      settlementStarted = true;
      const settled = await api.settle({ ...request, idempotency_key: context.idempotencyKey }, { correlationId: context.correlationId });
      const transaction = transactionFromLive(evaluation, settled, context);
      setTransactions((items) => [transaction, ...items]);
      if (settled.success && transaction.verified) {
        updateStep(5, "complete"); updateStep(6, "complete"); updateStep(7, "complete");
        setBalance((value) => value - evaluation.amount); setSpent((value) => value + evaluation.amount); setRunState("settled");
      } else {
        updateStep(5, "error"); updateStep(6, "error"); setRunState("unknown");
        setError(new ApiError(settled.errorReason ?? "結算結果尚未確認；未自動切換至 Mock。", { code: "SETTLEMENT_UNKNOWN", correlationId: context.correlationId }));
      }
    } catch (reason: unknown) {
      const apiError = asApiError(reason, "Live 請求失敗；未自動切換至 Mock。", context);
      const uncertain = apiError.code === "TIMEOUT" || (settlementStarted && apiError.code === "NETWORK_ERROR");
      setError(apiError);
      if (uncertain) { updateStep(6, "error"); setRunState("unknown"); } else { updateStep(3, "error"); setRunState("failed"); }
    }
  }, [mode, policy, runState, updateStep]);

  const runCustom = useCallback((intent: CustomIntent) => {
    const evaluation = evaluateCustomIntent(intent, policy);
    void run(evaluation.scenario, undefined, intent);
  }, [policy, run]);

  const switchMode = useCallback((next: "mock" | "live") => {
    if (runState === "running" || next === mode) return;
    setMode(next); setRunState("idle"); setScenario(null); setThreat(null); setError(null); setSteps(PIPELINE_TEMPLATE.map((step) => ({ ...step })));
  }, [mode, runState]);

  const retry = useCallback(() => {
    if (scenario && retryContext.current) void run(scenario, retryContext.current, retryIntent.current ?? undefined);
  }, [run, scenario]);

  const defending = runState === "blocked";
  return <div className="min-h-screen bg-cyber text-slate-300">
    <div className="ambient-grid" aria-hidden="true" />
    <Header balance={balance} defending={defending} mode={mode} connection={connection} onModeChange={switchMode} liveConfigured={runtime.liveConfigured} />
    <main className="relative mx-auto max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cathay-light">Treasury workspace / Live controls</p><h1 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-white sm:text-2xl">每個意圖，都必須通過財務邊界。</h1></div>
        <p className="max-w-md text-right text-[10px] leading-4 text-slate-600">推理代理提出方案，IntentSentinel 作出決策；只有通過政策的 payload 才能進入簽署邊界。</p>
      </div>
      {error && <ErrorBanner error={error} onRetry={runState === "failed" || runState === "unknown" ? retry : undefined} />}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(390px,0.88fr)_minmax(560px,1.45fr)]"><LeftPanel runState={runState} activeScenario={scenario} steps={steps} onRun={(value) => void run(value)} onRunCustom={runCustom} mode={mode} connection={connection} /><RightPanel spent={spent} defending={defending} transactions={transactions} threat={threat} policy={policy} onPolicyChange={(change) => setPolicy((current) => ({ ...current, ...change }))} onInspectTx={setSelectedTx} onInspectThreat={setSelectedThreat} /></div>
    </main>
    <footer className="relative mx-auto flex max-w-[1600px] flex-wrap justify-between gap-2 border-t border-line/50 px-5 py-4 font-mono text-[9px] uppercase tracking-wider text-slate-700 lg:px-8"><span>IntentSentinel 瀏覽器控制台</span><span>{mode === "mock" ? "Mock：不會移動資金／不會產生鏈上連結" : "Live：僅顯示已確認的鏈上證據"}</span></footer>
    <StixModal threat={selectedThreat} onClose={() => setSelectedThreat(null)} /><TxReceiptModal transaction={selectedTx} onClose={() => setSelectedTx(null)} />
  </div>;
}

async function runMock(evaluation: PolicyEvaluation, context: RunContext, customIntent: CustomIntent | undefined, stale: () => boolean, updateStep: (index: number, state: PipelineStep["state"]) => void, add: (transaction: Transaction) => void): Promise<void> {
  const last = evaluation.blocked ? 3 : 7;
  for (let index = 0; index <= last; index += 1) {
    if (stale()) return;
    updateStep(index, "active"); await wait(index === 3 ? 320 : 210);
    if (stale()) return;
    if (evaluation.blocked && index === 3) { updateStep(index, "blocked"); add(deniedTransaction(context, evaluation.reason, "mock", customIntent)); return; }
    updateStep(index, "complete");
  }
  add({ id: `MOCK-${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`, time: clock(), merchant: evaluation.merchant, resource: evaluation.resource, amount: `${evaluation.amount.toFixed(3)} USDC`, status: "settled", mode: "mock", verified: false, network: "Base Sepolia · 84532", reason: customIntent ? "Custom Intent 已通過目前政策；僅供流程展示，未提交鏈上交易" : "Mock receipt：僅供流程展示，未提交鏈上交易" });
}

function livePaymentRequest(evaluation: PolicyEvaluation, customIntent?: CustomIntent): VerifyRequest {
  const injected = typeof window !== "undefined" ? window.__INTENTSENTINEL_PAYMENT__ : undefined;
  const intent = { scenario: evaluation.scenario, resource: evaluation.resource, amount: String(evaluation.amount * 1_000_000), ...(customIntent ? { prompt: customIntent.prompt, merchantUrl: customIntent.merchantUrl } : {}) } as VerifyRequest["intent"];
  return { ...injected, intent };
}

function transactionFromLive(evaluation: PolicyEvaluation, response: SettleResponse, context: RunContext): Transaction {
  const hash = response.txHash ?? response.transaction;
  const verified = isVerifiedLiveSettlement(response, hash);
  const explorerUrl = safeExplorerUrl(response, hash);
  return { id: `LIVE-${context.idempotencyKey.slice(-8)}`, time: clock(), merchant: evaluation.merchant, resource: evaluation.resource, amount: `${evaluation.amount.toFixed(3)} USDC`, status: verified ? "settled" : "unknown", mode: "live", verified, ...(verified && hash ? { txHash: hash } : {}), ...(explorerUrl ? { explorerUrl } : {}), network: response.network ?? "未確認", ...(response.blockNumber !== undefined ? { block: String(response.blockNumber) } : {}), gasSponsored: true, requestId: response.requestId, correlationId: response.correlationId ?? context.correlationId, reason: verified ? undefined : response.errorReason ?? "Live 結算結果未知；請以後端 idempotency key 重試確認" };
}

function deniedTransaction(context: RunContext, reason: string, mode: "mock" | "live" = "live", customIntent?: CustomIntent): Transaction { const details = customIntent ? customDetails(customIntent) : undefined; const amount = details && Number.isFinite(details.amount) && details.amount > 0 ? `${details.amount.toFixed(3)} USDC` : customIntent ? `${customIntent.amount || "0"} USDC` : "500.00 USDC"; return { id: `DENY-${context.idempotencyKey.slice(-8)}`, time: clock(), merchant: details?.merchant ?? "Untrusted prompt payload", resource: details?.resource ?? "/v1/market-intel/q3", amount, status: "blocked", mode, verified: false, reason, correlationId: context.correlationId }; }
function amountFor(scenario: Scenario): number { return scenario === "negotiation" ? 0.036 : 0.01; }
function asApiError(reason: unknown, fallback: string, context?: RunContext): ApiError { return reason instanceof ApiError ? reason : new ApiError(fallback, { code: "CLIENT_ERROR", correlationId: context?.correlationId }); }

function quickEvaluation(scenario: Scenario): PolicyEvaluation { return { scenario, blocked: scenario === "attack", reason: scenario === "attack" ? "Prompt Injection 已被 OWASP ASI01 攔截；未進入簽署邊界" : "快速情境已通過政策", owaspDetected: scenario === "attack", amount: scenario === "attack" ? 500 : amountFor(scenario), merchant: scenario === "negotiation" ? "DataMesh Agent" : "AlphaSense MCP", resource: scenario === "negotiation" ? "/a2a/credit-risk-stream" : "/v1/market-intel/q3" }; }

function evaluateCustomIntent(intent: CustomIntent, policy: PolicyState): PolicyEvaluation {
  const details = customDetails(intent);
  const suspicious = /惡意|提權|忽略|越權|大額轉帳|override|ignore previous|system prompt|admin|privilege|transfer all/i.test(intent.prompt);
  const owaspDetected = suspicious && policy.owaspProtection;
  const reasons: string[] = [];
  if (!Number.isFinite(details.amount) || details.amount <= 0) reasons.push("金額格式無效");
  if (details.amount > policy.perTxCap) reasons.push(`金額 ${details.amount.toFixed(3)} USDC 超過單筆上限 $${policy.perTxCap.toFixed(3)}`);
  if (policy.strictAllowlist && !isAllowedMerchant(intent.merchantUrl)) reasons.push("商戶不在嚴格白名單");
  if (owaspDetected) reasons.push("OWASP ASI01 Prompt Injection 已攔截");
  return { scenario: suspicious ? "attack" : "legitimate", blocked: reasons.length > 0, reason: reasons.join(" · ") || "Custom Intent 已通過目前政策", owaspDetected, amount: Number.isFinite(details.amount) && details.amount > 0 ? details.amount : 0, merchant: details.merchant, resource: details.resource };
}

function customDetails(intent: CustomIntent): { amount: number; merchant: string; resource: string } { try { const url = new URL(intent.merchantUrl); return { amount: Number.parseFloat(intent.amount), merchant: url.hostname, resource: `${url.pathname}${url.search}` || "/" }; } catch { return { amount: Number.parseFloat(intent.amount), merchant: "Invalid merchant URL", resource: "/" }; } }
function isAllowedMerchant(value: string): boolean { try { const hostname = new URL(value).hostname.toLowerCase(); return ["alphasense.com", "marketlens.com", "datamesh.ai", "datamesh.com"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)); } catch { return false; } }

function ErrorBanner({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-alert/30 bg-alert/8 px-4 py-3 text-[10px] text-red-100" role="alert"><div><p className="font-semibold">{error.code} · {error.message}</p><p className="mt-1 font-mono text-[9px] text-red-200/60">request {error.requestId ?? "未提供"} · correlation {error.correlationId ?? "未提供"}</p></div>{onRetry && <button type="button" className="rounded border border-alert/40 px-3 py-1.5 font-mono text-[9px] text-alert" onClick={onRetry}>使用相同 idempotency key 重試</button>}</div>;
}
