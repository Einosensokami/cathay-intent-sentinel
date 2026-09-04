import { ArrowRight, Fingerprint, ShieldAlert } from "lucide-react";
import type { ThreatRecord } from "../types";

export function ThreatPanel({ threat, onInspect }: { threat: ThreatRecord | null; onInspect: (threat: ThreatRecord) => void }) {
  if (!threat) {
    return (
      <article className="panel-card flex items-center gap-4 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald/20 bg-emerald/5 text-emerald"><Fingerprint size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-200">Threat defense standing by</p>
          <p className="mt-1 text-[10px] text-slate-500">All policy dimensions nominal. Evidence capture is armed.</p>
        </div>
        <span className="tag tag--active">Protected</span>
      </article>
    );
  }

  return (
    <article className="threat-card" role="alert">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-alert/15 text-alert ring-1 ring-inset ring-alert/25"><ShieldAlert size={21} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold text-red-100">{threat.title}</p>
            <span className="rounded bg-alert/15 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-alert">OWASP ASI01</span>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-red-200/55">{threat.description}</p>
          <button type="button" className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-alert transition-colors hover:text-red-300" onClick={() => onInspect(threat)}>
            Inspect STIX 2.1 evidence <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}
