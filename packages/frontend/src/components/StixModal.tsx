import { CheckCircle2, Copy, Fingerprint } from "lucide-react";
import type { ThreatRecord } from "../types";
import { Modal } from "./Modal";

export interface StixModalProps { threat: ThreatRecord | null; onClose: () => void; }

export function StixModal({ threat, onClose }: StixModalProps) {
  return (
    <Modal open={Boolean(threat)} onClose={onClose} eyebrow="Threat intelligence evidence" title="STIX 2.1 inspection">
      {threat && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3"><EvidenceCell label="Classification" value="OWASP ASI01" /><EvidenceCell label="Confidence" value="99 / 100" /><EvidenceCell label="Disposition" value="Blocked locally" success /></div>
        <div className="rounded-xl border border-line bg-[#080d16] p-4">
          <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Fingerprint size={13} /> Sanitized evidence bundle</span><button type="button" className="audit-link" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(threat.stix, null, 2))}>Copy JSON <Copy size={10} /></button></div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-5 text-slate-400">{JSON.stringify(threat.stix, null, 2)}</pre>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-emerald/15 bg-emerald/5 p-3 text-[10px] leading-4 text-slate-400"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald" />No raw prompt, secret, signature, or authorization payload is included. The original evidence remains quarantined inside the policy boundary.</div>
      </div>}
    </Modal>
  );
}

function EvidenceCell({ label, value, success }: { label: string; value: string; success?: boolean }) { return <div className="rounded-lg border border-line bg-white/[0.018] p-3"><p className="micro-label">{label}</p><p className={`mt-1.5 font-mono text-xs ${success ? "text-emerald" : "text-slate-200"}`}>{value}</p></div>; }
