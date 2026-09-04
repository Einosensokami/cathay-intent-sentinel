# IntentSentinel authenticated API/BFF boundary

This package is the production boundary for a tenant-scoped HTTP API. It is
implemented in `packages/api` and intentionally does not change the existing
facilitator, frontend, or root workspace configuration.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| GET | `/healthz` | public liveness |
| GET | `/readyz` | public dependency readiness |
| POST | `/api/v1/verify` | `agent`, `operator`, `auditor` |
| POST | `/api/v1/settle` | `agent`, `operator` |
| GET | `/api/v1/events` | `operator`, `auditor` |

Protected requests require `Authorization: Bearer <token>`. The default
development verifier reads `INTENT_SENTINEL_DEV_BEARER_TOKEN`; if it is absent,
all protected requests fail closed. It is a development adapter, not a JWT
implementation. Production injects a `BearerTokenVerifier` backed by the
organization's OIDC/JWT or mTLS boundary.

Every protected command includes an authenticated tenant boundary:

```json
{
  "tenantId": "tenant-cathay",
  "x402Id": "x402_01JABCDEF1234567",
  "paymentIntent": {
    "paymentIntentId": "pi_01JABCDEF1234567",
    "tenantId": "tenant-cathay",
    "taskId": "task-123",
    "resource": "https://merchant.example/resource",
    "payee": "0x0000000000000000000000000000000000000002",
    "maxAmount": "1000000",
    "asset": "0x0000000000000000000000000000000000000001",
    "network": "eip155:84532",
    "expiresAt": 1900000000
  },
  "paymentPayload": {
    "x402Version": 2,
    "accepted": {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "1000",
      "asset": "0x0000000000000000000000000000000000000001",
      "payTo": "0x0000000000000000000000000000000000000002",
      "maxTimeoutSeconds": 300
    },
    "payload": {
      "authorization": {
        "from": "0x0000000000000000000000000000000000000003",
        "to": "0x0000000000000000000000000000000000000002",
        "value": "1000",
        "validAfter": "1",
        "validBefore": "1900000000",
        "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
      },
      "signature": "0xsignature"
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "1000",
    "asset": "0x0000000000000000000000000000000000000001",
    "payTo": "0x0000000000000000000000000000000000000002",
    "maxTimeoutSeconds": 300
  }
}
```

Successful responses use `{ ok: true, requestId, correlationId, data }`.
Boundary failures use `{ ok: false, error: { code, message, requestId,
correlationId } }`; internal failures never expose adapter or credential
details.

`paymentIntentId` and `x402Id` are API-owned stable identifiers. They are
opaque, non-empty identifiers and should be persisted by clients; they are not
generated from a bearer token or request ID. Runtime validation also binds
asset, network, payee, amount, expiry, x402 version, accepted requirements,
and the ERC-3009 32-byte nonce.

## Settlement and replay rules

`POST /api/v1/settle` requires an ASCII `Idempotency-Key` header. The key is
scoped to `(tenantId, principal.subject)` and is bound to a canonical SHA-256
hash of the request. Reusing it for another request returns `409
idempotency_conflict`; replaying the same request returns the original result
with `Idempotency-Replayed: true`.

The injected `ReplayProtector` atomically claims the tenant/nonce pair before
settlement. Rejected settlement releases the claim. A settled or unknown
outcome retains it. An adapter exception also retains the claim because an
external transaction may have been broadcast; operators must reconcile the
idempotency record before retrying.

## Adapter boundary

`ApiAdapters` provides four injectable seams:

- `FacilitatorAdapter` maps to the existing Facilitator's verification and
  settlement methods.
- `PolicyAdapter` is the independent allow/deny boundary.
- `KeyVaultAdapter` reports custody readiness; signing remains outside this
  package.
- `EventAdapter` provides already-redacted, tenant-scoped audit events.

The default adapters are safe mocks. Their responses say `mode: "mock"`,
`simulated: true`, and explain that no signature, balance, policy engine,
external event store, chain transaction, or funds movement was performed.
Replace them at construction time for production.

An explorer URL is emitted only when an adapter explicitly attests
`verifiedLive: true`, reports `mode: "live"` and `simulated: false`, supplies a
64-hex `0x` transaction hash, and supplies a matching HTTPS URL. Mock IDs such
as `mock:<uuid>` can never produce a Basescan URL. The BFF never invents a URL.

## Operational controls

The boundary has a 256 KiB default request-body limit, an injectable rate
limiter, exact allowlisted CORS origins (no wildcard default), JSON error
envelopes, request/correlation IDs, and conservative security headers. The
default in-memory stores are process-local and are suitable only for local
development or tests; production should inject shared durable idempotency and
replay stores and a distributed rate limiter.
