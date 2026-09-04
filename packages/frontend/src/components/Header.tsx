import { Activity, Landmark, Radio, ShieldCheck } from "lucide-react";

export interface HeaderProps { balance: number; defending: boolean; }

export function Header({ balance, defending }: HeaderProps) {
  return (
    <header className="border-b border-line/80 bg-cyber/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark" aria-hidden="true"><ShieldCheck size={22} strokeWidth={2.2} /></div>
          <div><div className="flex items-baseline gap-2"><span className="text-base font-extrabold tracking-[-0.03em] text-white">CATHAY</span><span className="text-base font-medium tracking-[-0.03em] text-white/90">IntentSentinel</span></div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Agentic finance command center</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3">
          <div className="status-chip"><Radio size={13} className="text-accent" /><span className="live-dot bg-accent" /><span className="text-slate-300">Base Sepolia</span><span className="font-mono text-[10px] text-slate-600">84532</span></div>
          <div className="hidden h-8 w-px bg-line md:block" />
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1"><Landmark size={16} className="text-slate-500" /><div className="text-right"><p className="micro-label">CFO Treasury</p><p className="font-mono text-sm font-medium tabular-nums text-white">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500">USDC</span></p></div></div>
          <div className={`guard-chip ${defending ? "guard-chip--defending" : ""}`} aria-live="polite"><Activity size={14} /><span>Policy Guard</span><strong>{defending ? "DEFENDING" : "ARMED"}</strong></div>
        </div>
      </div>
    </header>
  );
}
