import { Check, LockKeyhole, ShieldCheck, SlidersHorizontal } from "lucide-react";

export type OwaspDefenseLevel = "standard" | "strict" | "maximum";

export interface PolicyState {
  perTxCap: number;
  strictAllowlist: boolean;
  owaspProtection: boolean;
  owaspLevel: OwaspDefenseLevel;
}

interface PolicyInspectorProps {
  defending: boolean;
  policy: PolicyState;
  onPolicyChange: (change: Partial<PolicyState>) => void;
}

const defenseLevels: { value: OwaspDefenseLevel; label: string; detail: string }[] = [
  { value: "standard", label: "Standard", detail: "基礎注入樣式" },
  { value: "strict", label: "Strict", detail: "語意與提權偵測" },
  { value: "maximum", label: "Maximum", detail: "高敏感零信任" },
];

export function PolicyInspector({ defending, policy, onPolicyChange }: PolicyInspectorProps) {
  const rules = [
    ["任務綁定", "TASK-Q3-092", "資源與任務目標一致"],
    ["支出上限", `$${policy.perTxCap.toFixed(3)} USDC`, "單筆不得超過動態上限"],
    ["商戶白名單", policy.strictAllowlist ? "Strict Allowlist" : "Permissive", policy.strictAllowlist ? "僅允許核准網域" : "允許任何合法 URL"],
    ["資產與網路", "USDC · Base", "eip155:84532"],
    ["授權有效期", "20 分鐘", "剩餘 18 分鐘"],
    ["交易速率", "5 筆／分鐘", "目前 1 筆"],
  ];

  return <article className={`panel-card policy-room ${defending ? "defending-ring" : ""}`}>
    <div className="policy-room__header">
      <div>
        <p className="section-kicker">Live policy gate</p>
        <h3 className="policy-room__title"><SlidersHorizontal size={17} className="text-cyan" />CFO 支付授權政策</h3>
        <p>所有控制項會即時同步至監控台與 Intent 沙盒的下一次評估。</p>
      </div>
      <span className="fail-closed-badge"><LockKeyhole size={13} /> FAIL-CLOSED</span>
    </div>
    <div className="policy-room__grid">
      <section className="policy-control-stack" aria-label="互動政策控制">
        <div className="policy-control-card">
          <div className="flex items-start justify-between gap-3">
            <div><label htmlFor="per-tx-cap" className="policy-control-title">單筆支出上限</label><p className="policy-control-copy">Per-Tx Cap · 即時套用於快速情境與自訂 Intent</p></div>
            <output htmlFor="per-tx-cap" className="policy-value">${policy.perTxCap.toFixed(3)}</output>
          </div>
          <input id="per-tx-cap" className="policy-slider" type="range" min="0.001" max="5" step="0.001" value={policy.perTxCap} onChange={(event) => onPolicyChange({ perTxCap: Number(event.target.value) })} />
          <div className="policy-range"><span>$0.001</span><span>$5.00 USDC</span></div>
        </div>
        <div className="policy-control-card"><PolicySwitch label="Strict Allowlist" description={policy.strictAllowlist ? "只允許核准的商戶網域" : "允許任何格式有效的商戶 URL"} enabled={policy.strictAllowlist} onChange={() => onPolicyChange({ strictAllowlist: !policy.strictAllowlist })} /></div>
        <div className="policy-control-card">
          <PolicySwitch label="OWASP ASI 防護" description={policy.owaspProtection ? "在簽署前攔截代理提權與提示注入" : "僅監看，不封鎖提示注入"} enabled={policy.owaspProtection} onChange={() => onPolicyChange({ owaspProtection: !policy.owaspProtection })} />
          <div className="defense-levels" aria-label="OWASP ASI 防禦等級">{defenseLevels.map((level) => <button key={level.value} type="button" className={policy.owaspLevel === level.value ? "active" : ""} aria-pressed={policy.owaspLevel === level.value} onClick={() => onPolicyChange({ owaspLevel: level.value })}><strong>{level.label}</strong><span>{level.detail}</span></button>)}</div>
        </div>
      </section>
      <section className="policy-matrix" aria-labelledby="policy-matrix-heading">
        <div className="policy-matrix__heading"><div><p className="section-kicker">Active rules matrix</p><h4 id="policy-matrix-heading">六維政策約束</h4></div><span>6 / 6 ARMED</span></div>
        <div className="policy-rule-list">{rules.map(([label, value, meta], index) => <div key={label} className="policy-rule"><span className="policy-rule__index">0{index + 1}</span><div><p>{label}</p><small>{meta}</small></div><div className="policy-rule__value"><strong>{value}</strong><Check size={14} strokeWidth={2.5} /></div></div>)}</div>
        <div className="policy-matrix__foot"><ShieldCheck size={13} />政策變更不授予簽署權；金庫仍在獨立 custody boundary 後方。</div>
      </section>
    </div>
  </article>;
}

function PolicySwitch({ label, description, enabled, onChange }: { label: string; description: string; enabled: boolean; onChange: () => void }) {
  return <div className="policy-switch-row"><div><p className="policy-control-title">{label}</p><p className="policy-control-copy">{description}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`policy-switch ${enabled ? "policy-switch--on" : ""}`} onClick={onChange}><span /></button></div>;
}
