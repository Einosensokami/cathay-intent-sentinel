import { ArrowRight, Bot, CircleDollarSign, FileSearch, Handshake, Link2, OctagonX, Play, Rocket, Sparkles } from "lucide-react";
import { useState } from "react";
import type { PipelineStep, RunState, Scenario } from "../types";
import { Pipeline } from "./Pipeline";

export interface CustomIntent {
  prompt: string;
  merchantUrl: string;
  amount: string;
}

export interface LeftPanelProps { runState: RunState; activeScenario: Scenario | null; steps: PipelineStep[]; onRun: (scenario: Scenario) => void; onRunCustom: (intent: CustomIntent) => void; mode: "mock" | "live"; connection: "connected" | "connecting" | "offline"; }
const actions = [{ scenario: "legitimate" as const, icon: Play, title: "合法數據採購", meta: "0.01 USDC", className: "action-primary" }, { scenario: "attack" as const, icon: OctagonX, title: "Prompt Injection 攻擊攔截", meta: "500 USDC", className: "action-danger" }, { scenario: "negotiation" as const, icon: Handshake, title: "A2A 智慧動態議價", meta: "折扣 40%", className: "action-neutral" }];
const samples = ["晶片研報採購", "惡意提權指令", "大額轉帳測試"];

export function LeftPanel({ runState, activeScenario, steps, onRun, onRunCustom, mode, connection }: LeftPanelProps) {
  const busy = runState === "running";
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [merchantUrl, setMerchantUrl] = useState("https://alphasense.com/api/v1/market-intel");
  const [amount, setAmount] = useState("0.01");
  return <section className="space-y-4" aria-labelledby="workflow-heading">
    <div className="flex items-end justify-between"><div><p className="section-kicker">01 / Agent execution</p><h2 id="workflow-heading" className="mt-1 text-lg font-semibold tracking-tight text-white">自主工作流</h2></div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald"><span className={`live-dot ${connection === "connected" ? "bg-emerald" : "bg-amber-300"}`} /> {connection === "connected" ? "代理在線" : "等待連線"}</div></div>
    <article className="panel-card relative overflow-hidden p-5"><div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-cathay/10 blur-3xl" /><div className="relative flex items-start gap-4"><div className="rounded-xl border border-cathay/25 bg-cathay/10 p-3 text-emerald"><Bot size={22} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="tag tag--active"><Sparkles size={10} /> 進行中任務</span><span className="font-mono text-[10px] text-slate-600">TASK-Q3-092</span><span className={`mode-badge mode-badge--${mode}`}>{mode === "mock" ? "MOCK 模擬" : "LIVE 已設定"}</span></div><h3 className="mt-3 text-base font-semibold leading-snug text-white">企業第三季金融情報蒐集</h3><p className="mt-2 text-xs leading-5 text-slate-400">在每個支出邊界執行政策檢查，自治蒐集已驗證的市場情報。</p><div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-4"><Metric label="代理" value="Treasury-07" /><Metric label="任務上限" value="1.00 USDC" /><Metric label="剩餘" value="18 分鐘" /></div></div></div></article>
    <article className="challenge-card"><div className="flex items-center justify-between border-b border-amber-400/15 px-5 py-3.5"><div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/10 text-amber-300"><CircleDollarSign size={16} /></span><div><p className="text-xs font-semibold text-amber-100">402 付款要求</p><p className="font-mono text-[9px] text-amber-300/50">challenge intercepted · 等待政策判定</p></div></div><span className="rounded border border-amber-400/20 px-2 py-1 font-mono text-[9px] text-amber-300">HTTP 402</span></div><dl className="grid gap-3 px-5 py-4 text-xs sm:grid-cols-[1fr_auto]"><div><dt className="micro-label">資源</dt><dd className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-300"><FileSearch size={13} className="text-slate-500" /> /v1/market-intel/q3</dd></div><div className="sm:text-right"><dt className="micro-label">金額</dt><dd className="mt-1 font-mono text-sm font-medium text-white">0.01 USDC</dd></div><div className="sm:col-span-2"><dt className="micro-label">已驗證收款方</dt><dd className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px] text-slate-300"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" /><span className="truncate">0x7A8e...91C2 · AlphaSense MCP</span></dd></div></dl></article>
    <div className="space-y-2.5">{actions.map(({ scenario, icon: Icon, title, meta, className }) => { const isActive = busy && activeScenario === scenario; return <button key={scenario} type="button" className={`action-button ${className}`} disabled={busy} onClick={() => onRun(scenario)}><span className="flex min-w-0 items-center gap-3"><span className="action-icon"><Icon size={17} /></span><span className="truncate text-sm font-semibold">{isActive ? "政策檢查中…" : title}</span></span><span className="flex shrink-0 items-center gap-2 font-mono text-[10px] opacity-70">{meta}<ArrowRight size={14} /></span></button>; })}</div>
    <article className={`panel-card overflow-hidden ${playgroundOpen ? "playground-card--open" : ""}`}>
      <button type="button" className="playground-toggle" aria-expanded={playgroundOpen} onClick={() => setPlaygroundOpen((open) => !open)}>
        <span className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan/20 bg-cyan/5 text-cyan"><Rocket size={15} /></span><span className="text-left"><span className="block text-xs font-semibold text-white">自訂 Agent 任務測試 (Custom Intent Playground)</span><span className="mt-0.5 block font-mono text-[9px] text-slate-500">即時政策模擬 · 可輸入任意 Agent payload</span></span></span>
        <span className="font-mono text-[10px] text-cyan">{playgroundOpen ? "收合 ↑" : "展開 ↓"}</span>
      </button>
      {playgroundOpen && <form className="space-y-4 border-t border-line/70 px-5 py-4" onSubmit={(event) => { event.preventDefault(); onRunCustom({ prompt: prompt.trim(), merchantUrl: merchantUrl.trim(), amount: amount.trim() }); }}>
        <div><label className="input-label" htmlFor="custom-prompt">Custom Task / Prompt</label><textarea id="custom-prompt" className="control-input min-h-20 resize-y" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述 Agent 要完成的任務…" required /></div>
        <div className="sample-chips" aria-label="快速範例">{samples.map((sample) => <button key={sample} type="button" className="sample-chip" onClick={() => setPrompt(sample)}>{sample}</button>)}</div>
        <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><div><label className="input-label" htmlFor="merchant-url"><Link2 size={11} /> 商戶 URL</label><input id="merchant-url" className="control-input" type="url" value={merchantUrl} onChange={(event) => setMerchantUrl(event.target.value)} placeholder="https://merchant.example/api" required /></div><div><label className="input-label" htmlFor="custom-amount">金額 <span>(USDC)</span></label><input id="custom-amount" className="control-input font-mono" type="number" min="0.001" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.01" required /></div></div>
        <button type="submit" className="custom-run-button" disabled={busy}><Rocket size={15} />{busy ? "Agent 正在執行…" : "🚀 讓 Agent 發起自訂 Intent 支付"}</button>
        <p className="font-mono text-[9px] leading-4 text-slate-600">提交後會依右側 CFO 政策即時檢查金額、商戶白名單與 OWASP ASI 防護。</p>
      </form>}
    </article>
    <Pipeline steps={steps} />
  </section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="micro-label">{label}</dt><dd className="mt-1 truncate font-mono text-[10px] text-slate-300">{value}</dd></div>; }
