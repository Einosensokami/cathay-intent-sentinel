import { Activity, Landmark, Radio, ShieldCheck } from "lucide-react";

export interface HeaderProps { balance: number; defending: boolean; mode: "mock" | "live"; connection: "connected" | "connecting" | "offline"; liveConfigured: boolean; onModeChange: (mode: "mock" | "live") => void; }

export function Header({ balance, defending, mode, connection, liveConfigured, onModeChange }: HeaderProps) {
  const connectionLabel = connection === "connected" ? "已連線" : connection === "connecting" ? "連線中" : "離線";
  return <header className="border-b border-line/80 bg-cyber/85 backdrop-blur-xl">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
      <div className="flex items-center gap-3"><div className="brand-mark" aria-hidden="true"><ShieldCheck size={22} strokeWidth={2.2} /></div><div><div className="flex items-baseline gap-2"><span className="text-base font-extrabold tracking-[-0.03em] text-white">CATHAY</span><span className="text-base font-medium tracking-[-0.03em] text-white/90">IntentSentinel</span></div><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Agentic finance command center</p></div></div>
      <div className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3">
        <div className="status-chip"><Radio size={13} className="text-accent" /><span className={`live-dot ${connection === "connected" ? "bg-accent" : "bg-amber-300"}`} /><span className="text-slate-300">Base Sepolia</span><span className="font-mono text-[10px] text-slate-600">84532</span><span className="font-mono text-[9px] text-slate-500">{connectionLabel}</span></div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white/[0.02] p-1" aria-label="執行模式"><button type="button" className={`rounded px-2 py-1 font-mono text-[9px] ${mode === "mock" ? "bg-emerald/15 text-emerald" : "text-slate-500"}`} aria-pressed={mode === "mock"} onClick={() => onModeChange("mock")}>Mock</button><button type="button" className={`rounded px-2 py-1 font-mono text-[9px] ${mode === "live" ? "bg-accent/15 text-accent" : "text-slate-500"}`} aria-pressed={mode === "live"} onClick={() => onModeChange("live")}>Live-configured{!liveConfigured && "*"}</button></div>
        <div className="hidden h-8 w-px bg-line md:block" />
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1"><Landmark size={16} className="text-slate-500" /><div className="text-right"><p className="micro-label">CFO Treasury</p><p className="font-mono text-sm font-medium tabular-nums text-white">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500">USDC</span></p></div></div>
        <div className={`guard-chip ${defending ? "guard-chip--defending" : ""}`} aria-live="polite"><Activity size={14} /><span>政策防護</span><strong>{defending ? "防禦中" : "已武裝"}</strong></div>
      </div>
    </div>
  </header>;
}
