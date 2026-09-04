import { TrendingDown, WalletCards } from "lucide-react";

export function BudgetGauge({ spent }: { spent: number }) {
  const cap = 100;
  const percentage = Math.max(0, Math.min(100, (spent / cap) * 100));
  return <article className="panel-card budget-gauge">
    <div className="budget-gauge__header"><div><p className="section-kicker">CFO daily budget</p><h3>今日已承諾支出</h3></div><span><WalletCards size={19} /></span></div>
    <div className="budget-gauge__value"><strong>${spent.toFixed(2)}</strong><span>USDC</span><em>{percentage.toFixed(2)}%</em></div>
    <div className="budget-gauge__track" role="meter" aria-label="今日預算使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span style={{ width: `${Math.max(2, percentage)}%` }} /></div>
    <div className="budget-gauge__foot"><span><TrendingDown size={12} />${Math.max(0, cap - spent).toFixed(2)} 可用</span><span>$100.00 上限</span></div>
  </article>;
}
