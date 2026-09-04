import type { ThreatRecord, Transaction } from "../types";
import { BudgetGauge } from "./BudgetGauge";
import { PolicyInspector } from "./PolicyInspector";
import { ThreatPanel } from "./ThreatPanel";
import { TransactionStream } from "./TransactionStream";

export interface RightPanelProps { spent: number; defending: boolean; transactions: Transaction[]; threat: ThreatRecord | null; onInspectTx: (tx: Transaction) => void; onInspectThreat: (threat: ThreatRecord) => void; }

export function RightPanel(props: RightPanelProps) {
  return (
    <section className="space-y-4" aria-labelledby="control-heading">
      <div className="flex items-end justify-between"><div><p className="section-kicker">02 / Financial control</p><h2 id="control-heading" className="mt-1 text-lg font-semibold tracking-tight text-white">CFO 監督與稽核</h2></div><span className="font-mono text-[9px] uppercase tracking-wider text-slate-600">證據 hash-chain active</span></div>
      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]"><BudgetGauge spent={props.spent} /><PolicyInspector defending={props.defending} /></div>
      <TransactionStream transactions={props.transactions} onInspect={props.onInspectTx} />
      <ThreatPanel threat={props.threat} onInspect={props.onInspectThreat} />
    </section>
  );
}
