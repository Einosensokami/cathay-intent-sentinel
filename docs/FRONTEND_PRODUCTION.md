# Frontend production integration

The dashboard keeps the cyber-fintech dual-panel presentation, but its browser boundary is now explicit in `packages/frontend/src/api/client.ts`.

## Configuration

Vite values are read at build time:

```text
VITE_API_BASE_URL=https://sentinel.example/api/v1
VITE_EVENT_TRANSPORT=sse
VITE_EXECUTION_MODE=live
```

Defaults are safe for local development: `VITE_API_BASE_URL` is `/api/v1`, `VITE_EVENT_TRANSPORT` is `sse`, and execution mode is `mock`. `VITE_SENTINEL_HTTP_URL` remains supported for the existing local server and is converted to `<origin>/api/v1`. The UI marks Mock visibly and never treats simulated receipts as chain evidence.

Supported event transports are `sse`, `websocket`, `polling`, and `none`. The default event path is `/events`; health is `GET /health`.

## API boundary

`createApiClient()` exposes typed methods for:

- `health()` → `GET /api/v1/health`
- `verify(request)` → `POST /api/v1/verify`
- `settle(request)` → `POST /api/v1/settle`
- `events(options)` → configured `/api/v1/events` transport

Every HTTP request gets `x-request-id` and `x-correlation-id`. Settlement also sends the caller-owned `idempotency-key`. A retry reuses that idempotency key, so a timed-out or interrupted broadcast is never replayed under a new key. Server envelopes are reduced to a bounded `ApiError` message, code, status, and correlation metadata before they are rendered.

The facilitator-compatible request fields are `paymentPayload`, `paymentRequirements`, `payer`, and `idempotency_key`. A host integration may provide one ephemeral, already-signed payload through `window.__INTENTSENTINEL_PAYMENT__`; the dashboard does not persist it, create signatures, or contain credentials. Without that handoff, Live verification fails closed with a visible error.

## Evidence rules

- Mock receipts are labelled `MOCK 模擬`, have `verified: false`, and never receive a `Basescan` link or synthetic transaction hash.
- A Live receipt is settled only when the response is successful, explicitly `onchain`/`live`, non-simulated, on Base Sepolia, and contains a valid 32-byte transaction hash.
- Explorer URLs are accepted only for `https://sepolia.basescan.org/tx/<hash>` and only for verified Live receipts.
- A rejected or unknown Live settlement remains rejected/unknown. It cannot silently fall back to Mock.
- Treasury balance changes only after a verified Live settlement. Mock runs are process demonstrations and do not imply funds moved.

## Verification

From the repository root:

```text
npm run test --workspace=@cathay/intent-sentinel-frontend
npm run typecheck --workspace=@cathay/intent-sentinel-frontend
npm run build --workspace=@cathay/intent-sentinel-frontend
```

No credentials are required for these checks.
