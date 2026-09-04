# Cathay IntentSentinel: Policy-Bounded x402 Agentic Financial Gateway & Guardrail
## 國泰金控特別賽道 (Cathay Challenge) - Hackathon 2026

> "x402 makes agent payments possible; IntentSentinel makes them safe."
> "The agent cannot call custody directly."

### 1. Project Overview & Challenge Statement
Cathay Challenge: Build AI agents that automate financial operations, from wallets and payments to treasury and workflows, while optimizing for cost, risk, timing, and business needs.

### 2. The 4-Layer Architecture Separation
1. **01 Reasoning Layer (AI Agent)**: Proposes intent (Payment Intent), no signing authority.
2. **02 Policy Layer (IntentSentinel Policy Gate)**: Evaluates task binding, budget cap, merchant allowlist, asset/network pair, expiry window, and velocity limits. Fail-closed gate.
3. **03 Custody Layer (Key Vault / Scoped Signer)**: Isolated private key signs only approved payload using EIP-712 (ERC-3009 transferWithAuthorization).
4. **04 Settlement + Evidence (Facilitator + Audit Log)**: Read-only POST /verify and State-change POST /settle. Generates PAYMENT-RESPONSE and CFO audit trails.

### 3. Wire Protocol: x402 v2 Three Headers
1. `PAYMENT-REQUIRED`: Server -> Agent (Base64 JSON: x402Version=2, resource, accepts=[scheme, network, amount, asset, payTo])
2. `PAYMENT-SIGNATURE`: Agent -> Server (Base64 JSON: version=2, resource, accepted, authorization, signature, extensions)
3. `PAYMENT-RESPONSE`: Server -> Agent (Base64 JSON: txHash, status, receipt, timestamp)

### 4. Commercial Schemes Supported
- **EXACT**: Fixed amount for deterministic single resource.
- **UPTO**: Maximum authorization cap, charge actual usage <= cap (for streaming LLM/data).
- **BATCH**: Deferred aggregate redemption.

### 5. Threat Model & OWASP Agentic Risk Mapping
- **ASI01 Agent Goal Hijack**: Mitigated by Payment Intent + Task Context Binding.
- **ASI02 Tool Misuse**: Mitigated by Merchant Allowlist & Verified Payee Registry.
- **ASI03 Privilege Abuse**: Mitigated by Scoped Signer + Per-call/Daily Budget Caps.
- **ASI06 Context Poisoning**: Mitigated by Policy Gate Sandbox Isolation.
- **ASI08 Cascading Failures**: Mitigated by Nonce tracking & Idempotency.
- **ASI09 Misleading Summaries**: Mitigated by Explainable Intent + Fail-Closed default.

### 6. Key Hierarchy & Risk Mitigation
- **Level 1 (Root Treasury)**: Offline/Multisig cold vault.
- **Level 2 (Funding Pool)**: Monitored operational buffer for agents.
- **Level 3 (Session Key)**: Short-lived, task-scoped, revocable signing key.

### 7. Core Standards
- **ERC-3009**: transferWithAuthorization for gasless sponsored USDC transfers on Base.
- **ERC-8196**: Policy-bound wallet concepts.
- **ERC-8004**: Trust and reputation signals before payment.
