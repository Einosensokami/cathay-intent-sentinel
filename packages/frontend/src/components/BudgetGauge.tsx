import { TrendingDown, WalletCards } from "lucide-react";

export function BudgetGauge({ spent }: { spent: number }) {
  const cap = 100;
  const percentage = Math.max(0.03, Math.min(100, (spent / cap) * 100));
  return (
    <article className="panel-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="section-kicker">CFO treasury budget</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-mono text-2xl font-medium tracking-[-0.04em] text-white">${spent.toFixed(2)}</span>
            <span className="mb-1 text-[10px] text-slate-500">spent today</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-white/[0.025] p-2.5 text-slate-400"><WalletCards size={19} /></div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Daily utilization</span>
          <span className="font-mono text-slate-300">{percentage.toFixed(2)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#0b1220] ring-1 ring-inset ring-white/5">
          <div className="budget-fill" style={{ width: `${Math.max(2, percentage)}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[10px] text-emerald"><TrendingDown size={12} />$99.95 available</span>
          <span className="font-mono text-[10px] text-slate-500">$100.00 daily cap</span>
        </div>
      </div>
    </article>
  );
}
