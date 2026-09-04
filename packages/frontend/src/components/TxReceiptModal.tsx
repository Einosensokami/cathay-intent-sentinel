import { ArrowUpRight, CheckCircle2, Copy, Fuel } from "lucide-react";
import type { Transaction } from "../types";
import { Modal } from "./Modal";

export function TxReceiptModal({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const settled = transaction?.status === "settled";
  return (
    <Modal open={Boolean(transaction)} onClose={onClose} eyebrow="Settlement evidence" title={settled ? "Verified transaction receipt" : "Policy denial receipt"}>
      {transaction && <div className="space-y-5">
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${settled ? "border-emerald/20 bg-emerald/5" : "border-alert/20 bg-alert/5"}`}>
          <CheckCircle2 size={20} className={settled ? "text-emerald" : "text-alert"} />
          <div><p className="text-sm font-semibold text-white">{settled ? "Finalized on Base Sepolia" : "Rejected before signing"}</p><p className="mt-0.5 text-[10px] text-slate-500">{settled ? "Receipt verified · ERC-3009 authorization consumed" : "No custody access · no funds moved"}</p></div>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          <ReceiptField label="Reference" value={transaction.id} />
          <ReceiptField label="Timestamp" value={`${transaction.time} UTC+8`} />
          <ReceiptField label="Merchant" value={transaction.merchant} />
          <ReceiptField label="Amount" value={transaction.amount} />
          <ReceiptField label="Network" value={transaction.network ?? "Not submitted"} />
          <ReceiptField label="Block" value={transaction.block ?? "—"} />
        </dl>
        {transaction.txHash && <div className="rounded-xl border border-line bg-[#080d16] p-4">
          <div className="flex items-center justify-between gap-4"><p className="micro-label">Transaction hash</p><button type="button" className="audit-link" onClick={() => void navigator.clipboard?.writeText(transaction.txHash ?? "")}>Copy <Copy size={10} /></button></div>
          <p className="mt-2 break-all font-mono text-[10px] leading-5 text-slate-300">{transaction.txHash}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="flex items-center gap-1.5 text-[10px] text-emerald"><Fuel size={12} /> Gas sponsored by facilitator</span>
            <a className="audit-link" href={`https://sepolia.basescan.org/tx/${transaction.txHash}`} target="_blank" rel="noreferrer">Open in Basescan <ArrowUpRight size={11} /></a>
          </div>
        </div>}
      </div>}
    </Modal>
  );
}

function ReceiptField({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface px-4 py-3"><dt className="micro-label">{label}</dt><dd className="mt-1.5 font-mono text-[11px] text-slate-300">{value}</dd></div>;
}
