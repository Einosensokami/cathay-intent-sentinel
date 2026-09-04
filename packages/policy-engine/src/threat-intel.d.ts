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
/**
 * Converts policy detections to a local, sanitized STIX 2.1 feed. Reports are
 * internal by default: this class has no network exporter and retains no raw
 * payload, which prevents a hostile merchant response becoming a data leak.
 */
export declare class ThreatIntelReporter {
    private readonly reports;
    private readonly sourceName;
    constructor(options?: {
        sourceName?: string;
    });
    report(input: InterceptedOwaspViolation | RuleViolation): ThreatIntelReport;
    reportViolation(input: InterceptedOwaspViolation | RuleViolation): ThreatIntelReport;
    /** Return a bundle containing all reports created by this instance. */
    feed(): StixBundle;
    listReports(): readonly ThreatIntelReport[];
}
