# Innovations and Grill Report

## Executive verdict

**Selected strategy: Option A+B Hybrid — on-chain truth with demo-grade continuity.**

This is the strongest hackathon strategy because it combines a judge-verifiable Base Sepolia payment with a resilient presentation path. It wins only if the boundary is honest: live evidence must be real, while mock evidence must be unmistakably simulated. The differentiator is not “we connected a wallet.” It is a complete control plane for agent commerce: negotiate a better deal, verify the seller, reserve policy budget, authorize narrowly, settle visibly, route intelligently, and turn attacks into governance intelligence.

The present repository is a strong safety-oriented prototype with 23 passing tests, but it does **not yet** support the full live claim. The P0 integration gaps below must be fixed before the demo calls the flow “real on-chain.”

## 1. What is genuinely strong today

- Four explicit layers: reasoning, policy, custody, and settlement/evidence.
- Exact binding across task, resource, payee, amount, asset/network, and expiry.
- Scoped EIP-712/ERC-3009 signer with raw typed-data signing disabled.
- One controlled x402 retry and conservative timeout-as-unknown semantics.
- Policy limits for call, task, day, and velocity plus approval escalation.
- Atomic in-process nonce claim and settlement idempotency tests.
- Adversarial tests for merchant hijack, micro-drain, cross-network replay, and concurrent replay.
- A clear TUI narrative for legitimate, blocked, and metered scenarios.

These are valuable foundations. The winning upgrade should deepen them rather than add unrelated buzzwords.

## 2. Codebase grill: findings and blind spots

Severity reflects the promised hybrid demo, not a deployed mainnet system.

### P0 — blocks a truthful live demo

| Finding | Evidence | Why it matters | Required correction |
| --- | --- | --- | --- |
| Client emits a flattened, non-canonical payload | `packages/agent-client/src/client.ts` uses `version`, top-level `authorization`, and top-level `signature`; core uses `x402Version` and nested `payload`. | A real x402 facilitator expects the canonical v2 envelope. | Remove duplicate wire types; emit `PaymentPayload<ExactEvmPayload>` from `packages/core`. |
| ERC-3009 nonce is only 16 bytes | `randomNonce()` allocates `Uint8Array(16)` while verification requires 64 hex digits. | Live verification rejects the default client authorization. | Generate 32 cryptographically random bytes and validate at every boundary. |
| Expiry mixes milliseconds and seconds | Client clock is `Date.now()` and multiplies timeout by `1000`; ERC-3009 and core policy use Unix seconds. | Intents and authorizations can be invalid or dangerously long when adapters meet. | Adopt one `UnixSeconds` branded type; inject seconds clocks everywhere. |
| Resource-to-facilitator request names do not interoperate | Middleware sends `paymentSignature`/`paymentRequired`; facilitator accepts `paymentPayload`/`paymentRequirements`. | Repository’s own HTTP components cannot complete the advertised live flow. | Use the canonical request schema and add an end-to-end HTTP test. |
| No real transfer submitter or RPC balance reader is wired | Facilitator exposes abstractions, while demos use `createInMemoryFacilitator`. | There is no Base Sepolia transaction or real receipt today. | Implement viem-based reads, simulation, broadcast, receipt wait, and reconciliation. |
| “ERC8004TrustRegistry” is an alias for the in-memory class | `packages/policy-engine/src/trust-registry.ts`. | The name can accidentally overstate on-chain verification. | Add a separate RPC-backed adapter; keep mock naming explicit. |

### P1 — security/correctness before public exposure

