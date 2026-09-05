import { useCallback, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Check, CircleDollarSign, CloudLightning, Database, Eye, Fingerprint, Gauge, LockKeyhole, Play, Send, ShieldCheck, Sparkles, Terminal, X } from "lucide-react";
import type { PipelineStep, StepState } from "../types";
import { PIPELINE_TEMPLATE } from "../data";

type ProductId = "vip" | "honeypot" | "weather";
type ProductState = "idle" | "running" | "settled" | "blocked";

interface Product {
  id: ProductId;
  icon: string;
  name: string;
  subtitle: string;
  endpoint: string;
  price: string;
  priceNumber: number;
  scheme: string;
  payee: string;
  description: string;
  accent: "violet" | "red" | "cyan";
  action: string;
  resultAction?: string;
}

interface TelemetryEntry {
  id: number;
  time: string;
  step: string;
  message: string;
  tone: "info" | "success" | "danger" | "warning";
}

interface MarketplaceViewProps {
  balance: number;
  spent: number;
  owaspActive: boolean;
  stixAlerts: number;
  onSettled?: (amount: number) => void;
  onRiskStateChange?: (blocked: boolean) => void;
}

const products: Product[] = [
  {
    id: "vip", icon: "💎", name: "VIP Threat Intelligence", subtitle: "Premium analyst-grade signal pack", endpoint: "/api/vip-threat-intel", price: "0.01 USDC", priceNumber: 0.01, scheme: "exact", payee: "Allowed Payee", accent: "violet",
    description: "最新勒索軟體家族、CVE 關聯圖與可直接匯入 SOC 的優先級研報。",
    action: "採購研報", resultAction: "檢視解鎖數據",
  },
  {
    id: "honeypot", icon: "🕳️", name: "Malicious Honeypot Drain", subtitle: "Adversarial x402 payment challenge", endpoint: "/api/honeypot-drain", price: "500 USDC", priceNumber: 500, scheme: "exact", payee: "Unknown Payee", accent: "red",
    description: "故意帶有未授權收款地址與惡意代理指令，驗證政策閘門是否 fail-closed。",
    action: "模擬攻擊", resultAction: "檢視 STIX 2.1 情資",
  },
  {
    id: "weather", icon: "⚡", name: "Weather Micro-feed", subtitle: "Low-latency sensor stream", endpoint: "/api/weather-feed", price: "0.0001 USDC", priceNumber: 0.0001, scheme: "high-frequency", payee: "Stream Payee", accent: "cyan",
    description: "每秒更新的氣象微型資料流，展示高頻、小額與可觀測的代理採購模式。",
    action: "啟動微型串流", resultAction: "檢視串流數據",
  },
];

const initialSteps = (): PipelineStep[] => PIPELINE_TEMPLATE.map((step) => ({ ...step }));
const clock = () => new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
const pause = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

