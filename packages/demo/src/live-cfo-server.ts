import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

export type CfoMode = "live" | "mock" | "shadow";
export type CfoSeverity = "info" | "warning" | "critical";

export interface SentinelEvent {
  schemaVersion: 1;
  eventId: string;
  sequence: number;
  occurredAt: string;
  correlationId: string;
  taskId?: string;
  intentHash?: string;
  mode: CfoMode;
  type: string;
  severity: CfoSeverity;
  payload: Record<string, unknown>;
  previousEventHash: string;
  eventHash: string;
}

export interface SentinelEventInput {
  correlationId: string;
  taskId?: string;
  intentHash?: string;
  mode?: CfoMode;
  type: string;
  severity?: CfoSeverity;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export interface CfoBudget {
  budget: string;
  reserved: string;
  committed: string;
  blocked: string;
  available: string;
}

export interface CfoSnapshot {
  mode: CfoMode;
  budget: CfoBudget;
  negotiatedSavings: string;
  transactions: Array<{
    id: string;
    status: string;
    amount: string;
    txHash?: string;
    explorerUrl?: string;
  }>;
  alerts: Array<{ severity: CfoSeverity; message: string; evidenceHash?: string }>;
  selectedRoute?: Record<string, unknown>;
  trust?: Record<string, unknown>;
  events: SentinelEvent[];
}

export interface LiveCfoServerOptions {
  host?: string;
  port?: number;
  mode?: CfoMode;
  budget?: string;
  now?: () => Date;
}

export interface LiveCfoServerAddress {
  host: string;
  port: number;
  httpUrl: string;
  webSocketUrl: string;
}

const BASE_SEPOLIA = "eip155:84532";
const BASESCAN_TX = "https://sepolia.basescan.org/tx/";
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function stable(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stable(entry)]));
  }
  return value;
}

