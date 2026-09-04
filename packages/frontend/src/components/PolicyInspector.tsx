import { Check, LockKeyhole } from "lucide-react";

const rules = [
  ["Task binding", "TASK-Q3-092", "Context locked"],
  ["Budget cap", "≤ 1.00 USDC", "Per call"],
  ["Merchant", "AlphaSense MCP", "Allowlisted"],
  ["Asset / network", "USDC · Base", "eip155:84532"],
  ["Expiry window", "≤ 20 minutes", "18m remaining"],
  ["Velocity", "≤ 5 / minute", "1 of 5"],
];

export function PolicyInspector({ defending }: { defending: boolean }) {
  return (
    <article className={`panel-card overflow-hidden ${defending ? "defending-ring" : ""}`}>
      <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
        <div>
          <p className="section-kicker">Live policy gate</p>
          <h3 className="mt-1 text-sm font-semibold text-white">6-dimensional constraints</h3>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald"><LockKeyhole size={13} /> FAIL-CLOSED</span>
      </div>
      <div className="divide-y divide-line/55">
        {rules.map(([label, value, meta], index) => (
          <div key={label} className="group grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.018]">
            <span className="grid h-6 w-6 place-items-center rounded-md border border-emerald/20 bg-emerald/5 font-mono text-[9px] text-emerald">0{index + 1}</span>
            <div>
              <p className="text-[11px] font-medium text-slate-200">{label}</p>
              <p className="mt-0.5 font-mono text-[9px] text-slate-600">{meta}</p>
            </div>
            <div className="flex items-center gap-2 text-right">
              <span className="font-mono text-[10px] text-slate-400">{value}</span>
              <Check size={13} strokeWidth={2.5} className="text-emerald" />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