| Finding | Risk | Correction |
| --- | --- | --- |
| Budget is recorded after settlement rather than reserved before signing. | Multiple valid signatures may escape even if later accounting refuses some settlements. | Durable reserve/commit/release ledger; unknown authorizations stay reserved. |
| Key vault’s public low-level signing method does not bind domain chain/token to its scoped intent. | A caller can request the same transfer fields under another domain. | Derive domain exclusively from the signed-off asset/network catalog and reject overrides. |
| Nonce and idempotency state are process memory. | Restart loses replay protection and unknown settlement history. | Database uniqueness constraints and an on-chain `authorizationState` check. |
| Verification checks balance but does not simulate the actual token call. | Balance is a TOCTOU signal and cannot detect all token/state failures. | `eth_call` exact calldata at a pinned block, then recheck before broadcast. |
| Requirement and request hashing rely on ordinary `JSON.stringify`. | Semantically equal objects with different key order can conflict; ambiguous objects can be logged differently. | Strict schema plus deterministic canonical JSON hashing. |
| The client accepts any non-402 final response as completion. | A `500` after payment may be reported like success and fulfillment can be lost. | Validate status and canonical `PAYMENT-RESPONSE`; issue an idempotent fulfillment token. |
| Resource handler runs after payment with no redelivery contract. | Buyer may pay successfully but receive no resource if the handler fails. | Persist entitlement/receipt and support idempotent resource redelivery. |
| Quote selection is “first structurally usable.” | It ignores policy preference, trust, gas, liquidity, and downgrade rules. | Route selector evaluates every candidate before intent creation. |
| Registration-file retrieval controls do not exist. | ERC-8004 URIs create SSRF, redirect, oversized-content, and metadata substitution risk. | Sandboxed fetcher with allowlists, caps, pinned hashes, and block evidence. |
| Reputation policy is a single unweighted score. | Sybil/self-feedback and stale data can manufacture trust. | Trusted-reviewer weights, freshness, sample size, dispersion, disputes, and stake coverage. |

### P2 — hardening and maintainability

- The client and core packages duplicate concepts with incompatible names (`batch` versus `batch-settlement`, camelCase versus snake_case).
- The policy and client use separate intent types and require an explicit, tested adapter.
- In-memory approval, usage, and event logs are unsuitable for restart or multiple replicas.
- Public facilitator HTTP endpoints need authentication where appropriate, abuse limits, request timeouts, structured errors, and metrics.
- Event handlers swallow observer errors without a durable outbox, so audit evidence can disappear.
- URL comparison is textual; a canonical resource-ID policy is needed for redirects, default ports, fragments, and query parameters.
- The `upto` and batch declarations are broader than the executable facilitator, which currently supports only `exact`.
- Demo transaction hashes are deliberately fake but look transaction-like; they should use the `mock:` namespace and never create explorer links.

## 3. The five winning innovations

### Innovation 1 — Trust-before-pay with ERC-8004 plus economic guarantees

**Judge moment:** Before payment, the dashboard opens the seller’s Base Sepolia identity, shows a pinned registry block, verifies that the x402 endpoint and payee belong to that agent, computes reputation from trusted feedback, and displays “SLA stake coverage: 10×.”

This is more credible than a generic allowlist. The verifier reads the real ERC-8004 Identity and Reputation registries, validates registration metadata safely, and uses a policy-owned aggregation algorithm. A companion `SlaEscrow` supplies the economic stake because ERC-8004 itself does not custody or slash stake.

Decision output:

```json
{
  "status": "ALLOW",
  "agentId": "…",
  "payeeBound": true,
  "reputation": { "score": 91, "trustedSamples": 14, "freshAt": "…" },
  "sla": { "stake": "100000", "coverageBps": 100000 },
  "block": { "number": "…", "hash": "0x…" },
  "evidenceHash": "0x…"
}
```

What can go wrong:

- Identity ownership can transfer after verification.
- Registration content can change or point to a hostile server.
- Raw feedback is Sybil-prone and may be self-dealing.
- Registry contracts and interfaces can change while ERC-8004 remains draft.
- Stake is meaningless if the SLA and adjudication rules are vague.

Winning controls: short evidence TTL, pinned block/hash, payee-wallet binding, trusted reviewers, freshness/sample thresholds, companion stake contract, and an approval path for bootstrap identities.

### Innovation 2 — Multi-agent negotiation with signed commercial intent

**Judge moment:** Buyer and seller exchange two bounded counters; the dashboard animates the price moving from `0.0100` to `0.0085` USDC for a ten-report bundle, shows “15% saved,” then freezes the accepted price into the payment intent.

The negotiation protocol is not free-form chat. Every offer is EIP-712 signed, chained to the prior message, limited to three rounds, and constrained by buyer ceiling, seller floor, quantity, route set, SLA, and expiry. Code verifies arithmetic and signatures. The final x402 quote must echo the accepted terms and transcript hash.

Important rule: negotiation must finish before routing, policy binding, budget reservation, or signing. A later mutation creates a new session and intent.

Suggested strategy:

```text
buyer opening offer = min(seller list price, reference price) * volume tier
buyer walk-away     = policy ceiling
seller floor        = private deterministic policy
round limit         = 3
timeout             = 2 seconds in demo
```

The model can explain “why this discount is reasonable,” but it cannot bypass the numeric state machine.

