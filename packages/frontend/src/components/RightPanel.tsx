import { LockKeyhole } from "lucide-react";
import type { ThreatRecord, Transaction } from "../types";
import { BudgetGauge } from "./BudgetGauge";
import type { PolicyState } from "./PolicyInspector";
import { ThreatPanel } from "./ThreatPanel";
import { TransactionStream } from "./TransactionStream";

export interface RightPanelProps {
  spent: number;
  transactions: Transaction[];
  threat: ThreatRecord | null;
  policy: PolicyState;
  onInspectTx: (tx: Transaction) => void;
  onInspectThreat: (threat: ThreatRecord) => void;
}

export function RightPanel(props: RightPanelProps) {
  return <section className="live-oversight" aria-labelledby="oversight-heading">
    <div className="section-heading"><div><p className="section-kicker">Executive oversight</p><h2 id="oversight-heading">財務與風險即時態勢</h2></div><span className="hash-chain-label">HASH-CHAIN ACTIVE</span></div>
    <div className="live-summary-grid"><BudgetGauge spent={props.spent} /><article className="panel-card policy-snapshot"><div className="policy-snapshot__title"><LockKeyhole size={16} /><div><p className="section-kicker">Policy snapshot</p><h3>目前執行邊界</h3></div></div><dl><div><dt>Per-Tx Cap</dt><dd>${props.policy.perTxCap.toFixed(3)}</dd></div><div><dt>Merchant</dt><dd>{props.policy.strictAllowlist ? "Strict" : "Open"}</dd></div><div><dt>OWASP ASI</dt><dd>{props.policy.owaspProtection ? props.policy.owaspLevel : "Monitor"}</dd></div></dl></article></div>
    <TransactionStream transactions={props.transactions} onInspect={props.onInspectTx} />
    <ThreatPanel threat={props.threat} onInspect={props.onInspectThreat} />
  </section>;
}
