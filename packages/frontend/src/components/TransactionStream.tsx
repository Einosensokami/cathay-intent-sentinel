import { ArrowUpRight, Ban, CheckCircle2, ReceiptText } from "lucide-react";
import type { Transaction } from "../types";

export function TransactionStream({ transactions, onInspect }: { transactions: Transaction[]; onInspect: (tx: Transaction) => void }) {
  return (
    <article className="panel-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
        <div>
          <p className="section-kicker">Immutable audit trail</p>
          <h3 className="mt-1 text-sm font-semibold text-white">Transaction & settlement stream</h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500"><span className="live-dot bg-emerald" /> LIVE</div>
      </div>
      <div className="max-h-[286px] overflow-y-auto">
        {transactions.map((tx) => (
          <div key={tx.id} className="transaction-row">
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tx.status === "settled" ? "bg-emerald/8 text-emerald" : "bg-alert/10 text-alert"}`}>
              {tx.status === "settled" ? <CheckCircle2 size={15} /> : <Ban size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[11px] font-semibold text-slate-200">{tx.merchant}</p>
                <p className={`shrink-0 font-mono text-[11px] font-medium ${tx.status === "blocked" ? "text-alert" : "text-white"}`}>{tx.amount}</p>
              </div>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
                <p className="truncate font-mono text-[9px] text-slate-600">{tx.time} · {tx.txHash ? `${tx.txHash.slice(0, 10)}…${tx.txHash.slice(-6)}` : "no signature created"}</p>
                {tx.txHash ? (
                  <a className="audit-link" href={`https://sepolia.basescan.org/tx/${tx.txHash}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Basescan <ArrowUpRight size={10} /></a>
                ) : <span className="font-mono text-[9px] text-alert/70">POLICY DENY</span>}
              </div>
            </div>
            <button type="button" className="icon-button" onClick={() => onInspect(tx)} aria-label={`Inspect ${tx.id} receipt`}><ReceiptText size={14} /></button>
          </div>
        ))}
      </div>
    </article>
  );
}
