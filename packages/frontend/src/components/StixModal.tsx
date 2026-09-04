import { CheckCircle2, Copy, Fingerprint } from "lucide-react";
import type { ThreatRecord } from "../types";
import { Modal } from "./Modal";

export interface StixModalProps { threat: ThreatRecord | null; onClose: () => void; }

export function StixModal({ threat, onClose }: StixModalProps) {
  return (
    <Modal open={Boolean(threat)} onClose={onClose} eyebrow="威脅情報證據" title="STIX 2.1 檢視">
      {threat && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3"><EvidenceCell label="分類" value="OWASP ASI01" /><EvidenceCell label="信心度" value="99 / 100" /><EvidenceCell label="處置" value="本地封鎖" success /></div>
        <div className="rounded-xl border border-line bg-[#080d16] p-4">
          <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Fingerprint size={13} /> 已清理證據包</span><button type="button" className="audit-link" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(threat.stix, null, 2))}>複製 JSON <Copy size={10} /></button></div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-5 text-slate-400">{JSON.stringify(threat.stix, null, 2)}</pre>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-emerald/15 bg-emerald/5 p-3 text-[10px] leading-4 text-slate-400"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald" />不包含原始 prompt、secret、signature 或 authorization payload；原始證據仍隔離於政策邊界內。</div>
      </div>}
    </Modal>
  );
}

function EvidenceCell({ label, value, success }: { label: string; value: string; success?: boolean }) { return <div className="rounded-lg border border-line bg-white/[0.018] p-3"><p className="micro-label">{label}</p><p className={`mt-1.5 font-mono text-xs ${success ? "text-emerald" : "text-slate-200"}`}>{value}</p></div>; }