export function MarketplaceView({ balance, spent, owaspActive, stixAlerts, onSettled, onRiskStateChange }: MarketplaceViewProps) {
  const [prompt, setPrompt] = useState("");
  const [states, setStates] = useState<Record<ProductId, ProductState>>({ vip: "idle", honeypot: "idle", weather: "idle" });
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([
    { id: 1, time: clock(), step: "SYSTEM", message: "x402 market connected · waiting for agent intent", tone: "info" },
    { id: 2, time: clock(), step: "GUARD", message: `${owaspActive ? "OWASP defenses armed" : "OWASP defenses in monitor mode"} · STIX 2.1 feed synced`, tone: "success" },
  ]);
  const [activeProduct, setActiveProduct] = useState<ProductId | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductId | null>(null);
  const [lastOutcome, setLastOutcome] = useState<ProductId | null>(null);
  const runRef = useRef(0);
  const runningRef = useRef(false);

  const updateStep = useCallback((index: number, state: StepState) => {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, state } : step));
  }, []);

  const log = useCallback((step: string, message: string, tone: TelemetryEntry["tone"]) => {
    setTelemetry((current) => [{ id: Date.now() + Math.random(), time: clock(), step, message, tone }, ...current].slice(0, 7));
  }, []);

  const runProduct = useCallback(async (productId: ProductId, sourcePrompt?: string) => {
    if (runningRef.current) return;
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    runningRef.current = true;
    const token = ++runRef.current;
    const blocked = productId === "honeypot";
    setPrompt(sourcePrompt ?? prompt);
    setActiveProduct(productId);
    setSelectedProduct(null);
    setLastOutcome(null);
    onRiskStateChange?.(false);
    setStates((current) => ({ ...current, [productId]: "running" }));
    setSteps(initialSteps());
    log("INTENT", `${(sourcePrompt ?? prompt) || product.action} → ${product.endpoint}`, "info");

    for (let index = 0; index < 8; index += 1) {
      if (runRef.current !== token) { runningRef.current = false; return; }
      updateStep(index, "active");
      log(PIPELINE_TEMPLATE[index].shortLabel, `${PIPELINE_TEMPLATE[index].label} · processing`, "info");
      await pause(index === 3 ? 300 : 180);
      if (runRef.current !== token) { runningRef.current = false; return; }
      if (blocked && index === 3) {
        updateStep(index, "blocked");
        setStates((current) => ({ ...current, [productId]: "blocked" }));
        setLastOutcome(productId);
        onRiskStateChange?.(true);
        log("POL", "BLOCKED · unknown payee + 500 USDC drain attempt", "danger");
        log("STIX", "bundle--e9275a8a · ASI01 Prompt Injection attached", "danger");
        setActiveProduct(null);
        runningRef.current = false;
        return;
      }
      updateStep(index, "complete");
      log(PIPELINE_TEMPLATE[index].shortLabel, `${PIPELINE_TEMPLATE[index].label} · complete`, index === 7 ? "success" : "info");
    }
    setStates((current) => ({ ...current, [productId]: "settled" }));
    setLastOutcome(productId);
    setSelectedProduct(productId);
    onRiskStateChange?.(false);
    onSettled?.(product.priceNumber);
    log("SET", `SETTLED · ${product.price} · resource unlocked`, "success");
    setActiveProduct(null);
    runningRef.current = false;
  }, [log, onRiskStateChange, onSettled, prompt, updateStep]);

  const submitPrompt = useCallback(() => {
    const value = prompt.trim();
    if (!value || runningRef.current) return;
    const lower = value.toLowerCase();
    const productId: ProductId = /weather|氣象|微型串流|feed/.test(lower) ? "weather" : /500|未授權|攻擊|drain|轉帳|unknown payee/.test(lower) ? "honeypot" : "vip";
    void runProduct(productId, value);
  }, [prompt, runProduct]);

  const statusLabel = (state: ProductState) => state === "running" ? "RUNNING PIPELINE" : state === "settled" ? "SETTLED" : state === "blocked" ? "BLOCKED" : "AVAILABLE";
  const remaining = Math.max(0, balance);
  const usage = Math.min(100, (spent / (spent + remaining)) * 100);
  const selected = products.find((product) => product.id === selectedProduct);

  return <div className="marketplace-view">
    <section className="marketplace-hero">
      <div className="marketplace-hero__copy">
        <div className="marketplace-eyebrow"><span className="marketplace-live-dot" /> LIVE x402 MARKET <span className="marketplace-eyebrow__slash">/</span> AGENT COMMERCE</div>
        <h1>虛擬數據市集<span>，</span><br /><em>每一次支付都可被驗證。</em></h1>
        <p>讓代理以自然語言探索資料產品。IntentSentinel 會在付款前綁定意圖、檢查收款方，並把每個決策寫入可追溯的遙測流。</p>
        <div className="marketplace-hero__meta"><span><RadioIcon /> Base Sepolia · 84532</span><span><LockKeyhole size={12} /> fail-closed policy</span><span><Sparkles size={12} /> x402 ready</span></div>
      </div>
      <div className="marketplace-orbit" aria-hidden="true"><div className="marketplace-orbit__ring marketplace-orbit__ring--one" /><div className="marketplace-orbit__ring marketplace-orbit__ring--two" /><div className="marketplace-orbit__core"><StoreGlyph /><small>DATA<br />MESH</small></div><span className="marketplace-orbit__node marketplace-orbit__node--one">402</span><span className="marketplace-orbit__node marketplace-orbit__node--two">USDC</span><span className="marketplace-orbit__node marketplace-orbit__node--three">STIX</span></div>
    </section>

    <section className="marketplace-risk-bar" aria-label="Treasury and risk status">
      <div className="marketplace-risk-heading"><div className="marketplace-risk-icon"><Gauge size={17} /></div><div><p className="marketplace-kicker">Treasury &amp; risk status</p><strong>GUARDRAIL MONITOR</strong></div><span className="marketplace-status-pill"><span /> ARMED</span></div>
      <div className="marketplace-stat"><span>Remaining budget</span><strong>${remaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small> USDC</small></strong><div className="marketplace-mini-meter"><i style={{ width: `${100 - usage}%` }} /></div></div>
      <div className="marketplace-stat"><span>Spent this session</span><strong>${spent.toFixed(4)}<small> USDC</small></strong><em>{usage.toFixed(2)}% utilized</em></div>
      <div className="marketplace-stat marketplace-stat--defense"><span>OWASP defenses</span><strong><ShieldCheck size={18} /> {owaspActive ? "ACTIVE" : "MONITOR"}</strong><em>ASI01 · ASI02 · ASI10</em></div>
      <div className="marketplace-stat"><span>STIX 2.1 alerts</span><strong className={lastOutcome === "honeypot" ? "marketplace-red-text" : ""}>{stixAlerts.toString().padStart(2, "0")}<small> EVENTS</small></strong><em className="marketplace-alert-copy">{lastOutcome === "honeypot" ? "1 new · just now" : "feed synchronized"}</em></div>
    </section>

    <div className="marketplace-section-heading"><div><p className="marketplace-kicker">Open data products</p><h2>即時資料產品 <span>· 3 LIVE LISTINGS</span></h2></div><div className="marketplace-feed-indicator"><span /> MARKET FEED 240ms <ArrowUpRight size={13} /></div></div>
    <section className="marketplace-product-grid" aria-label="Live data products">
      {products.map((product) => <ProductCard key={product.id} product={product} state={states[product.id]} isActive={activeProduct === product.id} isOutcome={lastOutcome === product.id} onRun={() => void runProduct(product.id)} onView={() => setSelectedProduct(product.id)} />)}
    </section>

    <section className="marketplace-workbench">
      <div className="marketplace-pipeline-panel"><div className="marketplace-panel-heading"><div><p className="marketplace-kicker">Live execution trace</p><h3>8-step settlement pipeline</h3></div><span className="marketplace-correlation"><Fingerprint size={12} /> {activeProduct ? `RUN-${activeProduct.toUpperCase()} / LIVE` : "READY / AWAITING INTENT"}</span></div><div className="marketplace-pipeline" aria-label="Eight step payment pipeline">{steps.map((step, index) => <div key={step.id} className={`marketplace-pipeline-step marketplace-pipeline-step--${step.state}`}><div className="marketplace-pipeline-connector" /><div className="marketplace-pipeline-dot">{step.state === "complete" ? <Check size={13} /> : step.state === "blocked" ? <X size={13} /> : step.id}</div><strong>{step.shortLabel}</strong><small>{step.label}</small></div>)}</div><div className="marketplace-pipeline-caption"><span><i className="marketplace-legend-dot marketplace-legend-dot--active" /> active</span><span><i className="marketplace-legend-dot marketplace-legend-dot--complete" /> verified</span><span><i className="marketplace-legend-dot marketplace-legend-dot--blocked" /> blocked</span><span className="marketplace-pipeline-version">ERC-3009 · x402 v2</span></div></div>
      <div className="marketplace-telemetry-panel"><div className="marketplace-panel-heading"><div><p className="marketplace-kicker">Observability stream</p><h3><Terminal size={15} /> Live telemetry</h3></div><span className="marketplace-streaming"><span /> STREAMING</span></div><div className="marketplace-telemetry-log" aria-live="polite">{telemetry.map((entry) => <div className="marketplace-log-line" data-tone={entry.tone} key={entry.id}><time>{entry.time}</time><b>{entry.step}</b><span>{entry.message}</span></div>)}</div></div>
    </section>

    {selected && <section className={`marketplace-detail-drawer marketplace-detail-drawer--${selected.accent}`}><div><p className="marketplace-kicker">{selected.id === "honeypot" ? "STIX 2.1 intelligence" : "Verified resource preview"}</p><h3>{selected.id === "honeypot" ? "ASI01 Prompt Injection · Payment redirected" : `${selected.name} · unlocked payload`}</h3></div><button type="button" onClick={() => setSelectedProduct(null)} aria-label="Close resource preview"><X size={17} /></button><pre>{JSON.stringify(selected.id === "honeypot" ? { type: "bundle", spec_version: "2.1", id: "bundle--e9275a8a-1254-593c-8437-279787efb43d", objects: [{ type: "indicator", name: "OWASP ASI01 Prompt Injection", confidence: 99, labels: ["intent-sentinel", "prompt-injection", "payment-redirection"] }] } : { resource: selected.endpoint, status: "unlocked", settlement: "verified", content: selected.id === "weather" ? "taipei: 27.4C · humidity: 71% · wind: NE" : "CVE-2026-4412 · ransomware cluster · priority: critical" }, null, 2)}</pre></section>}

    <section className="marketplace-prompt-panel"><div className="marketplace-prompt-heading"><div className="marketplace-prompt-icon"><Send size={18} /></div><div><p className="marketplace-kicker">Agent prompt input</p><h2>告訴代理你想採購什麼</h2><p>自然語言 → 受約束的 x402 intent → 可驗證結算</p></div><span className="marketplace-intent-badge"><span /> INTENT BOUND</span></div><div className="marketplace-prompt-editor"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitPrompt(); }} placeholder="例如：幫我安全採購最新資安研報" aria-label="Agent prompt" /><button type="button" onClick={submitPrompt} disabled={!prompt.trim() || Boolean(activeProduct)}><Play size={15} fill="currentColor" /> {activeProduct ? "PIPELINE RUNNING" : "執行 Agent Intent"}<span>⌘ ↵</span></button></div><div className="marketplace-presets"><span>QUICK PRESETS</span><button type="button" onClick={() => { setPrompt("幫我安全採購最新資安研報"); void runProduct("vip", "幫我安全採購最新資安研報"); }} disabled={Boolean(activeProduct)}>💎 安全採購研報</button><button type="button" onClick={() => { setPrompt("嘗試向未授權地址轉帳 500 USDC"); void runProduct("honeypot", "嘗試向未授權地址轉帳 500 USDC"); }} disabled={Boolean(activeProduct)}>🛡️ 測試防禦閘門</button><button type="button" onClick={() => { setPrompt("訂閱台北的高頻天氣微型資料流"); void runProduct("weather", "訂閱台北的高頻天氣微型資料流"); }} disabled={Boolean(activeProduct)}>⚡ 啟動高頻串流</button></div></section>
  </div>;
}

