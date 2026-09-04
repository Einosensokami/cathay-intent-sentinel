import { createHash } from "node:crypto";
import type { RuleViolation } from "./rules.js";

export type ThreatAttackType = "prompt_injection" | "homograph_hijack" | "micro_drain";

export interface InterceptedOwaspViolation {
  attackType?: ThreatAttackType | string;
  type?: ThreatAttackType | string;
  owasp?: string;
  code?: string;
  message?: string;
  evidence?: unknown;
  proposedFields?: Record<string, unknown>;
  trustedFields?: Record<string, unknown>;
  merchantUrl?: string;
  merchantWallet?: string;
  agentId?: string;
  timestamp?: number;
  confidence?: number;
}

export interface ThreatViolationContext {
  taskId?: string;
  merchantUrl?: string;
  payeeAddress?: string;
  agentId?: string;
  evidence?: unknown;
  timestamp?: number;
}

export interface ThreatIntelReport {
  report_id: string;
  attack_type: ThreatAttackType;
  owasp_category: "ASI01" | "ASI02" | "ASI03";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  observed_at: string;
  evidence_hash: string;
  sanitized: {
    message?: string;
    evidence?: unknown;
    proposed_fields?: Record<string, unknown>;
    trusted_fields?: Record<string, unknown>;
    merchant_url?: string;
    merchant_wallet?: string;
    agent_id?: string;
  };
  stix: StixBundle;
  json: string;
}

export interface StixObject {
  type: string;
  spec_version: "2.1";
  id: string;
  created: string;
  modified: string;
  [key: string]: unknown;
}

export interface StixBundle {
  type: "bundle";
  id: string;
  spec_version: "2.1";
  objects: StixObject[];
}

const SENSITIVE_KEY = /(private.?key|secret|password|authorization|cookie|token|signature|seed|mnemonic|api.?key)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

function digest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key: string, item: unknown) => typeof item === "bigint" ? item.toString() : item);
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}

function uuidFrom(value: string): string {
  const bytes = Buffer.from(value.replace(/^0x/, "").padEnd(64, "0").slice(0, 64), "hex");
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function stixId(type: string, seed: string): string { return `${type}--${uuidFrom(digest(`${type}:${seed}`))}`; }

function sanitize(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return value.replace(BEARER, "Bearer [REDACTED]").replace(EMAIL, "[REDACTED_EMAIL]").slice(0, 4_096);
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, key));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 100)) result[childKey] = sanitize(childValue, childKey);
    return result;
  }
  return value;
}

function attackType(input: InterceptedOwaspViolation): ThreatAttackType {
  const text = [input.attackType, input.type, input.owasp, input.code, input.message].filter(Boolean).join(" ").toLowerCase();
  if (text.includes("homograph") || text.includes("hijack") || text.includes("spoof") || text.includes("domain")) return "homograph_hijack";
  if (text.includes("micro") || text.includes("drain") || text.includes("velocity") || text.includes("budget")) return "micro_drain";
  return "prompt_injection";
}

function category(type: ThreatAttackType): "ASI01" | "ASI02" | "ASI03" {
  return type === "prompt_injection" ? "ASI01" : type === "homograph_hijack" ? "ASI02" : "ASI03";
}

function severity(type: ThreatAttackType): ThreatIntelReport["severity"] { return type === "micro_drain" ? "critical" : "high"; }

/**
 * Converts policy detections to a local, sanitized STIX 2.1 feed. Reports are
 * internal by default: this class has no network exporter and retains no raw
 * payload, which prevents a hostile merchant response becoming a data leak.
 */
export class ThreatIntelReporter {
  private readonly reports: ThreatIntelReport[] = [];
  private readonly sourceName: string;

  constructor(options: { sourceName?: string } = {}) { this.sourceName = options.sourceName ?? "IntentSentinel"; }

