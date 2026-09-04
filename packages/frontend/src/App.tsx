import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { RightPanel } from "./components/RightPanel";
import { StixModal } from "./components/StixModal";
import { TxReceiptModal } from "./components/TxReceiptModal";
import { ATTACK_THREAT, INITIAL_TRANSACTIONS, PIPELINE_TEMPLATE } from "./data";
import type { PipelineStep, RunState, Scenario, ThreatRecord, Transaction } from "./types";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const clock = () => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());

export default function App() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>(PIPELINE_TEMPLATE);
  const [balance, setBalance] = useState(9999.97);
  const [spent, setSpent] = useState(0.05);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [threat, setThreat] = useState<ThreatRecord | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<ThreatRecord | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const runToken = useRef(0);

  useEffect(() => () => { runToken.current += 1; }, []);
  const updateStep = useCallback((index: number, state: PipelineStep["state"]) => {
    setSteps((current) => current.map((step, position) => position === index ? { ...step, state } : step));
  }, []);

  const run = useCallback(async (next: Scenario) => {
    if (runState === "running") return;
    const token = ++runToken.current;
    setRunState("running"); setScenario(next); setThreat(null);
    setSteps(PIPELINE_TEMPLATE.map((step) => ({ ...step })));
    const stale = () => token !== runToken.current;
    const last = next === "attack" ? 3 : 7;

    for (let index = 0; index <= last; index += 1) {
      if (stale()) return;
      updateStep(index, "active");
      await wait(index === 3 ? 520 : 340);
      if (stale()) return;
      if (next === "attack" && index === 3) {
        updateStep(index, "blocked"); setRunState("blocked"); setThreat(ATTACK_THREAT);
        setTransactions((items) => [{ id: `DENY-${Math.floor(Math.random() * 9000 + 1000)}`, time: clock(), merchant: "Untrusted prompt payload", resource: "/v1/market-intel/q3", amount: "500.00 USDC", status: "blocked" }, ...items]);
        return;
      }
      updateStep(index, "complete");
    }

    const amount = next === "negotiation" ? 0.036 : 0.01;
    const hash = `0x${Array.from({ length: 64 }, (_, index) => "0123456789abcdef"[(index * 7 + token * 3) % 16]).join("")}`;
    const tx: Transaction = { id: `TX-${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0")}`, time: clock(), merchant: next === "negotiation" ? "DataMesh Agent" : "AlphaSense MCP", resource: next === "negotiation" ? "/a2a/credit-risk-stream" : "/v1/market-intel/q3", amount: `${amount.toFixed(3).replace(/0$/, "")} USDC`, status: "settled", txHash: hash, network: "Base Sepolia · 84532", block: `18,94${Math.floor(Math.random() * 900 + 100)}`, gasSponsored: true };
    setBalance((value) => value - amount); setSpent((value) => value + amount);
    setTransactions((items) => [tx, ...items]); setRunState("settled");
  }, [runState, updateStep]);

  const defending = runState === "blocked";
  return <div className="min-h-screen bg-cyber text-slate-300">
    <div className="ambient-grid" aria-hidden="true" />
    <Header balance={balance} defending={defending} />
    <main className="relative mx-auto max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-cathay-light">Treasury workspace / Live controls</p><h1 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-white sm:text-2xl">One intent. Every financial boundary enforced.</h1></div>
        <p className="max-w-md text-right text-[10px] leading-4 text-slate-600">The reasoning agent proposes. IntentSentinel decides. Custody only signs policy-approved payloads.</p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(390px,0.88fr)_minmax(560px,1.45fr)]"><LeftPanel runState={runState} activeScenario={scenario} steps={steps} onRun={run} /><RightPanel spent={spent} defending={defending} transactions={transactions} threat={threat} onInspectTx={setSelectedTx} onInspectThreat={setSelectedThreat} /></div>
    </main>
    <footer className="relative mx-auto flex max-w-[1600px] flex-wrap justify-between gap-2 border-t border-line/50 px-5 py-4 font-mono text-[9px] uppercase tracking-wider text-slate-700 lg:px-8"><span>IntentSentinel demo environment</span><span>No production funds · Base Sepolia testnet</span></footer>
    <StixModal threat={selectedThreat} onClose={() => setSelectedThreat(null)} /><TxReceiptModal transaction={selectedTx} onClose={() => setSelectedTx(null)} />
  </div>;
}
