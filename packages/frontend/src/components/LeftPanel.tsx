import { ArrowRight, Bot, CircleDollarSign, FileSearch, Handshake, OctagonX, Play, Sparkles } from "lucide-react";
import type { PipelineStep, RunState, Scenario } from "../types";
import { Pipeline } from "./Pipeline";

export interface LeftPanelProps { runState: RunState; activeScenario: Scenario | null; steps: PipelineStep[]; onRun: (scenario: Scenario) => void; }

const actions = [
  { scenario: "legitimate" as const, icon: Play, title: "Run legitimate purchase", meta: "0.01 USDC", className: "action-primary" },
  { scenario: "attack" as const, icon: OctagonX, title: "Simulate prompt injection", meta: "500 USDC", className: "action-danger" },
  { scenario: "negotiation" as const, icon: Handshake, title: "Simulate A2A negotiation", meta: "40% discount", className: "action-neutral" },
];

export function LeftPanel({ runState, activeScenario, steps, onRun }: LeftPanelProps) {
  const busy = runState === "running";
  return (
    <section className="space-y-4" aria-labelledby="workflow-heading">
      <div className="flex items-end justify-between"><div><p className="section-kicker">01 / Agent execution</p><h2 id="workflow-heading" className="mt-1 text-lg font-semibold tracking-tight text-white">Autonomous workflow</h2></div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald"><span className="live-dot bg-emerald" /> Agent online</div></div>
      <article className="panel-card relative overflow-hidden p-5">
        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-cathay/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="rounded-xl border border-cathay/25 bg-cathay/10 p-3 text-emerald"><Bot size={22} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className="tag tag--active"><Sparkles size={10} /> Active task</span><span className="font-mono text-[10px] text-slate-600">TASK-Q3-092</span></div>
            <h3 className="mt-3 text-base font-semibold leading-snug text-white">Enterprise Q3 Financial Intel Collection</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">Autonomously source verified market intelligence while enforcing treasury policy at every spend boundary.</p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/70 pt-4"><Metric label="Agent" value="Treasury-07" /><Metric label="Task cap" value="1.00 USDC" /><Metric label="Expires" value="in 18m" /></div>
          </div>
        </div>
      </article>
      <article className="challenge-card">
        <div className="flex items-center justify-between border-b border-amber-400/15 px-5 py-3.5">
          <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/10 text-amber-300"><CircleDollarSign size={16} /></span><div><p className="text-xs font-semibold text-amber-100">402 Payment Required</p><p className="font-mono text-[9px] text-amber-300/50">challenge intercepted · awaiting policy</p></div></div>
          <span className="rounded border border-amber-400/20 px-2 py-1 font-mono text-[9px] text-amber-300">HTTP 402</span>
        </div>
        <dl className="grid gap-3 px-5 py-4 text-xs sm:grid-cols-[1fr_auto]">
          <div><dt className="micro-label">Resource</dt><dd className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-300"><FileSearch size={13} className="text-slate-500" /> /v1/market-intel/q3</dd></div>
          <div className="sm:text-right"><dt className="micro-label">Amount</dt><dd className="mt-1 font-mono text-sm font-medium text-white">0.01 USDC</dd></div>
          <div className="sm:col-span-2"><dt className="micro-label">Verified payee</dt><dd className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11px] text-slate-300"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" /><span className="truncate">0x7A8e...91C2 · AlphaSense MCP</span></dd></div>
        </dl>
      </article>
      <div className="space-y-2.5">
        {actions.map(({ scenario, icon: Icon, title, meta, className }) => {
          const isActive = busy && activeScenario === scenario;
          return <button key={scenario} type="button" className={`action-button ${className}`} disabled={busy} onClick={() => onRun(scenario)}><span className="flex min-w-0 items-center gap-3"><span className="action-icon"><Icon size={17} /></span><span className="truncate text-sm font-semibold">{isActive ? "Running policy checks…" : title}</span></span><span className="flex shrink-0 items-center gap-2 font-mono text-[10px] opacity-70">{meta}<ArrowRight size={14} /></span></button>;
        })}
      </div>
      <Pipeline steps={steps} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="micro-label">{label}</dt><dd className="mt-1 truncate font-mono text-[10px] text-slate-300">{value}</dd></div>; }
