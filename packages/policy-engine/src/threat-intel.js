import { createHash } from "node:crypto";
const SENSITIVE_KEY = /(private.?key|secret|password|authorization|cookie|token|signature|seed|mnemonic|api.?key)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
function digest(value) {
    const canonical = JSON.stringify(value, Object.keys(value).sort(), (_, item) => typeof item === "bigint" ? item.toString() : item);
    return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}
function uuidFrom(value) {
    const bytes = Buffer.from(value.replace(/^0x/, "").padEnd(64, "0").slice(0, 64), "hex");
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function stixId(type, seed) { return `${type}--${uuidFrom(digest(`${type}:${seed}`))}`; }
function sanitize(value, key = "") {
    if (SENSITIVE_KEY.test(key))
        return "[REDACTED]";
    if (typeof value === "string")
        return value.replace(BEARER, "Bearer [REDACTED]").replace(EMAIL, "[REDACTED_EMAIL]").slice(0, 4_096);
    if (typeof value === "bigint")
        return value.toString();
    if (Array.isArray(value))
        return value.slice(0, 100).map((item) => sanitize(item, key));
    if (value && typeof value === "object") {
        const result = {};
        for (const [childKey, childValue] of Object.entries(value).slice(0, 100))
            result[childKey] = sanitize(childValue, childKey);
        return result;
    }
    return value;
}
function attackType(input) {
    const text = [input.attackType, input.type, input.owasp, input.code, input.message].filter(Boolean).join(" ").toLowerCase();
    if (text.includes("homograph") || text.includes("hijack") || text.includes("spoof") || text.includes("domain"))
        return "homograph_hijack";
    if (text.includes("micro") || text.includes("drain") || text.includes("velocity") || text.includes("budget"))
        return "micro_drain";
    return "prompt_injection";
}
function category(type) {
    return type === "prompt_injection" ? "ASI01" : type === "homograph_hijack" ? "ASI02" : "ASI03";
}
function severity(type) { return type === "micro_drain" ? "critical" : "high"; }
/**
 * Converts policy detections to a local, sanitized STIX 2.1 feed. Reports are
 * internal by default: this class has no network exporter and retains no raw
 * payload, which prevents a hostile merchant response becoming a data leak.
 */
export class ThreatIntelReporter {
    reports = [];
    sourceName;
    constructor(options = {}) { this.sourceName = options.sourceName ?? "IntentSentinel"; }
    report(input) {
        const event = input;
        const type = attackType(event);
        const observedAt = new Date((event.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
        if (Number.isNaN(observedAt.getTime()))
            throw new TypeError("Threat timestamp is invalid");
        const sanitized = {
            ...(event.message ? { message: String(sanitize(event.message)) } : {}),
            ...(event.evidence !== undefined ? { evidence: sanitize(event.evidence) } : {}),
            ...(event.proposedFields ? { proposed_fields: sanitize(event.proposedFields) } : {}),
            ...(event.trustedFields ? { trusted_fields: sanitize(event.trustedFields) } : {}),
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
        const indicator = {
            type: "indicator", spec_version: "2.1", id: indicatorId, created, modified: created,
            name: `OWASP ${category(type)} ${type.replaceAll("_", " ")}`,
            description: "Sanitized IntentSentinel policy detection; raw evidence remains quarantined internally.",
            pattern: `[artifact:payload_bin MATCHES '${category(type)}']`, pattern_type: "stix",
            valid_from: created, confidence: Math.round((Math.min(1, Math.max(0, event.confidence ?? 0.95))) * 100),
            labels: ["intent-sentinel", "owasp-agentic-security", category(type), type],
            created_by_ref: sourceId,
            "x_evidence_sha256": evidenceHash,
        };
        const source = {
            type: "identity", spec_version: "2.1", id: sourceId, created, modified: created,
            name: this.sourceName, identity_class: "system",
        };
        const note = {
            type: "note", spec_version: "2.1", id: noteId, created, modified: created,
            content: JSON.stringify({ report_id: reportId, owasp_category: category(type), attack_type: type, evidence_hash: evidenceHash, sanitized }),
            object_refs: [indicatorId], created_by_ref: sourceId,
        };
        const stix = { type: "bundle", id: `bundle--${uuidFrom(digest(reportId))}`, spec_version: "2.1", objects: [source, indicator, note] };
        const result = {
            report_id: reportId, attack_type: type, owasp_category: category(type), severity: severity(type),
            confidence: Math.min(1, Math.max(0, event.confidence ?? 0.95)), observed_at: created, evidence_hash: evidenceHash,
            sanitized, stix, json: JSON.stringify(stix),
        };
        this.reports.push(result);
        return result;
    }
    reportViolation(input) { return this.report(input); }
    /** Return a bundle containing all reports created by this instance. */
    feed() {
        const objects = this.reports.flatMap((report) => report.stix.objects);
        return { type: "bundle", id: `bundle--${uuidFrom(digest(objects))}`, spec_version: "2.1", objects };
    }
    listReports() { return this.reports.map((report) => ({ ...report, sanitized: { ...report.sanitized }, stix: { ...report.stix, objects: [...report.stix.objects] } })); }
}
