import { Check, ShieldX } from "lucide-react";
import type { PipelineStep } from "../types";

export function Pipeline({ steps, compact = false }: { steps: PipelineStep[]; compact?: boolean }) {
  const content = <div className={`pipeline-grid ${compact ? "pipeline-grid--compact" : ""}`}>{steps.map((step, index) => <div key={step.id} className="pipeline-item"><div className={`pipeline-node pipeline-node--${step.state}`} aria-current={step.state === "active" ? "step" : undefined}>{step.state === "complete" ? <Check size={13} strokeWidth={3} /> : step.state === "blocked" || step.state === "error" ? <ShieldX size={14} /> : <span>{step.id}</span>}</div>{index < steps.length - 1 && <span className={`pipeline-line ${step.state === "complete" ? "pipeline-line--complete" : ""}`} />}<span className={`pipeline-short pipeline-short--${step.state}`}>{step.shortLabel}</span>{!compact && <span className="pipeline-label">{step.label}</span>}</div>)}</div>;
  if (compact) return <div className="compact-pipeline" aria-label="付款流程">{content}</div>;
  return <section className="panel-card pipeline-card" aria-label="付款流程"><div className="pipeline-card__heading"><div><p className="section-kicker">Execution trace</p><h3>8-Step Intent Payment Pipeline</h3></div><span>x402 v2 / ERC-3009</span></div>{content}</section>;
}
