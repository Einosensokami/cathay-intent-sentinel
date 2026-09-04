# IntentSentinel production operations

This runbook covers the frontend container and the facilitator API. The
facilitator package is a library: `infra/facilitator-server.mjs` is the
deployment wrapper and requires a production adapter for the signer, balance
reader, and durable nonce store.

## Service topology

```text
browser -> TLS/reverse proxy -> frontend (nginx:8080)
                         \-> facilitator API (8081) -> policy boundary
                                                        \-> RPC provider
                                                        \-> KMS/HSM signer
                                                        \-> durable nonce/audit stores
```

Terminate TLS at the managed ingress, keep the API private where possible,
and allow the browser origin only through the authenticated API gateway. Do
not expose an RPC endpoint, signer, nonce store, or audit database directly to
the browser.

## Configuration

Start from [`infra/.env.example`](../infra/.env.example) and
[`infra/.env.frontend.example`](../infra/.env.frontend.example). Templates are
placeholders only. Populate production values through the platform secret
manager or workload identity, never through a committed file or a Docker
build argument.

`FACILITATOR_ADAPTER_MODULE` must point to an adapter supplied by the
deployment image or secret-mounted runtime. The adapter must use KMS/HSM or a
remote signer and a transactional, durable nonce/idempotency store. A raw
private key or mnemonic is not an accepted production configuration.

The compose file is a local smoke-test profile. Its explicit
`FACILITATOR_RUNTIME_MODE=mock` setting creates no real settlement and must
not be promoted to staging or production.

## Build and deploy

```sh
docker compose -f infra/docker-compose.yml build --pull
docker compose -f infra/docker-compose.yml up -d
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8081/healthz
curl -fsS http://127.0.0.1:8081/readyz
```

For production, build the two images from the repository root, scan and sign
them, pin the image digest, and deploy with:

- API `FACILITATOR_RUNTIME_MODE=production` and a supplied adapter module.
- API readiness gated on `/readyz`; liveness uses `/healthz`.
- frontend liveness gated on `/healthz`.
- a private API listener behind the ingress and an allowlisted frontend
  origin.
- rolling deployment only after nonce-store migrations and a reconciliation
  check have completed.

The API wrapper intentionally reports readiness failure when a production
adapter is missing. This prevents an apparently healthy process from being
used without its signing and settlement dependencies.

## Container and host hardening

- Both images run as non-root users. Keep `read_only` filesystems,
  `no-new-privileges`, dropped Linux capabilities, and small writable `tmpfs`
  mounts enabled.
- Pin base image versions and rebuild for security updates. Generate an SBOM
  and retain image scan results with the release record.
- Set CPU, memory, file-descriptor, and request timeouts at the ingress and
  workload level. Keep the facilitator body limit at 1 MiB unless a reviewed
  change updates the threat model and tests.
- Egress allowlist the RPC, KMS/HSM, telemetry, and approved trust-registry
  endpoints. Deny arbitrary outbound connections from the frontend.
- Use a separate service account per environment. No shell access or broad
  cloud permissions are required by the frontend.

## Health, telemetry, and alerts

`/healthz` is liveness only and must not perform an RPC call. `/readyz` is the
readiness gate and must be false until the production adapter and durable
stores are available. Alert on readiness failures, signature/verification
failures, nonce-store errors, repeated 4xx/5xx responses, rate-limit rejects,
unknown settlement outcomes, and reconciliation backlog.

Log structured event IDs, tenant ID, request correlation ID, idempotency key
hash, policy decision, and settlement status. Never log authorization payloads,
signatures, bearer tokens, cookies, private material, or raw merchant prompts.

## Timeout reconciliation

An RPC submit or confirmation timeout is an `unknown` outcome. It is not a
safe failure and must not be retried automatically with the same authorization
or nonce. Persist the idempotency key and nonce before submission, query the
transaction provider using a separately authorized reconciler, and resolve to
`settled` or `rejected` only after evidence is sufficient. Keep unknown records
visible to operations and block duplicate settlement while reconciliation is
pending.

## Incident response

1. Declare the incident, preserve correlation IDs and audit-chain evidence, and
   record the first known time window.
2. Disable the affected tenant, merchant, route, signer, or API credential at
   the narrowest boundary. Stop settlement traffic before rotating material.
3. Freeze automated retries and reconcile all `unknown` outcomes against the
   chain/RPC source of truth.
4. Rotate or revoke compromised credentials in KMS/HSM and the cloud IAM layer;
   do not paste secrets into tickets or chat.
5. Scope affected tenants and transactions from immutable audit records,
   notify the incident owner and required stakeholders, then preserve a
   read-only copy for investigation.
6. Restore from a known-good image/configuration, run the security checklist,
   and document root cause, indicators, containment, and follow-up controls.

See [`SECURITY.md`](../SECURITY.md) for the release gate and control checklist.