function hash(value: unknown): string {
  return `0x${createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/private.?key|secret|raw.?prompt|full.?signature|authorization.?header|token/i.test(key)) return [key, "[REDACTED]"];
    return [key, redact(entry)];
  }));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(encoded);
}

function frame(text: string, opcode = 0x1): Buffer {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
  if (payload.length < 65_536) {
    const header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2);
  return Buffer.concat([header, payload]);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function initialJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function basescanUrl(txHash: string, network = BASE_SEPOLIA, verifiedLiveReceipt = false): string | undefined {
  if (!verifiedLiveReceipt || network !== BASE_SEPOLIA || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return undefined;
  return `${BASESCAN_TX}${txHash}`;
}

export const getBasescanUrl = basescanUrl;

function amount(value: unknown): bigint {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : 0n;
}

function renderBar(numerator: bigint, denominator: bigint, width = 28): string {
  if (denominator <= 0n) return "!".repeat(width);
  const filled = Math.min(width, Number((numerator * BigInt(width)) / denominator));
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

export function renderCfoTui(snapshot: CfoSnapshot): string {
  const budget = BigInt(snapshot.budget.budget);
  const committed = BigInt(snapshot.budget.committed);
  const lines = [
    "+------------------------------------------------------------------------------+",
    `| CATHAY INTENTSENTINEL CFO COMMAND CENTER   ${snapshot.mode.toUpperCase().padEnd(8)}                 |`,
    `| Budget ${renderBar(committed, budget)} ${snapshot.budget.committed} committed / ${snapshot.budget.budget} USDC units |`,
    `| Available ${snapshot.budget.available}  Reserved ${snapshot.budget.reserved}  Blocked ${snapshot.budget.blocked}             |`,
    `| Negotiated savings: ${snapshot.negotiatedSavings} USDC units                                   |`,
    "+------------------------------------------------------------------------------+",
    "| PAYMENT TIMELINE                                                            |",
  ];
  for (const event of snapshot.events.slice(-8)) lines.push(`| ${String(event.sequence).padStart(3)} ${event.type.padEnd(28).slice(0, 28)} ${String(event.payload.message ?? "").padEnd(39).slice(0, 39)} |`);
  if (!snapshot.events.length) lines.push("| (waiting for events)                                                         |");
  lines.push("+------------------------------------------------------------------------------+");
  lines.push("| THREAT INTELLIGENCE                                                         |");
  for (const alert of snapshot.alerts.slice(-4)) lines.push(`| [${alert.severity.toUpperCase()}] ${alert.message.padEnd(67).slice(0, 67)} |`);
  if (!snapshot.alerts.length) lines.push("| [INFO] No active threat alerts                                               |");
  lines.push("+------------------------------------------------------------------------------+");
  return lines.join("\n");
}

function dashboardHtml(snapshot: CfoSnapshot, wsPath: string): string {
  const safeSnapshot = initialJson(snapshot);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IntentSentinel Live CFO Dashboard</title><style>
:root{color-scheme:dark;--bg:#09121f;--card:#101f31;--line:#29425f;--cyan:#62d8ff;--green:#69e0a0;--amber:#ffc857;--red:#ff7185}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#09121f,#10263d);font:14px system-ui;color:#e8f1fa}main{max-width:1180px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.badge{padding:8px 12px;border:1px solid var(--green);border-radius:99px;color:var(--green);font-weight:700}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0}.card{background:#101f31cc;border:1px solid var(--line);border-radius:12px;padding:16px;box-shadow:0 12px 30px #0003}.label{color:#8fa8c1;text-transform:uppercase;font-size:11px;letter-spacing:.08em}.value{font-size:24px;margin-top:8px;color:var(--cyan)}.progress{height:12px;background:#20334a;border-radius:8px;overflow:hidden;margin-top:12px}.fill{height:100%;background:linear-gradient(90deg,var(--green),var(--cyan));width:0;transition:width .3s}.cols{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}.row{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #20364e;padding:10px 0}.timeline{max-height:380px;overflow:auto}.event{font-family:ui-monospace,monospace;font-size:12px}.ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}a{color:var(--cyan)}@media(max-width:800px){.grid,.cols{grid-template-columns:1fr 1fr}.cols{display:block}.card{margin-bottom:14px}}
</style></head><body><main><div class="top"><div><div class="label">IntentSentinel</div><h1>Live CFO Command Center</h1></div><div id="mode" class="badge">CONNECTING</div></div>
<div class="grid"><section class="card"><div class="label">Committed spend</div><div id="committed" class="value">0</div><div id="bar" class="progress"><div class="fill"></div></div><small id="budgetText"></small></section><section class="card"><div class="label">Available / reserved</div><div id="available" class="value">0</div><small id="reserved"></small></section><section class="card"><div class="label">Negotiated savings</div><div id="savings" class="value">0</div><small>USDC atomic units</small></section><section class="card"><div class="label">Threat alerts</div><div id="alertCount" class="value">0</div><small>redacted intelligence feed</small></section></div>
<div class="cols"><section class="card"><div class="label">Ordered payment timeline</div><div id="timeline" class="timeline"></div></section><section class="card"><div class="label">Security and receipts</div><div id="alerts"></div></section></div></main>
<script>const state=${safeSnapshot};const byId=(id)=>document.getElementById(id);function n(v){try{return BigInt(v||0)}catch{return 0n}}function apply(e){state.events.push(e);const p=e.payload||{};if(e.type==='budget.reserved')state.budget.reserved=(n(state.budget.reserved)+n(p.amount)).toString();if(e.type==='budget.committed'){state.budget.reserved=(n(state.budget.reserved)-n(p.amount)).toString();state.budget.committed=(n(state.budget.committed)+n(p.amount)).toString()}if(e.type==='budget.released')state.budget.reserved=(n(state.budget.reserved)-n(p.amount)).toString();if(e.type==='negotiation.accepted')state.negotiatedSavings=String(p.savings||state.negotiatedSavings);if(e.type.startsWith('security.')||e.type.startsWith('threat.'))state.alerts.push({severity:e.severity,message:String(p.message||e.type),evidenceHash:p.evidenceHash});render()}function render(){const b=n(state.budget.budget),c=n(state.budget.committed);byId('mode').textContent=state.mode.toUpperCase()+(state.mode==='mock'?' · SIMULATED':'');byId('committed').textContent=String(c);byId('available').textContent=String(b-c-n(state.budget.reserved));byId('reserved').textContent='Reserved '+state.budget.reserved+' · Budget '+state.budget.budget;byId('savings').textContent=state.negotiatedSavings;byId('alertCount').textContent=String(state.alerts.length);byId('budgetText').textContent='USDC atomic units';byId('bar').firstElementChild.style.width=(b?Number(c*100n/b):0)+'%';const timeline=byId('timeline');timeline.replaceChildren(...state.events.slice(-30).reverse().map(e=>{const d=document.createElement('div');d.className='row event';const left=document.createElement('span');left.textContent='#'+e.sequence+' '+e.type;const right=document.createElement('span');right.textContent=String(e.payload?.message||e.occurredAt);right.className=e.severity==='critical'?'bad':e.severity==='warning'?'warn':'ok';if(typeof e.payload?.explorerUrl==='string'&&e.payload.explorerUrl.startsWith('https://sepolia.basescan.org/tx/')){const link=document.createElement('a');link.href=e.payload.explorerUrl;link.target='_blank';link.rel='noreferrer';link.textContent=' · Basescan';right.append(link)}d.append(left,right);return d}));const alerts=byId('alerts');alerts.replaceChildren(...state.alerts.slice(-12).reverse().map(a=>{const d=document.createElement('div');d.className='row';const text=document.createElement('span');text.textContent=a.message;text.className=a.severity==='critical'?'bad':a.severity==='warning'?'warn':'ok';d.append(text);if(a.evidenceHash){const code=document.createElement('small');code.textContent=a.evidenceHash.slice(0,18)+'…';d.append(code)}return d}))}render();const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'${wsPath}?since='+state.events.length);ws.onopen=()=>byId('mode').dataset.connected='true';ws.onmessage=(m)=>{try{const e=JSON.parse(m.data);if(e.eventHash)apply(e)}catch{}};ws.onclose=()=>byId('mode').textContent+=' · RECONNECTING';</script></body></html>`;
}

