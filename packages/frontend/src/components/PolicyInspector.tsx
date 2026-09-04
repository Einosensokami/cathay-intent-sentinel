import { Check, LockKeyhole, ShieldCheck, SlidersHorizontal } from "lucide-react";

export interface PolicyState {
  perTxCap: number;
  strictAllowlist: boolean;
  owaspProtection: boolean;
}

interface PolicyInspectorProps {
  defending: boolean;
  policy: PolicyState;
  onPolicyChange: (change: Partial<PolicyState>) => void;
}

const allowedMerchant = "AlphaSense MCP · Strict Allowlist";

export function PolicyInspector({ defending, policy, onPolicyChange }: PolicyInspectorProps) {
  const rules = [
    ["任務綁定", "TASK-Q3-092", "上下文已鎖定"],
    ["預算上限", `$${policy.perTxCap.toFixed(3)} USDC`, "單筆呼叫即時上限"],
    ["商戶", policy.strictAllowlist ? allowedMerchant : "全部商戶 · Permissive", policy.strictAllowlist ? "只允許已驗證收款方" : "放寬來源檢查"],
    ["資產／網路", "USDC · Base", "eip155:84532"],
    ["有效期限", "20 分鐘", "剩餘 18 分鐘"],
    ["頻率", "5／分鐘", "目前 1／5"],
  ];

  return <article className={`panel-card overflow-hidden ${defending ? "defending-ring" : ""}`}>
    <div className="flex items-center justify-between border-b border-line/70 px-5 py-4"><div><p className="section-kicker">Live policy gate</p><h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><SlidersHorizontal size={14} className="text-cyan" />六維政策約束</h3></div><span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald"><LockKeyhole size={13} /> FAIL-CLOSED</span></div>
    <div className="policy-controls">
      <div className="policy-control-row"><div className="flex items-start justify-between gap-3"><label htmlFor="per-tx-cap" className="text-[11px] font-medium text-slate-200">單筆預算上限 <span className="font-mono text-[9px] text-slate-600">PER-TX CAP</span></label><output htmlFor="per-tx-cap" className="font-mono text-sm font-medium text-emerald">${policy.perTxCap.toFixed(3)}</output></div><input id="per-tx-cap" className="policy-slider" type="range" min="0.001" max="5" step="0.001" value={policy.perTxCap} onChange={(event) => onPolicyChange({ perTxCap: Number(event.target.value) })} /><div className="flex justify-between font-mono text-[9px] text-slate-600"><span>$0.001</span><span>$5.00 USDC</span></div></div>
      <PolicySwitch label={policy.strictAllowlist ? "嚴格白名單 (Strict Allowlist)" : "全部商戶 (Permissive)"} description={policy.strictAllowlist ? "只允許已驗證商戶" : "允許全部商戶"} enabled={policy.strictAllowlist} onChange={() => onPolicyChange({ strictAllowlist: !policy.strictAllowlist })} />
      <PolicySwitch label="OWASP ASI 即時防護開關" description={policy.owaspProtection ? "Prompt injection 會在簽署前攔截" : "偵測器已暫停"} enabled={policy.owaspProtection} onChange={() => onPolicyChange({ owaspProtection: !policy.owaspProtection })} />
    </div>
    <div className="divide-y divide-line/55">{rules.map(([label, value, meta], index) => <div key={label} className="group grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.018]"><span className="grid h-6 w-6 place-items-center rounded-md border border-emerald/20 bg-emerald/5 font-mono text-[9px] text-emerald">0{index + 1}</span><div><p className="text-[11px] font-medium text-slate-200">{label}</p><p className="mt-0.5 font-mono text-[9px] text-slate-600">{meta}</p></div><div className="flex items-center gap-2 text-right"><span className="font-mono text-[10px] text-slate-400">{value}</span><Check size={13} strokeWidth={2.5} className="text-emerald" /></div></div>)}</div>
    <div className="border-t border-line/60 px-5 py-3 font-mono text-[9px] text-slate-600"><ShieldCheck size={11} className="mr-1 inline text-emerald" />政策變更會套用至下一次自訂 Intent 評估</div>
  </article>;
}

function PolicySwitch({ label, description, enabled, onChange }: { label: string; description: string; enabled: boolean; onChange: () => void }) {
  return <div className="policy-switch-row"><div><p className="text-[11px] font-medium text-slate-200">{label}</p><p className="mt-0.5 font-mono text-[9px] text-slate-600">{description}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`policy-switch ${enabled ? "policy-switch--on" : ""}`} onClick={onChange}><span /></button></div>;
}
