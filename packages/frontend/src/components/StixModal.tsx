import React, { useState } from "react";
import { X, Copy, Check, FileJson } from "lucide-react";
import { ThreatAlert } from "../engine/types";

interface StixModalProps {
  alert: ThreatAlert | null;
  onClose: () => void;
}

export const StixModal: React.FC<StixModalProps> = ({ alert, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!alert) return null;

  const jsonString = JSON.stringify(alert.stixBundle, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-cyber-surface border border-cyber-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyber-border bg-cyber-card">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                STIX 2.1 Structured Threat Intel Bundle
              </h3>
              <p className="text-[11px] text-slate-400">
                OASIS Cyber Threat Intelligence Standard · Redacted & Quarantined
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 font-mono text-xs max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div className="p-2.5 rounded-lg bg-cyber-bg border border-cyber-border">
              <span className="text-slate-500 block">OWASP Attack Class</span>
              <span className="text-rose-400 font-bold">{alert.owaspCategory} · {alert.attackType}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-cyber-bg border border-cyber-border">
              <span className="text-slate-500 block">Confidence Level</span>
              <span className="text-emerald-400 font-bold">98% High Confidence</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>Sanitized STIX Bundle (Pushable to SIEM/SOC):</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-cathay-emerald hover:text-emerald-300 font-semibold transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-[#030509] border border-cyber-border text-slate-300 text-[11px] leading-relaxed overflow-x-auto">
              {jsonString}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-cyber-border bg-cyber-card flex items-center justify-between text-xs font-mono">
          <span className="text-slate-500">Security Gate: Zero Credential Leakage</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
          >
            Close Inspector
          </button>
        </div>

      </div>
    </div>
  );
};
