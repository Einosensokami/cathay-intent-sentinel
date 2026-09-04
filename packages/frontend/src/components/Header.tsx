import React from "react";
import { ShieldCheck, Lock } from "lucide-react";

interface HeaderProps {
  balance: number;
  cap: number;
  isArmed: boolean;
}

export const Header: React.FC<HeaderProps> = ({ balance, cap, isArmed }) => {
  const percentUsed = Math.round(((cap - balance) / cap) * 100 * 100) / 100;

  return (
    <header className="border-b border-cyber-border bg-cyber-surface/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-cathay-emerald to-cathay-dark border border-cathay-emerald/40 shadow-lg shadow-cathay-green/20">
            <ShieldCheck className="w-6 h-6 text-white" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                Cathay IntentSentinel 國泰意圖哨兵
              </h1>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cathay-dark/80 text-emerald-300 border border-emerald-500/30">
                x402 v2 金融閘道
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              策略約束型 AI 代理人金融安全護欄 · Base 鏈上零手續費結算
            </p>
          </div>
        </div>

        {/* Live Network & CFO Treasury Telemetry */}
        <div className="flex items-center flex-wrap gap-3 text-xs font-mono">
          
          {/* Network Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyber-card border border-cyber-border">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-slate-300 font-semibold">Base Sepolia 測試網</span>
            <span className="text-slate-500 text-[10px]">(84532)</span>
          </div>

          {/* Policy Gate Armed */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
            isArmed 
              ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-300 shadow-sm shadow-emerald-900/30" 
              : "bg-rose-950/40 border-rose-600/40 text-rose-300"
          }`}>
            <Lock className="w-3.5 h-3.5" />
            <span className="font-bold">{isArmed ? "策略閘門：已布防 (ARMED)" : "策略閘門：未布防"}</span>
          </div>

          {/* CFO Treasury Box */}
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-cyber-card border border-cyber-border/80">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">CFO 企業金庫餘額</span>
              <span className="text-sm font-extrabold text-white">
                {balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-cathay-emerald text-xs">USDC</span>
              </span>
            </div>
            <div className="w-px h-6 bg-cyber-border" />
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">已使用額度</span>
              <span className="text-xs font-semibold text-emerald-400">
                {percentUsed}%
              </span>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
