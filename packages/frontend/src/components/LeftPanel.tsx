import { ArrowRight, Bot, CircleDollarSign, FileSearch, Handshake, OctagonX, Play, Sparkles } from "lucide-react";
import type { PipelineStep, RunState, Scenario } from "../types";
import { ExecutionConsole } from "./ExecutionConsole";
import { Pipeline } from "./Pipeline";

export interface LeftPanelProps {
  runState: RunState;
  activeScenario: Scenario | null;
  steps: PipelineStep[];
  onRun: (scenario: Scenario) => void;
  mode: "mock" | "live";
  connection: "connected" | "connecting" | "offline";
  correlationId: string | null;
}

const actions = [
  { scenario: "legitimate" as const, icon: Play, title: "合法數據採購", description: "合規 x402 支付與資源解鎖", meta: "0.01 USDC", tone: "primary" },
  { scenario: "attack" as const, icon: OctagonX, title: "Prompt Injection 攻擊", description: "在 custody boundary 前攔截", meta: "500 USDC", tone: "danger" },
  { scenario: "negotiation" as const, icon: Handshake, title: "A2A 智慧動態議價", description: "驗證信譽、SLA 與折扣結算", meta: "折扣 40%", tone: "neutral" },
];

export function LeftPanel({ runState, activeScenario, steps, onRun, mode, connection, correlationId }: LeftPanelProps) {
  const busy = runState === "running";
  return <section className="live-workflow" aria-labelledby="workflow-heading">
    <div className="section-heading"><div><p className="section-kicker">Agent execution</p><h2 id="workflow-heading">情境啟動與支付管線</h2></div><div className={`connection-label connection-label--${connection}`}><span />{connection === "connected" ? "代理在線" : connection === "connecting" ? "連線中" : "離線"}</div></div>
    <article className="panel-card task-card-new"><div className="task-card-new__icon"><Bot size={22} /></div><div className="task-card-new__body"><div className="task-meta-row"><span className="tag tag--active"><Sparkles size={10} /> ACTIVE TASK</span><code>TASK-Q3-092</code><span className={`mode-badge mode-badge--${mode}`}>{mode === "mock" ? "MOCK" : "LIVE"}</span></div><h3>企業第三季金融情報蒐集</h3><p>代理只能提出付款意圖；政策通過後，隔離金庫才會建立精確授權。</p><dl className="task-metrics"><Metric label="代理" value="Treasury-07" /><Metric label="任務上限" value="1.00 USDC" /><Metric label="剩餘" value="18 分鐘" /></dl></div></article>
    <article className="challenge-card"><div className="challenge-card__header"><div><span><CircleDollarSign size={17} /></span><div><p>402 付款要求</p><small>challenge intercepted · 等待政策判定</small></div></div><strong>HTTP 402</strong></div><dl className="challenge-details"><div><dt>資源</dt><dd><FileSearch size={13} />/v1/market-intel/q3</dd></div><div><dt>金額</dt><dd>0.01 USDC</dd></div><div><dt>已驗證收款方</dt><dd><i />0x7A8e...91C2 · AlphaSense MCP</dd></div></dl></article>
    <div className="scenario-grid" aria-label="快速情境">{actions.map(({ scenario, icon: Icon, title, description, meta, tone }) => { const isActive = busy && activeScenario === scenario; return <button key={scenario} type="button" className={`scenario-launch scenario-launch--${tone}`} disabled={busy} onClick={() => onRun(scenario)}><span className="scenario-launch__icon"><Icon size={18} /></span><span className="scenario-launch__copy"><strong>{isActive ? "政策檢查中…" : title}</strong><small>{description}</small></span><span className="scenario-launch__meta">{meta}<ArrowRight size={14} /></span></button>; })}</div>
    <Pipeline steps={steps} />
    <ExecutionConsole steps={steps} runState={runState} scenario={activeScenario} correlationId={correlationId} />
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
