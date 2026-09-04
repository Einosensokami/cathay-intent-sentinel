export type AlertSeverity = "info" | "warning" | "blocked";

export interface DashboardTransaction {
  id: string;
  scenario: string;
  merchant: string;
  amount: string;
  status: "pending" | "settled" | "blocked";
  txHash?: string;
}

export interface DefenseAlert {
  severity: AlertSeverity;
  message: string;
}

export interface DashboardState {
  transactions: DashboardTransaction[];
  spent: bigint;
  budget: bigint;
  alerts: DefenseAlert[];
}

const RESET = "\u001b[0m";
const CYAN = "\u001b[36m";
const GREEN = "\u001b[32m";
const YELLOW = "\u001b[33m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";

function color(value: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${value}${RESET}` : value;
}

function bar(spent: bigint, budget: bigint, width: number): string {
  if (budget <= 0n) return "!".repeat(width);
  const filled = Number((spent * BigInt(width)) / budget);
  return `${"█".repeat(Math.min(width, Math.max(0, filled)))}${"░".repeat(Math.max(0, width - filled))}`;
}

export function renderDashboard(state: DashboardState, useColor = Boolean(process.stdout.isTTY)): string {
  const spentPercent = state.budget > 0n ? Number((state.spent * 100n) / state.budget) : 100;
  const lines = [
    "╔══════════════════════════════════════════════════════════════════════════════╗",
    `║ ${color("CATHAY INTENTSENTINEL", CYAN, useColor)}  ${DIM}live payment defense console${RESET}                         ║`,
    "╠══════════════════════════════════════════════════════════════════════════════╣",
    `║ CFO BUDGET  ${color(bar(state.spent, state.budget, 28), spentPercent > 80 ? YELLOW : GREEN, useColor)}  ${state.spent.toString()} / ${state.budget.toString()} USDC units (${spentPercent}%) ║`,
    "╠══════════════════════════════════════════════════════════════════════════════╣",
    "║ TRANSACTIONS                                                               ║",
  ];
  for (const transaction of state.transactions.slice(-5)) {
    const status = transaction.status === "settled"
      ? color("SETTLED", GREEN, useColor)
      : transaction.status === "blocked"
        ? color("BLOCKED", RED, useColor)
        : color("PENDING", YELLOW, useColor);
    lines.push(`║ ${status.padEnd(useColor ? 18 : 7)} ${transaction.scenario.padEnd(19).slice(0, 19)} ${transaction.merchant.padEnd(20).slice(0, 20)} ${transaction.amount.padStart(8)} ║`);
    if (transaction.txHash) lines.push(`║    ${DIM}${transaction.txHash}${RESET}                                                   ║`);
  }
  if (!state.transactions.length) lines.push("║    (no transactions yet)                                                  ║");
  lines.push("╠══════════════════════════════════════════════════════════════════════════════╣");
  lines.push("║ DEFENSE ALERTS                                                              ║");
  for (const alert of state.alerts.slice(-4)) {
    const prefix = alert.severity === "blocked" ? "⛔" : alert.severity === "warning" ? "⚠" : "ℹ";
    lines.push(`║ ${prefix} ${alert.message.padEnd(70).slice(0, 70)} ║`);
  }
  if (!state.alerts.length) lines.push(`║ ${color("✓ Policy gate healthy — no alerts", GREEN, useColor).padEnd(useColor ? 88 : 48)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  return lines.join("\n");
}

export function printDashboard(state: DashboardState): void {
  if (process.stdout.isTTY) process.stdout.write("\u001b[2J\u001b[H");
  process.stdout.write(`${renderDashboard(state)}\n`);
}

export { LiveCfoServer, basescanUrl, getBasescanUrl, renderCfoTui } from "./live-cfo-server.js";