export class LiveCfoServer {
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly now: () => Date;
  private readonly initialMode: CfoMode;
  private readonly budgetLimit: string;
  private readonly server: Server;
  private readonly clients = new Set<Duplex>();
  private readonly listeners = new Set<(event: SentinelEvent) => void>();
  private readonly log: SentinelEvent[] = [];
  private lastEventHash = "0x" + "00".repeat(32);
  private addressInfo: LiveCfoServerAddress | undefined;

  public constructor(options: LiveCfoServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 4040;
    this.initialMode = options.mode ?? "mock";
    this.budgetLimit = options.budget ?? "1000000";
    this.now = options.now ?? (() => new Date());
    this.server = createServer((request, response) => this.handleHttp(request, response));
    this.server.on("upgrade", (request, socket) => this.handleUpgrade(request, socket));
  }

  public async start(): Promise<LiveCfoServerAddress> {
    if (this.addressInfo) return this.addressInfo;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { this.server.off("listening", onListening); reject(error); };
      const onListening = () => { this.server.off("error", onError); resolve(); };
      this.server.once("error", onError); this.server.once("listening", onListening); this.server.listen(this.requestedPort, this.host);
    });
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("CFO server did not expose a TCP address");
    this.addressInfo = { host: this.host, port: address.port, httpUrl: `http://${this.host}:${address.port}`, webSocketUrl: `ws://${this.host}:${address.port}/ws` };
    return this.addressInfo;
  }

  public async stop(): Promise<void> {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    if (!this.addressInfo) return;
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    this.addressInfo = undefined;
  }

  public get address(): LiveCfoServerAddress | undefined { return this.addressInfo; }
  public get events(): SentinelEvent[] { return this.log.map((event) => structuredClone(event)); }

  public subscribe(listener: (event: SentinelEvent) => void): () => void {
    this.listeners.add(listener); return () => this.listeners.delete(listener);
  }

  public getEvents(since = 0): SentinelEvent[] { return this.log.filter((event) => event.sequence > since).map((event) => structuredClone(event)); }

  public publish(input: SentinelEventInput): SentinelEvent {
    const mode = input.mode ?? this.initialMode;
    const payload = redact(input.payload ?? {}) as Record<string, unknown>;
    const txHash = typeof payload.txHash === "string" ? payload.txHash : undefined;
    if (!payload.explorerUrl && txHash) {
      const explorer = basescanUrl(txHash, typeof payload.network === "string" ? payload.network : BASE_SEPOLIA, mode === "live" && (payload.verified === true || payload.receiptVerified === true));
      if (explorer) payload.explorerUrl = explorer;
    }
    const draft = {
      schemaVersion: 1 as const, eventId: randomUUID(), sequence: this.log.length + 1, occurredAt: input.occurredAt ?? this.now().toISOString(), correlationId: input.correlationId,
      ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.intentHash ? { intentHash: input.intentHash } : {}), mode, type: input.type, severity: input.severity ?? "info", payload, previousEventHash: this.lastEventHash,
    } satisfies Omit<SentinelEvent, "eventHash">;
    const event = { ...draft, eventHash: hash(draft) };
    this.lastEventHash = event.eventHash; this.log.push(event);
    for (const listener of this.listeners) { try { listener(structuredClone(event)); } catch { /* observers cannot affect the audit stream */ } }
    const encoded = JSON.stringify(event);
    for (const client of this.clients) { try { client.write(frame(encoded)); } catch { client.destroy(); } }
    return structuredClone(event);
  }

  public publishEvent(input: SentinelEventInput): SentinelEvent { return this.publish(input); }

  public snapshot(): CfoSnapshot {
    let reserved = 0n, committed = 0n, blocked = 0n, savings = 0n;
    const transactions = new Map<string, CfoSnapshot["transactions"][number]>();
    const alerts: CfoSnapshot["alerts"] = [];
    let selectedRoute: Record<string, unknown> | undefined;
    let trust: Record<string, unknown> | undefined;
    for (const event of this.log) {
      const p = event.payload;
      if (event.type === "budget.reserved") reserved += amount(p.amount);
      if (event.type === "budget.committed") { const value = amount(p.amount); reserved = reserved >= value ? reserved - value : 0n; committed += value; }
      if (event.type === "budget.released") { const value = amount(p.amount); reserved = reserved >= value ? reserved - value : 0n; }
      if (event.type === "budget.blocked" || event.type === "policy.denied") blocked += amount(p.amount);
      if (event.type === "negotiation.accepted") savings = amount(p.savings);
      if (event.type === "route.selected") selectedRoute = p;
      if (event.type === "trust.decision") trust = p;
      if (event.type.startsWith("payment.")) {
        const id = String(p.transactionId ?? event.correlationId);
        const prior = transactions.get(id) ?? { id, status: "pending", amount: typeof p.amount === "string" ? p.amount : "0" };
        const next = { ...prior, status: event.type.slice("payment.".length), ...(typeof p.amount === "string" ? { amount: p.amount } : {}), ...(typeof p.txHash === "string" ? { txHash: p.txHash } : {}), ...(typeof p.explorerUrl === "string" ? { explorerUrl: p.explorerUrl } : {}) };
        transactions.set(id, next);
      }
      if (event.type.startsWith("security.") || event.type.startsWith("threat.")) alerts.push({ severity: event.severity, message: String(p.message ?? event.type), ...(typeof p.evidenceHash === "string" ? { evidenceHash: p.evidenceHash } : {}) });
    }
    const budget = BigInt(this.budgetLimit);
    const available = budget > committed + reserved ? budget - committed - reserved : 0n;
    return { mode: this.initialMode, budget: { budget: budget.toString(), reserved: reserved.toString(), committed: committed.toString(), blocked: blocked.toString(), available: available.toString() }, negotiatedSavings: savings.toString(), transactions: [...transactions.values()], alerts, ...(selectedRoute ? { selectedRoute } : {}), ...(trust ? { trust } : {}), events: this.events };
  }

  public renderTui(): string { return renderCfoTui(this.snapshot()); }
  public printTui(): void { process.stdout.write(`${this.renderTui()}\n`); }

  private handleHttp(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", `http://${this.host}`);
    if (url.pathname === "/healthz") { json(response, 200, { ok: true, mode: this.initialMode, sequence: this.log.length }); return; }
    if (url.pathname === "/events") { json(response, 200, this.getEvents(Number(url.searchParams.get("since") ?? "0"))); return; }
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      const body = dashboardHtml(this.snapshot(), "/ws"); response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(body); return;
    }
    json(response, 404, { error: "not_found" });
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex): void {
    const url = new URL(request.url ?? "/", `http://${this.host}`);
    const key = request.headers["sec-websocket-key"];
    if (url.pathname !== "/ws" || typeof key !== "string") { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); return; }
    const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket)); socket.on("error", () => this.clients.delete(socket));
    socket.on("data", (data: Buffer) => { const opcode = data[0] && (data[0] & 0x0f); if (opcode === 0x8) socket.end(); else if (opcode === 0x9) socket.write(frame("", 0xA)); });
    for (const event of this.getEvents(Number(url.searchParams.get("since") ?? "0"))) socket.write(frame(JSON.stringify(event)));
  }
}