### Innovation 3 — Live CFO web/TUI command center

**Judge moment:** One timeline shows negotiation, trust checks, policy decision, budget reserve, signature, broadcast, confirmation, and the real Basescan link. A second browser shows the blocked injection appearing immediately with zero custody calls.

Both views consume the same schema-versioned event stream. Key tiles:

- Mode badge: `LIVE BASE SEPOLIA`, `MOCK`, or `SHADOW`.
- Available, reserved, committed, and blocked spend.
- Negotiated savings and SLA value.
- Trust score, sample count, stake coverage, and evidence age.
- Route comparison with fee, latency, health, and selection reason.
- Intent timeline with stable correlation ID.
- Receipt verification and explorer link.
- Security detections with redacted evidence and report status.

An outbox makes the dashboard an audit view, not a source of truth. Dropped WebSockets reconnect by sequence; they do not affect payment.

### Innovation 4 — Policy-aware L2 routing optimizer

**Judge moment:** The dashboard compares Base Sepolia, Arbitrum Sepolia, and Polygon Amoy in real time, then selects Base because it is the cheapest eligible merchant-supported route with a healthy trust/RPC score.

The honest implementation is route selection, not magic cross-chain payment. Each route must already have buyer/merchant liquidity and an advertised x402 requirement. The optimizer considers settlement fee, latency, reorg/risk policy, RPC error rate, balance, token capability, and trust evidence. It emits a signed/hashable quote snapshot before intent binding.

For hackathon safety, non-Base routes run in shadow mode until their exact ERC-3009 domain and settlement suites pass. Never advertise a chain based only on a token address.

### Innovation 5 — Prompt-injection honeypot to threat intelligence

**Judge moment:** A malicious resource tries to replace the approved wallet and request 500 USDC. IntentSentinel blocks it before signing, highlights the attempted field mutations, clusters the source with prior detections, and creates a sanitized, hash-verifiable incident report.

The report includes tactic, affected control fields, proposed versus trusted values, merchant identity/domain/wallet indicators, detector version, confidence, timestamps, and evidence hash. The raw payload is quarantined. Reports remain internal by default; export is redacted and approval-gated to avoid leaking customer data or letting attackers turn the system into a spam relay.

## 4. Hybrid failover grill

The fallback is the strategy’s biggest presentation advantage and biggest credibility risk.

| Hard question | Decision |
| --- | --- |
| What if RPC fails before signing? | `AUTO_DEMO` may select mock and emits `system.mode_selected`; the screen turns amber and says **SIMULATED**. |
| What if RPC times out after broadcast? | Stay live in `UNKNOWN`; reconcile by tx hash/authorization state. Never run mock for that operation. |
| Can a fake hash get a Basescan link? | No. Mock IDs use `mock:{uuid}` and explorer-link generation accepts only a verified live receipt. |
| Can production auto-fallback? | No. Production is explicitly configured and defaults fail closed. |
| Can mock and live spend share a ledger? | No. They use distinct namespaces; mock totals are excluded from treasury totals. |
| What if ERC-8004 is unavailable? | Deny live before signing. Demo may restart the scenario in mock with a visible bootstrap fixture. |
| What if settlement succeeds but content delivery fails? | Persist entitlement and allow idempotent redelivery; payment remains committed. |

## 5. Architecture decisions resolved

1. **Primary truth:** Base Sepolia is the authoritative live path; mock is continuity, not equivalence.
2. **Trust:** ERC-8004 evidence informs a policy decision. Registration alone is never authorization.
3. **Stake:** Implemented in a separate SLA contract and explicitly linked to an ERC-8004 `agentId`.
4. **Negotiation:** Signed, bounded, and completed before intent binding.
5. **Routing:** Select among merchant-supported, pre-funded routes; no synchronous bridge.
6. **Custody:** Testnet session key only, narrowly scoped; production target is remote KMS/HSM or programmable-wallet policy.
7. **Accounting:** Reserve before sign, commit on receipt, retain on unknown.
8. **Evidence:** Real tx hash plus locally derived explorer link; verify receipt before rendering.
9. **Threat reporting:** Automatically create an internal sanitized report; external export requires policy.
10. **Claim discipline:** Every feature is labeled Implemented, Partial, Target, Live, Mock, or Shadow.

## 6. Concrete enhancement plan

### Phase 0 — Make the existing baseline truthful (P0)

