import { TerminalSquare } from "lucide-react";
import type { PipelineStep, RunState, Scenario } from "../types";

export function ExecutionConsole({ steps, runState, scenario, correlationId }: { steps: PipelineStep[]; runState: RunState; scenario: Scenario | null; correlationId: string | null }) {
  const active = steps.filter((step) => step.state !== "waiting");
  return <article className="panel-card execution-console">
    <div className="console-header"><div><span className="console-lights"><i /><i /><i /></span><span><TerminalSquare size={13} /> Live execution console</span></div><strong>{runState.toUpperCase()}</strong></div>
    <div className="execution-console__body" aria-live="polite">
      <ConsoleLine level="system" message="Sentinel transport online · policy boundary armed" />
      {scenario && <ConsoleLine level="intent" message={`Scenario selected · ${scenario}`} />}
      {correlationId && <ConsoleLine level="trace" message={`correlation_id=${correlationId}`} />}
      {active.map((step) => <ConsoleLine key={`${step.id}-${step.state}`} level={step.state === "blocked" || step.state === "error" ? "deny" : step.state === "complete" ? "pass" : "run"} message={`${String(step.id).padStart(2, "0")} ${step.label} · ${step.state}`} />)}
      {!scenario && <ConsoleLine level="ready" message="Awaiting operator scenario or playground intent…" />}
    </div>
  </article>;
}

function ConsoleLine({ level, message }: { level: string; message: string }) {
  const time = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
  return <div className={`execution-line execution-line--${level}`}><time>{time}</time><span>{level}</span><p>{message}</p></div>;
}
