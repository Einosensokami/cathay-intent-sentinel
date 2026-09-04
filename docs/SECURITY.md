# Security policy and production checklist

IntentSentinel handles payment authorizations and untrusted agent/merchant
content. Treat every deployment as a security boundary. The following checks
are release blockers unless an owner records an approved exception with an
expiry date.

## Release checklist

- [ ] Authentication is enforced at the API gateway and service boundary; all
      unauthenticated, malformed, expired, or unverifiable requests fail
      closed. Service-to-service credentials use short-lived workload identity
      or mTLS, and operator access uses phishing-resistant MFA.
- [ ] The authenticated tenant is derived from the verified identity, not from
      a request body or URL parameter. Every policy, budget, nonce,
      idempotency, audit, and reconciliation lookup is tenant-scoped, with
      negative cross-tenant tests and database-level isolation where available.
- [ ] CORS has an exact production-origin allowlist; no wildcard origin is
      combined with credentials. State-changing browser requests use CSRF
      protection (same-site cookies plus a CSRF token or a strict bearer-token
      API with no ambient cookies). Preflight and credential behavior are
      tested.
- [ ] Rate limiting is enforced per tenant, principal, IP, and sensitive
      operation. Separate limits protect verify, settle, reconciliation, and
      login endpoints; limits fail closed when the limiter store is
      unavailable.
- [ ] Signing keys never enter source control, images, environment templates,
      logs, browser bundles, or ordinary application memory longer than needed.
      Production signing is delegated to KMS/HSM or a remote signer with key
      usage policy, rotation, quorum/break-glass controls, and audit trails.
- [ ] RPC access uses an allowlist, TLS, bounded timeouts, response validation,
      and privacy-preserving request metadata. Do not send raw prompts,
      tenant data, signatures, or authorization payloads to an explorer,
      public RPC, analytics provider, or third-party threat feed.
- [ ] Audit events are append-only, hash-chained or stored in an equivalent
      tamper-evident system, tenant-scoped, access-controlled, and redacted.
      Define retention by legal and business need (the example is 2555 days),
      deletion/legal-hold behavior, and export access review.
- [ ] Timeout/unknown settlement outcomes persist the idempotency key and
      nonce, never auto-retry, and enter an explicit reconciliation queue.
      Reconciliation has an independent authority, bounded access, alerts,
      and a documented manual escalation path.
- [ ] No secrets are committed. CI runs whitespace and secret scanning on the
      repository and changed content. Review generated artifacts, Docker
      layers, lockfile diffs, crash dumps, and CI logs before release.
- [ ] Request body size, JSON shape, numeric ranges, URL schemes, network and
      asset allowlists, signature format, and idempotency-key length/charset
      are bounded before expensive work. Errors do not echo sensitive input.
- [ ] Mock/simulated receipts are explicitly labeled, use a non-explorer
      namespace, and cannot produce a block-explorer link. Live-to-mock
      fallback is forbidden after authorization or broadcast.

## Data handling

Raw prompts, payment signatures, authorization headers, private keys, bearer
tokens, cookies, and customer identifiers are sensitive. Keep raw hostile
content quarantined; publish only a redacted summary and a hash to the audit
or STIX feed. Redaction is defense in depth, not a substitute for access
control or encryption.

## Vulnerability reporting

Do not disclose exploitable details publicly before a fix is available. Report
security issues privately to the repository owner with a reproduction,
affected commit/environment, impact, and suggested containment. Never include
live credentials or payment signatures; revoke them immediately if exposed.