1. Delete duplicate x402/intention wire types or wrap them with one canonical adapter from `packages/core`.
2. Fix `x402Version`/nested `payload`, `batch-settlement`, Unix seconds, and bytes32 nonce.
3. Align resource middleware and facilitator request/response field names.
4. Add a single-process HTTP integration test using the real client, resource middleware, and facilitator.
5. Add exact schema validation with payload/body/header size caps.

Exit: all existing tests plus canonical wire fixtures and HTTP integration tests pass.

### Phase 1 — Real Base Sepolia evidence (P0)

1. Add a viem RPC catalog and startup preflight.
2. Implement on-chain balance, `authorizationState`, simulation, submit, receipt, and event decoding.
3. Add durable SQLite/Postgres idempotency and nonce state.
4. Add budget reserve/commit/release and an unknown-state reconciler.
5. Fund isolated testnet payer USDC and facilitator ETH.
6. Run a tiny transfer and save its reproducible receipt fixture and Basescan link.

Exit: a clean checkout can produce a real, externally verifiable Base Sepolia transfer without source edits.

### Phase 2 — Real trust gate and stake (P1)

1. Implement `Erc8004TrustAdapter` against configured registry ABIs/addresses.
2. Build the safe metadata resolver and reviewer-weighted reputation calculator.
3. Register demo buyer/seller agents and bind the seller payee/service endpoint.
4. Deploy and verify minimal `SlaEscrow`; stake testnet USDC and read coverage.
5. Add registry downtime, ownership transfer, metadata mutation, Sybil, self-review, stale-feedback, and stake-withdrawal tests.

Exit: the trust decision is reproducible from block references and a second RPC provider.

### Phase 3 — Negotiation and routing (P1)

1. Implement negotiation envelopes, EIP-712 signatures, transcript hash chain, and constraint engine.
2. Add volume tiers and a deterministic two-agent demo.
3. Extend quote/intent/audit schemas with transcript and route hashes.
4. Build route probes and a deterministic scoring engine.
5. Show Arbitrum/Polygon shadow quotes; enable execution only per-chain after full tests.

Exit: the signed final quote exactly equals the paid requirement and the dashboard explains the saved amount and route choice.

### Phase 4 — Event experience and threat intelligence (P1)

1. Add transactional event outbox and WebSocket gateway.
2. Make TUI consume events rather than handcrafted scenario state.
3. Build the CFO web view with mode, budget, trust, route, timeline, and explorer proof.
4. Add deterministic injection detection, evidence quarantine, redaction, report schema, and internal report store.
5. Add reconnect/replay, authorization, multi-tenant isolation, and XSS tests.

Exit: web and TUI independently reconstruct identical state from the same event sequence.

### Phase 5 — Rehearsal hardening (P0/P1)

1. Add `npm run demo:preflight`, `demo:live`, `demo:mock`, and `demo:judge`.
2. Run live, mock, RPC-rate-limit, registry-outage, timeout-unknown, and post-payment delivery-failure drills.
3. Pin a known-good backup RPC and cache only immutable ABIs/static metadata, never a stale “trust allow.”
4. Prepare a pre-mined real transaction as backup evidence without pretending it is the current run.
5. Record terminal/browser dimensions and eliminate encoding-dependent UI glyphs.

Exit: the presenter can explain every degraded state without ambiguity or duplicate payment risk.

## 7. Test matrix

| Layer | Required tests |
| --- | --- |
| Protocol | Canonical x402 fixtures, malformed base64/JSON, body caps, CAIP-2, exact equality. |
| Signing | Bytes32 nonce, seconds expiry, chain/token/payee/value binding, expired scope, closed vault. |
| Policy | Concurrent reservation, crash recovery, unknown retention, approval expiry, route mutation. |
| Trust | Registry bytecode/address mismatch, transfer of owner, hostile URI, DNS rebinding, stale/Sybil feedback, stake withdrawal. |
| Negotiation | Replay, skipped round, forked transcript, invalid signature, arithmetic overflow, ceiling/floor violation, expired acceptance. |
| Settlement | Simulation revert, RPC disagreement, underpriced replacement, receipt reorg, restart, same key/different request, unknown reconciliation. |
| Escrow | Reentrancy, double release/refund, timestamp boundaries, dispute authorization, fee-on-transfer rejection, invariants/fuzzing. |
| Events/UI | Sequence gaps, reconnect replay, tenant isolation, redaction, XSS payloads, mock/live labeling. |
| Threat intel | Prompt/control-field mutation corpus, false positives, secret/PII redaction, classifier outage, export authorization. |

