import { ArrowUpRight, Database, Fingerprint, ReceiptText, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { ThreatRecord, Transaction } from "../types";

interface SecurityAuditViewProps {
  transactions: Transaction[];
  threat: ThreatRecord | null;
  knownThreat: ThreatRecord;
  onInspectTx: (tx: Transaction) => void;
  onInspectThreat: (threat: ThreatRecord) => void;
}

export function SecurityAuditView({ transactions, threat, knownThreat, onInspectTx, onInspectThreat }: SecurityAuditViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => transactions.find((transaction) => transaction.id === selectedId) ?? transactions[0], [selectedId, transactions]);
  const intelligence = threat ?? knownThreat;
  return <div className="audit-layout">
    <section className="panel-card audit-table-card" aria-labelledby="audit-table-heading">
      <div className="audit-card-heading"><div><p className="section-kicker">Immutable audit ledger</p><h3 id="audit-table-heading">完整交易稽核軌跡</h3><p>每一筆核准、拒絕與待確認結果皆保留模式與 correlation ID。</p></div><span><Database size={14} />{transactions.length} EVENTS</span></div>
      <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>事件 / 時間</th><th>商戶 / 資源</th><th>金額</th><th>執行模式</th><th>Correlation ID</th><th>狀態</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id} className={selected?.id === transaction.id ? "selected" : ""} onClick={() => setSelectedId(transaction.id)}><td><strong>{transaction.id}</strong><small>{transaction.time} UTC+8</small></td><td><strong>{transaction.merchant}</strong><small>{transaction.resource}</small></td><td className="amount-cell">{transaction.amount}</td><td><span className={`audit-mode audit-mode--${transaction.mode}`}>{transaction.mode}</span></td><td><code>{transaction.correlationId ?? "—"}</code></td><td><span className={`audit-status audit-status--${transaction.status}`}>{transaction.status}</span></td><td><button type="button" className="audit-inspect" onClick={(event) => { event.stopPropagation(); onInspectTx(transaction); }} aria-label={`檢視 ${transaction.id} 收據`}><ReceiptText size={14} /></button></td></tr>)}</tbody></table></div>
    </section>
    <div className="audit-detail-grid">
      <article className={`panel-card intel-card ${threat ? "intel-card--active" : ""}`}><div className="intel-card__icon"><ShieldAlert size={21} /></div><div><p className="section-kicker">STIX 2.1 threat intelligence</p><h3>{threat ? "偵測到即時威脅事件" : "威脅情報中心已待命"}</h3><p>{threat ? threat.description : "規則、指標與處置證據會封裝成標準化 STIX 2.1 bundle。"}</p><div className="intel-meta"><span>OWASP ASI01</span><span>CONFIDENCE 99</span><span>{threat ? "BLOCKED" : "ARMED"}</span></div><button type="button" onClick={() => onInspectThreat(intelligence)}>檢視 STIX 2.1 Bundle <ArrowUpRight size={13} /></button></div></article>
      <article className="panel-card evidence-card"><div className="evidence-card__heading"><span><Fingerprint size={20} /></span><div><p className="section-kicker">Cryptographic evidence explorer</p><h3>{selected ? selected.id : "尚無證據"}</h3></div></div>{selected && <><dl className="evidence-summary"><div><dt>Settlement state</dt><dd>{selected.status.toUpperCase()}</dd></div><div><dt>Evidence hash</dt><dd>{selected.evidenceHash ?? selected.txHash ?? "於收據檢視時計算"}</dd></div><div><dt>Correlation ID</dt><dd>{selected.correlationId ?? "Mock seed · not issued"}</dd></div><div><dt>Custody boundary</dt><dd>{selected.status === "blocked" ? "Not reached" : selected.verified ? "Verified" : "Simulated"}</dd></div></dl><button type="button" className="evidence-open-button" onClick={() => onInspectTx(selected)}>開啟密碼學證據與收據 <ReceiptText size={13} /></button></>}</article>
    </div>
  </div>;
}
