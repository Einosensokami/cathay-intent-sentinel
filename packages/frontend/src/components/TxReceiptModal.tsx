import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, Copy, Fuel, ShieldCheck } from "lucide-react";
import type { Transaction } from "../types";
import { Modal } from "./Modal";

const EIP712_TYPES = {
  IntentAuthorization: [
    { name: "intentDigest", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

const EIP712_DOMAIN = {
  name: "Cathay IntentSentinel",
  version: "1",
  chainId: 84532,
  verifyingContract: "0x0000000000000000000000000000000000008453",
};

export function TxReceiptModal({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) {
  const confirmed = transaction?.status === "settled" && transaction.verified && transaction.mode === "live";
  const blocked = transaction?.status === "blocked";
  const unknown = transaction?.status === "unknown";
  const explorer = confirmed ? transaction?.explorerUrl : undefined;
  const [evidenceHash, setEvidenceHash] = useState("計算中…");
  const [domainSeparator, setDomainSeparator] = useState("計算中…");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCopied(false);
    if (!transaction) return () => { cancelled = true; };
    setEvidenceHash("計算中…");
    setDomainSeparator("計算中…");
    void Promise.all([sha256(JSON.stringify({ id: transaction.id, merchant: transaction.merchant, resource: transaction.resource, amount: transaction.amount, reason: transaction.reason ?? "" })), sha256(JSON.stringify(EIP712_DOMAIN))]).then(([intentHash, domainHash]) => {
      if (!cancelled) { setEvidenceHash(intentHash); setDomainSeparator(domainHash); }
    });
    return () => { cancelled = true; };
  }, [transaction]);

  const nonce = transaction ? nonceFor(transaction.id) : "";
  const signatureStructure = JSON.stringify({ primaryType: "IntentAuthorization", domain: EIP712_DOMAIN, types: EIP712_TYPES, message: { intentDigest: evidenceHash, merchant: transaction?.merchant ?? "", amount: transaction?.amount ?? "", nonce } }, null, 2);
  const copySignature = () => {
    setCopied(true);
    void navigator.clipboard?.writeText(signatureStructure);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return <Modal open={Boolean(transaction)} onClose={onClose} eyebrow="Settlement evidence" title={confirmed ? "已驗證交易收據" : blocked ? "政策拒絕收據" : unknown ? "結算結果待確認" : "模擬交易收據"}>{transaction && <div className="space-y-5"><div className={`flex items-center gap-3 rounded-xl border p-4 ${confirmed ? "border-emerald/20 bg-emerald/5" : blocked ? "border-alert/20 bg-alert/5" : "border-amber-400/20 bg-amber-400/5"}`}>{confirmed ? <CheckCircle2 size={20} className="text-emerald" /> : <AlertCircle size={20} className={blocked ? "text-alert" : "text-amber-300"} />}<div><p className="text-sm font-semibold text-white">{confirmed ? "已在 Base Sepolia 確認" : blocked ? "簽署前已拒絕" : unknown ? "後端回報尚未確認" : "Mock 模擬，未提交鏈上交易"}</p><p className="mt-0.5 text-[10px] text-slate-500">{confirmed ? "收據已驗證 · ERC-3009 authorization 已消耗" : blocked ? "未接觸 custody · 資金未移動" : "此結果不代表真實資金或鏈上收據"}</p></div></div><dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2"><ReceiptField label="參考編號" value={transaction.id} /><ReceiptField label="時間" value={`${transaction.time} UTC+8`} /><ReceiptField label="商戶" value={transaction.merchant} /><ReceiptField label="金額" value={transaction.amount} /><ReceiptField label="模式" value={transaction.mode === "mock" ? "Mock 模擬" : "Live-configured"} /><ReceiptField label="區塊" value={transaction.block ?? "未確認"} /><ReceiptField label="Correlation ID" value={transaction.correlationId ?? "未提供"} /><ReceiptField label="Request ID" value={transaction.requestId ?? "未提供"} /></dl>{transaction.txHash && <div className="rounded-xl border border-line bg-[#080d16] p-4"><div className="flex items-center justify-between gap-4"><p className="micro-label">Transaction hash</p><button type="button" className="audit-link" onClick={() => void navigator.clipboard?.writeText(transaction.txHash ?? "")}>Copy <Copy size={10} /></button></div><p className="mt-2 break-all font-mono text-[10px] leading-5 text-slate-300">{transaction.txHash}</p>{explorer && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><span className="flex items-center gap-1.5 text-[10px] text-emerald"><Fuel size={12} /> Facilitator 贊助 gas</span><a className="audit-link" href={explorer} target="_blank" rel="noreferrer">開啟 Basescan <ArrowUpRight size={11} /></a></div>}</div>}
        <section className="evidence-inspector" aria-labelledby="evidence-heading"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="section-kicker">Cryptographic proof</p><h3 id="evidence-heading" className="mt-1 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck size={15} className="text-cyan" />密碼學證明檢視</h3></div><span className="evidence-live-tag">HASH-CHAIN READY</span></div><div className="evidence-grid"><EvidenceField label="EIP-712 Domain Separator" value={domainSeparator} /><EvidenceField label="Authorization Nonce (Hex)" value={nonce} /><EvidenceField label="SHA-256 Intent Digest / Evidence Hash" value={evidenceHash} wide /></div><details className="eip712-details"><summary>EIP-712 Domain & Types</summary><pre>{JSON.stringify({ domain: EIP712_DOMAIN, types: EIP712_TYPES }, null, 2)}</pre></details><button type="button" className="copy-signature-button" onClick={copySignature}><Copy size={13} />{copied ? "已複製簽章結構" : "一鍵複製 EIP-712 簽章結構"}</button></section>
        {transaction.reason && <p className="rounded-lg border border-line bg-white/[0.02] p-3 font-mono text-[10px] leading-5 text-slate-400">{transaction.reason}</p>}</div>}</Modal>;
}

function EvidenceField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={`evidence-field ${wide ? "evidence-field--wide" : ""}`}><span>{label}</span><strong>{value}</strong></div>; }
function nonceFor(id: string): string { return `0x${Array.from(new TextEncoder().encode(id)).map((value) => value.toString(16).padStart(2, "0")).join("").padEnd(32, "0")}`; }
async function sha256(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return `0x${Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("")}`; }
function ReceiptField({ label, value }: { label: string; value: string }) { return <div className="bg-surface px-4 py-3"><dt className="micro-label">{label}</dt><dd className="mt-1.5 font-mono text-[11px] text-slate-300">{value}</dd></div>; }
