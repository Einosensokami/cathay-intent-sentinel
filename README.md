# Cathay IntentSentinel

> **x402 makes agent payments possible; IntentSentinel makes them safe.**

IntentSentinel is a policy-bounded payment gateway for autonomous AI agents.
It lets an agent discover an x402 price, propose a payment intent, and pay a
resource without giving the model custody of a private key. Every payment is
bound to a task, merchant, asset/network pair, amount cap, expiry, and policy
decision before the scoped signer is invoked.

## Architecture

```text
  untrusted prompt / model output
              │  proposes intent only
              ▼
┌──────────────────────────────┐
│  01 Reasoning: Agent Client  │── request ──┐
└──────────────────────────────┘             │
              │                              ▼ 402 PAYMENT-REQUIRED
              ▼                       ┌───────────────┐
┌──────────────────────────────┐      │ Resource      │
│  02 Policy: IntentSentinel   │◄─────│ Server        │
│  task · payee · cap · expiry │      └───────┬───────┘
└───────────────┬──────────────┘              │ valid PAYMENT-SIGNATURE
                │ approved intent             ▼
                ▼                       ┌───────────────┐
┌──────────────────────────────┐        │ 04 Facilitator│
│  03 Custody: Scoped Key Vault│─sign──►│ verify/settle  │
│  ERC-3009 / EIP-712 only     │        └───────┬───────┘
└──────────────────────────────┘                │
                ▲                               ▼
                └──────────── PAYMENT-RESPONSE + audit receipt
```

The controlled retry state machine is finite:

```text
REQUEST → 402 CHALLENGE → BIND INTENT → POLICY GATE
                                  │             │
                                  │ deny       │ allow
                                  ▼             ▼
                              STOP/LOG   VAULT SIGN → ONE RETRY → SETTLE → COMPLETE
```

The client fails closed: there is no signer call without an approved intent,
and there is no second payment retry. A timeout is an unknown settlement
outcome, never permission to pay again.

## x402 v2 wire protocol

The resource server returns `402` with a base64url-encoded JSON
`PAYMENT-REQUIRED` header:

```json
{"x402Version":2,"resource":"https://…","accepts":[
  {"scheme":"exact","network":"base","asset":"USDC","amount":"10000","payTo":"0x…"}
]}
```

The agent returns one base64url-encoded `PAYMENT-SIGNATURE` containing the
approved resource, accepted quote, ERC-3009 authorization, and signature. On
successful settlement the server responds with `PAYMENT-RESPONSE`, including a
transaction hash and receipt. Amounts are integer strings in the asset's base
units—never JavaScript floating point values.

Supported schemes are `exact` (fixed price), `upto` (metered usage up to a
signed cap), and `batch` (deferred aggregate redemption).

## Quickstart

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run build
npm run demo:legitimate
npm run demo:prompt-injection
npm run demo:streaming
```

The demos use an in-memory resource server and facilitator, so no wallet,
network, or API key is required. In production, inject a real policy engine,
scoped key-vault signer, and facilitator client into `ControlledRetryClient`.

```ts
import { wrapFetchWithPayment } from "@intent-sentinel/agent-client";

const paidFetch = wrapFetchWithPayment({ policyGate, signer });
const response = await paidFetch("https://resource.example/report", undefined, {
  taskId: "incident-42",
  purpose: "retrieve approved threat intelligence",
});
```

Resource servers use `createResourceServerMiddleware` with a quote, handler,
and facilitator. The handler is not invoked until the signature passes
structural checks, optional verification, policy, and settlement.

## Threat model: OWASP Agentic Security Initiative

| Risk | IntentSentinel control |
| --- | --- |
| ASI01 Agent Goal Hijack | Task context binding and explicit payment intent |
| ASI02 Tool Misuse | Verified payee registry and merchant allowlist |
| ASI03 Privilege Abuse | Scoped signer plus per-call/daily caps |
| ASI06 Context Poisoning | Policy gate evaluates structured data outside model context |
| ASI08 Cascading Failures | One retry, nonce tracking, idempotency, fail-closed errors |
| ASI09 Misleading Summaries | Explainable policy reasons and signed settlement receipts |

The model is outside custody. Root treasury should remain an offline or
multisig vault; an operational funding pool is monitored; and only a
short-lived, revocable session key is exposed to the agent workflow.

## Cathay Challenge alignment

IntentSentinel demonstrates financial-operation automation while optimizing for
cost, risk, timing, and business rules: the legitimate scenario buys threat
intelligence for **0.01 USDC**, the prompt-injection scenario blocks a malicious
**500 USDC** request with merchant and budget reasons, and the streaming
scenario charges actual LLM usage below an `upto` cap. The CFO-facing dashboard
makes every decision and receipt visible.

## Packages

- `@cathay/intent-sentinel-core` — protocol and domain types.
- `@intent-sentinel/agent-client` — controlled retry client, fetch wrapper, and resource middleware.
- `@intent-sentinel/demo` — runnable hackathon scenarios and terminal dashboard.
- `@intent-sentinel/policy-engine`, `@cathay/intent-sentinel-key-vault`, and `@intent-sentinel/facilitator` — policy, custody, and settlement boundaries.

## Security notes

The demo signers use placeholder signatures for local simulation. They are not
wallets and must not be used for real funds. A production signer must perform
EIP-712/ERC-3009 signing inside an isolated key vault and independently
re-check the intent, payee, cap, nonce, and expiry.

## License

MIT. See [LICENSE](LICENSE).
