import { Check, ShieldX } from "lucide-react";
import type { PipelineStep } from "../types";

export function Pipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <section className="panel-card overflow-hidden p-5" aria-label="Payment pipeline">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="section-kicker">Execution trace</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Policy-bounded payment pipeline</h3>
        </div>
        <span className="font-mono text-[10px] text-slate-500">x402 v2 / ERC-3009</span>
      </div>
      <div className="pipeline-grid">
        {steps.map((step, index) => (
          <div key={step.id} className="pipeline-item">
            <div className={`pipeline-node pipeline-node--${step.state}`} aria-current={step.state === "active" ? "step" : undefined}>
              {step.state === "complete" ? <Check size={13} strokeWidth={3} /> : step.state === "blocked" ? <ShieldX size={14} /> : <span>{step.id}</span>}
            </div>
            {index < steps.length - 1 && <span className={`pipeline-line ${step.state === "complete" ? "pipeline-line--complete" : ""}`} />}
            <span className={`mt-2 font-mono text-[9px] font-medium ${step.state === "active" ? "text-emerald" : step.state === "blocked" ? "text-alert" : "text-slate-500"}`}>{step.shortLabel}</span>
            <span className="mt-0.5 hidden max-w-[76px] text-center text-[9px] leading-tight text-slate-600 xl:block">{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
