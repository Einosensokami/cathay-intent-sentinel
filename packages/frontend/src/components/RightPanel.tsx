import React from "react";
import { Building2, ExternalLink, ShieldAlert, CheckCircle, AlertTriangle, FileCode2 } from "lucide-react";
import { ThreatAlert, Transaction } from "../engine/types";

interface RightPanelProps {
  balance: number;
  cap: number;
  transactions: Transaction[];
  threatAlerts: ThreatAlert[];
  onOpenStix: (alert: ThreatAlert) => void;
  onOpenReceipt?: (tx: Transaction) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  balance,
  cap,
  transactions,
  threatAlerts,
  onOpenStix,
}) => {
  const usedAmount = Math.max(0, cap - balance);
  const percentUsed = Math.min(100, Math.round((usedAmount / cap) * 100 * 100) / 100);

  return (
    <div className="flex flex-col gap-5">
      
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-cathay-emerald">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              CFO Financial Control & Audit Terminal
            </h2>
            <p className="text-xs text-slate-400">
              Enterprise Policy Gate, On-Chain Verification & Threat Logs
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-600/30">
          Governance: Strict
        </span>
      </div>

      {/* CFO Treasury Budget Gauge */}
      <div className="p-4 rounded-xl bg-cyber-card border border-cyber-border shadow-md">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-slate-300 uppercase tracking-wider">
            Daily Corporate Liquidity Budget
          </span>
          <span className="font-mono text-emerald-400 font-bold">
            ${usedAmount.toFixed(2)} / ${cap.toLocaleString()} USDC
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-3 bg-cyber-bg rounded-full overflow-hidden p-0.5 border border-cyber-border">
          <div
            className="h-full bg-gradient-to-r from-cathay-emerald via-emerald-400 to-teal-300 rounded-full transition-all duration-500 shadow-sm shadow-emerald-500/50"
            style={{ width: `${Math.max(3, percentUsed)}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-mono pt-3 border-t border-cyber-border/60">
          <div className="p-1.5 rounded bg-cyber-surface">
            <span className="text-[10px] text-slate-500 block">Per-Call Cap</span>
            <span className="text-slate-200 font-bold">$50.00 USDC</span>
          </div>
          <div className="p-1.5 rounded bg-cyber-surface">
            <span className="text-[10px] text-slate-500 block">High-Risk Floor</span>
            <span className="text-amber-300 font-bold">$200.00 USDC</span>
          </div>
          <div className="p-1.5 rounded bg-cyber-surface">
            <span className="text-[10px] text-slate-500 block">Fail-Closed Gate</span>
            <span className="text-emerald-400 font-bold">ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Threat Defense Alert Box */}
      {threatAlerts.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/60 shadow-lg shadow-rose-950/40 animate-pulse-slow">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-rose-300 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              OWASP Threat Defense Activated
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-600/50">
              {threatAlerts[0]?.owaspCategory} BLOCKED
            </span>
          </div>
          <p className="text-xs text-rose-200 leading-relaxed font-mono">
            {threatAlerts[0]?.message}
          </p>
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-rose-900/40 text-[11px] font-mono">
            <span className="text-rose-400">Target: {threatAlerts[0]?.targetResource}</span>
            <button
              onClick={() => onOpenStix(threatAlerts[0]!)}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold underline"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              View STIX 2.1 Intel Bundle
            </button>
          </div>
        </div>
      )}

      {/* Live Transaction & Settlement Stream */}
      <div className="p-4 rounded-xl bg-cyber-card border border-cyber-border flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Real-Time Settlement & Audit Stream
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {transactions.length} Records
          </span>
        </div>

        <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className={`p-3 rounded-xl border text-xs transition-all ${
                tx.status === "blocked"
                  ? "bg-rose-950/20 border-rose-800/40"
                  : tx.status === "settled"
                  ? "bg-cyber-surface border-cyber-border hover:border-emerald-500/40"
                  : "bg-purple-950/20 border-purple-800/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  {tx.status === "settled" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/40 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> SETTLED
                    </span>
                  )}
                  {tx.status === "blocked" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-600/40 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> BLOCKED
                    </span>
                  )}
                  <span>{tx.scenario}</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-white">
                  {tx.amount}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span className="truncate max-w-[200px]">{tx.merchant}</span>
                <span>{tx.timestamp}</span>
              </div>

              {/* Badges / Links */}
              <div className="mt-2 pt-2 border-t border-cyber-border/40 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  {tx.reputationScore && (
                    <span className="text-emerald-400">ERC-8004: {tx.reputationScore}/100</span>
                  )}
                  {tx.discountPct && (
                    <span className="text-purple-300">Discount: -{tx.discountPct}%</span>
                  )}
                </div>
                {tx.explorerUrl && (
                  <a
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sky-400 hover:text-sky-300 underline font-semibold"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Basescan Tx
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