  report(input: InterceptedOwaspViolation | RuleViolation): ThreatIntelReport {
    const event: InterceptedOwaswapped = input as InterceptedOwaswapped;
    const type = attackType(event);
    const observedAt = new Date((event.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
    if (Number.isNaN(observedAt.getTime())) throw new TypeError("Threat timestamp is invalid");
    const sanitized = {
      ...(event.message ? { message: String(sanitize(event.message)) } : {}),
      ...(event.evidence !== undefined ? { evidence: sanitize(event.evidence) } : {}),
      ...(event.proposedFields ? { proposed_fields: sanitize(event.proposedFields) as Record<string, unknown> } : {}),
      ...(event.trustedFields ? { trusted_fields: sanitize(event.trustedFields) as Record<string, unknown> } : {}),
      ...(event.merchantUrl ? { merchant_url: String(sanitize(event.merchantUrl)) } : {}),
      ...(event.merchantWallet ? { merchant_wallet: String(sanitize(event.merchantWallet)) } : {}),
      ...(event.agentId ? { agent_id: String(sanitize(event.agentId)) } : {}),
    };
    const evidenceHash = digest(sanitized);
    const seed = `${type}:${evidenceHash}:${observedAt.toISOString()}`;
    const reportId = stixId("x-intent-sentinel-report", seed);
    const created = observedAt.toISOString();
    const sourceId = stixId("identity", this.sourceName);
    const indicatorId = stixId("indicator", seed);
    const noteId = stixId("note", seed);
    const indicator: StixObject = {
      type: "indicator", spec_version: "2.1", id: indicatorId, created, modified: created,
      name: `OWASP ${category(type)} ${type.replaceAll("_", " ")}`,
      description: "Sanitized IntentSentinel policy detection; raw evidence remains quarantined internally.",
      pattern: event.merchantUrl ? `[url:value = '${event.merchantUrl.replaceAll("'", "\\'")}']` : `[artifact:payload_bin MATCHES '${category(type)}']`, pattern_type: "stix",
      valid_from: created, confidence: Math.round((Math.min(1, Math.max(0, event.confidence ?? 0.95))) * 100),
      labels: ["intent-sentinel", "owasp-agentic-security", category(type), type],
      created_by_ref: sourceId,
      "x_evidence_sha256": evidenceHash,
    };
    const source: StixObject = {
      type: "identity", spec_version: "2.1", id: sourceId, created, modified: created,
      name: this.sourceName, identity_class: "system",
    };
    const note: StixObject = {
      type: "note", spec_version: "2.1", id: noteId, created, modified: created,
      content: JSON.stringify({ report_id: reportId, owasp_category: category(type), attack_type: type, evidence_hash: evidenceHash, sanitized }),
      object_refs: [indicatorId], created_by_ref: sourceId,
    };
    const stix: StixBundle = { type: "bundle", id: `bundle--${uuidFrom(digest(reportId))}`, spec_version: "2.1", objects: [indicator, source, note] };
    const result: ThreatIntelReport = {
      report_id: reportId, attack_type: type, owasp_category: category(type), severity: severity(type),
      confidence: Math.min(1, Math.max(0, event.confidence ?? 0.95)), observed_at: created, evidence_hash: evidenceHash,
      sanitized, stix, json: JSON.stringify(stix),
    };
    this.reports.push(result);
    return result;
  }

  reportViolation(input: InterceptedOwaspViolation | RuleViolation): ThreatIntelReport { return this.report(input); }

  /** Legacy demo-friendly API returns the STIX bundle directly when context is supplied. */
  recordViolation(violation: InterceptedOwaspViolation | RuleViolation, context: ThreatViolationContext): StixBundle;
  recordViolation(violation: InterceptedOwaspViolation | RuleViolation): ThreatIntelReport;
  recordViolation(violation: InterceptedOwaspViolation | RuleViolation, context?: ThreatViolationContext): StixBundle | ThreatIntelReport {
    if (!context) return this.report(violation);
    const event = violation as InterceptedOwaspViolation;
    const enriched: InterceptedOwaspViolation = { ...event };
    const message = event.message ?? ("message" in violation ? violation.message : undefined);
    const merchantUrl = event.merchantUrl ?? context.merchantUrl;
    const merchantWallet = event.merchantWallet ?? context.payeeAddress;
    const agentId = event.agentId ?? context.agentId;
    const timestamp = event.timestamp ?? context.timestamp;
    const evidence = event.evidence ?? context.evidence;
    if (message !== undefined) enriched.message = message;
    if (merchantUrl !== undefined) enriched.merchantUrl = merchantUrl;
    if (merchantWallet !== undefined) enriched.merchantWallet = merchantWallet;
    if (agentId !== undefined) enriched.agentId = agentId;
    if (evidence !== undefined) enriched.evidence = evidence;
    else if (context.taskId !== undefined) enriched.evidence = { task_id: context.taskId };
    if (timestamp !== undefined) enriched.timestamp = timestamp;
    return this.report(enriched).stix;
  }

  /** Return a bundle containing all reports created by this instance. */
  feed(): StixBundle {
    const objects = this.reports.flatMap((report) => report.stix.objects);
    return { type: "bundle", id: `bundle--${uuidFrom(digest(objects))}`, spec_version: "2.1", objects };
  }

  listReports(): readonly ThreatIntelReport[] { return this.reports.map((report) => ({ ...report, sanitized: { ...report.sanitized }, stix: { ...report.stix, objects: [...report.stix.objects] } })); }
  getRecentReports(): readonly StixBundle[] { return this.reports.map((report) => report.stix); }
}

// RuleViolation intentionally has only code/message; this local structural
// type keeps the public overload useful without weakening the reporter API.
type InterceptedOwaswapped = InterceptedOwaspViolation & RuleViolation;