## 8. Judge demo runbook

Target length: 4–5 minutes.

1. **Preflight (20 sec):** Show `LIVE BASE SEPOLIA`, chain ID, USDC contract, registry contracts, balances, and green RPC quorum.
2. **Trust (35 sec):** Open seller ERC-8004 identity and reputation evidence; show payee binding and 10× SLA stake.
3. **Negotiate (35 sec):** Buyer counters a volume quote; seller accepts; show percent and atomic-unit savings plus transcript hash.
4. **Route (20 sec):** Compare three testnet routes; explain why Base is eligible and selected while other routes are shadow-only if not certified.
5. **Pay (50 sec):** Bind intent, approve policy, reserve budget, sign once, settle real testnet USDC, click Basescan transaction.
6. **Defend (45 sec):** Run malicious 500-USDC/payee-replacement prompt. Show denial before signer, unchanged budget, and sanitized threat report.
7. **Resilience (25 sec):** Disable RPC in a fresh scenario. Show amber mock mode, `mock:` receipt, and explain why an already-broadcast transaction would instead remain `UNKNOWN`.
8. **Close (15 sec):** “The agent can bargain and pay; the institution controls identity, exposure, evidence, and recovery.”

### Evidence checklist before going on stage

- Testnet payer has enough USDC; facilitator has enough Base Sepolia ETH.
- Seller payee and ERC-8004 wallet binding match exactly.
- SLA stake and lock deadline meet policy.
- Both RPC providers agree on chain and recent block.
- Explorer, registry, and USDC links open on the presentation network.
- A real dry-run transaction completed that day.
- Mock scenario uses isolated state and cannot emit explorer links.
- Screen visibly shows atomic units and friendly USDC values without float-based accounting.

## 9. Prize-readiness scorecard

| Dimension | Current | Target after plan | Winning proof |
| --- | ---: | ---: | --- |
| Security architecture | 8/10 | 10/10 | Scoped custody, reserve-before-sign, adversarial suite. |
| On-chain verifiability | 2/10 | 10/10 | Real USDC receipt and Basescan link. |
| Agent trust | 3/10 | 9/10 | Real ERC-8004 reads plus stake coverage. |
| Business value | 6/10 | 10/10 | Negotiated savings, SLA protection, CFO policy. |
| Innovation | 6/10 | 10/10 | Trust + negotiation + routing + threat intelligence as one flow. |
| Demo resilience | 7/10 | 10/10 | Honest pre-sign mock fallback and failure drills. |
| UX/storytelling | 6/10 | 9/10 | Shared real-time web/TUI evidence timeline. |

The scorecard is a planning heuristic, not an external judging result.

## 10. Claims the team may and may not make

### Safe after P0/P1 acceptance

- “We settled testnet USDC on Base Sepolia using an ERC-3009 authorization through x402 v2.”
- “The receipt and transaction are independently verifiable on Basescan.”
- “We read ERC-8004 identity and reputation on-chain and applied our own transparent risk policy.”
- “Our companion SLA contract supplies the economic guarantee; ERC-8004 supplies the agent identity/trust signals.”
- “The buyer and seller signed the negotiated terms before the payment intent was bound.”

### Avoid

- “ERC-8004 guarantees the agent is trustworthy.”
- “ERC-8004 provides native staking/slashing.”
- “The mock fallback settled on-chain.”
- “Cross-chain routing works” when only shadow quotes are implemented.
- “Escrow is atomic with x402” unless one on-chain transaction actually enforces both.
- “Production-grade custody” while using an environment-loaded testnet private key.

## 11. Final recommendation

Build vertically in this order: canonical x402 interoperability, one real Base Sepolia receipt, durable reservation/reconciliation, real ERC-8004 reads, then the judge-facing negotiation/dashboard layer. The on-chain proof is the credibility anchor; the policy and threat story is the institutional differentiator; negotiation is the memorable business moment. Multi-chain breadth and full dispute escrow should not delay a reliable, truthful end-to-end Base path.

## Sources

- [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)
- [x402 HTTP payment flow](https://docs.x402.org/core-concepts/http-402)
- [ERC-3009 specification and security considerations](https://eips.ethereum.org/EIPS/eip-3009)
- [ERC-8004 draft specification](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 team deployments](https://github.com/erc-8004/erc-8004-contracts)
- [Base RPC documentation](https://docs.base.org/base-chain/api-reference/rpc-overview)
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)