function ProductCard({ product, state, isActive, isOutcome, onRun, onView }: { product: Product; state: ProductState; isActive: boolean; isOutcome: boolean; onRun: () => void; onView: () => void }) {
  const toneClass = `marketplace-product-card--${product.accent}`;
  const resultClass = isOutcome && state === "settled" ? " marketplace-product-card--flash-success" : isOutcome && state === "blocked" ? " marketplace-product-card--flash-blocked" : "";
  return <article className={`marketplace-product-card ${toneClass}${resultClass}${isActive ? " marketplace-product-card--running" : ""}`}>
    <div className="marketplace-card-glow" />
    <div className="marketplace-product-card__top"><span className="marketplace-product-icon">{product.icon}</span><div className="marketplace-product-card__title"><span className={`marketplace-product-status marketplace-product-status--${state}`}><i /> {statusLabel(state)}</span><h3>{product.name}</h3><p>{product.subtitle}</p></div><button type="button" className="marketplace-card-more" aria-label={`Inspect ${product.name}`} onClick={onView}><Eye size={15} /></button></div>
    <p className="marketplace-product-description">{product.description}</p>
    <div className="marketplace-product-endpoint"><code>{product.endpoint}</code><span>{product.id === "weather" ? "STREAM" : "402"}</span></div>
    <div className="marketplace-product-specs"><div><span>PRICE</span><strong>{product.price}</strong></div><div><span>SCHEME</span><strong>{product.scheme}</strong></div><div><span>PAYEE</span><strong className={product.payee === "Unknown Payee" ? "marketplace-red-text" : ""}>{product.payee}</strong></div></div>
    <button type="button" className="marketplace-product-action" onClick={onRun} disabled={isActive}><span>{product.id === "honeypot" ? <AlertTriangle size={15} /> : product.id === "weather" ? <CloudLightning size={15} /> : <CircleDollarSign size={15} />}</span>{isActive ? "正在執行 8-step pipeline..." : product.action}<ArrowUpRight size={14} /></button>
    {state === "settled" && product.resultAction && <button type="button" className="marketplace-product-result marketplace-product-result--success" onClick={onView}><Check size={13} /> {product.resultAction}</button>}
    {state === "blocked" && product.resultAction && <button type="button" className="marketplace-product-result marketplace-product-result--blocked" onClick={onView}><AlertTriangle size={13} /> {product.resultAction}</button>}
  </article>;
}

function statusLabel(state: ProductState) { return state === "running" ? "RUNNING PIPELINE" : state === "settled" ? "SETTLED" : state === "blocked" ? "BLOCKED" : "AVAILABLE"; }
function RadioIcon() { return <span className="marketplace-radio-icon"><span /></span>; }
function StoreGlyph() { return <Database size={26} strokeWidth={1.4} />; }
