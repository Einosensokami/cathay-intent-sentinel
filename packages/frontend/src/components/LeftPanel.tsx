import React from "react";
import { Bot, Zap, ShieldAlert, Handshake, Terminal, CheckCircle2, XCircle, ArrowRight, Shield } from "lucide-react";
import { PipelineStep, ScenarioId } from "../engine/types";

interface LeftPanelProps {
  activeScenario: ScenarioId | null;
  isRunning: boolean;
  pipeline: PipelineStep[];
  logs: Array<{ time: string; text: string; type: "info" | "success" | "error" | "warn" }>;
  onRunScenario: (scenario: ScenarioId) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
  activeScenario,
  isRunning,
  pipeline,
  logs,
  onRunScenario,
}) => {
  return (
    <div className="flex flex-col gap-5">
      
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Autonomous AI Agent Workspace
            </h2>
            <p className="text-xs text-slate-400">
              Reasoning Engine (LLM Context Zero-Key Isolated)
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-blue-950/60 text-blue-300 border border-blue-600/30">
          Agent ID: research-agent-01
        </span>
      </div>

      {/* Active Task Card */}
      <div className="p-4 rounded-xl bg-cyber-card border border-cyber-border/80 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Active Mission Goal
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Autonomous Execution
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-200">
          "Aggregate Q3 Semiconductor Market Intel from Paid Verified APIs"
        </p>
        <div className="mt-3 pt-3 border-t border-cyber-border/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Target: <strong className="text-slate-300 font-normal">api.cathay-verified.com</strong></span>
          <span>Max Intent Cap: <strong className="text-emerald-400">0.05 USDC</strong></span>
        </div>
      </div>

      {/* Interactive Trigger Buttons */}
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cathay-emerald" />
          Interactive Hackathon Live Scenarios
        </span>

        <div className="grid grid-cols-1 gap-2.5">
          
          {/* Button 1: Normal Purchase */}
          <button
            onClick={() => onRunScenario("legitimate")}
            disabled={isRunning}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
              activeScenario === "legitimate" && isRunning
                ? "bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/50"
                : "bg-cyber-surface hover:bg-cyber-card border-cyber-border hover:border-emerald-500/50"
            } disabled:opacity-50 disabled:cursor-not-allowed group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  ⚡ Scenario 1: Legitimate Data Purchase
                </div>
                <div className="text-[11px] text-slate-400">
                  0.01 USDC · Exact Scheme · ERC-3009 Zero-Gas Settlement
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Button 2: Prompt Injection Attack */}
          <button
            onClick={() => onRunScenario("attack")}
            disabled={isRunning}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
              activeScenario === "attack" && isRunning
                ? "bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-950/50"
                : "bg-cyber-surface hover:bg-cyber-card border-cyber-border hover:border-rose-500/50"
            } disabled:opacity-50 disabled:cursor-not-allowed group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>🛑 Scenario 2: Prompt Injection Financial Attack</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-600/40">OWASP ASI02</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Attacker tricks agent to transfer 500 USDC ➔ Policy Gate Blocked!
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Button 3: Multi-Agent Negotiation */}
          <button
            onClick={() => onRunScenario("negotiation")}
            disabled={isRunning}
            className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
              activeScenario === "negotiation" && isRunning
                ? "bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-950/50"
                : "bg-cyber-surface hover:bg-cyber-card border-cyber-border hover:border-purple-500/50"
            } disabled:opacity-50 disabled:cursor-not-allowed group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-105 transition-transform">
                <Handshake className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>🤝 Scenario 3: A2A Dynamic Negotiation & Staked SLA</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-600/40">ERC-8004</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  0.05 ➔ 0.03 USDC (40% discount) · Signed EIP-712 · SLA Bond
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
          </button>

        </div>
      </div>

      {/* 8-Step Pipeline Visualizer */}
      <div className="p-4 rounded-xl bg-cyber-card border border-cyber-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            8-Step Security Pipeline Telemetry
          </span>
          <span className="text-[10px] font-mono text-slate-500">x402 v2 Spec</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {pipeline.map((step) => {
            let badgeClass = "bg-slate-900/50 border-slate-800 text-slate-500";
            if (step.status === "active") badgeClass = "bg-blue-950/70 border-blue-500 text-blue-300 shadow-md shadow-blue-950 animate-pulse";
            if (step.status === "success") badgeClass = "bg-emerald-950/60 border-emerald-500/60 text-emerald-300";
            if (step.status === "blocked") badgeClass = "bg-rose-950/80 border-rose-500 text-rose-300 animate-bounce";

            return (
              <div
                key={step.id}
                className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${badgeClass}`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] mb-1">
                  <span>Step {step.id}</span>
                  {step.status === "success" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  {step.status === "blocked" && <XCircle className="w-3 h-3 text-rose-400" />}
                </div>
                <div className="font-bold text-[11px] truncate">{step.name}</div>
                <div className="text-[9px] text-slate-400 truncate mt-0.5">{step.subtext}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Agent Logs Console */}
      <div className="p-3.5 rounded-xl bg-[#04060b] border border-cyber-border font-mono text-xs">
        <div className="flex items-center justify-between mb-2 text-slate-400 border-b border-slate-800/80 pb-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold">
            <Terminal className="w-3.5 h-3.5 text-cathay-emerald" />
            Live Guardrail Audit Stream
          </span>
          <span className="text-[10px] text-emerald-400">Listening to Sentinel Bus</span>
        </div>
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {logs.slice(-6).map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] leading-tight">
              <span className="text-slate-500 shrink-0">{log.time}</span>
              <span
                className={
                  log.type === "error"
                    ? "text-rose-400 font-semibold"
                    : log.type === "success"
                    ? "text-emerald-400 font-semibold"
                    : log.type === "warn"
                    ? "text-amber-300"
                    : "text-slate-300"
                }
              >
                {log.text}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
