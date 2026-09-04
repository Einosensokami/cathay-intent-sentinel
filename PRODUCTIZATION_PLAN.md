# IntentSentinel Productionization Plan

## 1. 現況與產品化原則

目前 repository 是 **mock-by-default demo**：`Frontend` 會在 browser 端模擬流程、餘額與 tx hash，`MockPaymentAdapter`、in-memory facilitator/nonce/policy ledger 與 placeholder/demo keys 皆不具 production durability 或 custody 保證。即使提供既有 tx hash 供畫面展示，也不等於本系統實際送出或驗證該交易。現階段不得宣稱已完成 real settlement，也不得宣稱已部署本專案的 ERC-8004 registry 或 SLA contract。

產品化遵循四項原則：browser 無 custody；所有金額使用 atomic-unit decimal string；live/mock truth source 完全隔離；任何 timeout 或不一致皆 fail closed，且 `UNKNOWN` 不得重簽或重送。

## 2. Production architecture

邏輯 trust path 為：

```text
Frontend -> authenticated BFF/API -> Facilitator (/verify, /settle) -> Policy + durable budget reservation -> scoped Key Vault/KMS -> Base Sepolia blockchain
```

實際 payment state order 必須固定為：`authenticate -> authorize -> validate -> bind intent -> policy evaluate -> budget reserve -> key-vault sign -> /verify -> /settle -> submit -> confirm/reconcile -> budget commit -> release resource`。

- `Frontend` 只提交 command、讀取 tenant-scoped view/event；不得直連 Facilitator、Key Vault、RPC 或持有 wallet/private key。
- `BFF/API` 是唯一 public application boundary，負責 session、RBAC、tenant context、request schema、CSRF/CORS、rate limit、command idempotency 與 response redaction。
- Facilitator 的 `/verify` 僅 read-only；`/settle` 才能 atomically claim `(tenant_id, network, payer, nonce)`、寫 settlement state、送鏈與啟動 reconciliation。另提供 `GET /settlements/{idempotencyKey}`。
- `Policy` 以 immutable task context、merchant/payee、asset/network、cap、expiry、trust evidence 評估，並在簽名前以 transaction 建立 `reserved` budget；`UNKNOWN` 持續占用 reservation。
- `Key Vault` 只接受一次性 `ApprovedIntentCapability`，自行重驗 EIP-712 domain、payee、amount、nonce、expiry；production 使用 remote KMS/HSM 或 programmable wallet，不提供 raw signing API。
- `PostgreSQL` 保存 tenant、intent、reservation、idempotency、nonce、settlement、outbox/audit；`Redis` 僅作 rate limit/cache，不作 settlement truth source。Outbox 將事件送往 SSE/WebSocket gateway 與 observability backend。

## 3. Tenant 與 authentication boundaries

- 以 enterprise IdP 的 OIDC Authorization Code + PKCE 登入；BFF 使用 `HttpOnly`、`Secure`、`SameSite=Lax/Strict` session cookie。browser 不保存 bearer token；service-to-service 使用短效 audience-bound JWT 加 mTLS。
- `tenant_id`、`user_id`、roles 一律由已驗證 claims 導出，禁止採信 body/header 中的 tenant。DB primary/unique key、query、cache、idempotency、nonce、event topic 與 object storage path 都包含 `tenant_id`；啟用 PostgreSQL RLS 並測試 cross-tenant deny。
- 最小角色為 `viewer`、`operator`、`approver`、`tenant_admin`、`service`；高風險付款採 maker-checker，發起者不得批准自己的 intent。Key Vault capability 綁定 tenant/task/intent hash，不能跨 tenant replay。
- Admin、policy change、approval、sign、settle、mode change 均寫 append-only audit event；log/event 不含 cookie、token、private key、完整 signature、raw hostile prompt 或敏感 header。

## 4. API 與安全控制

- **Canonical contract**：以 `packages/core` 作唯一 x402/domain DTO 來源，移除 `agent-client`、`policy-engine`、`frontend` 的重複型別；由 OpenAPI/JSON Schema 產生 server validation 與 frontend client。拒絕 unknown fields、非 JSON content type、超限 body、非法 address/URL、浮點金額、非 CAIP-2 network、非 bytes32 nonce 與不完整 EIP-712 domain。
- **Idempotency/replay**：所有 command 需要 `Idempotency-Key`；durable unique key 為 `(tenant_id, operation, key)` 並保存 canonical request hash。相同 key/body 回傳原結果，不同 body 回 `409`。`/settle` 以 DB transaction claim nonce；鏈上再查 `authorizationState`。紀錄至少保留至 `validBefore + reconciliation window`。timeout 進 `UNKNOWN`，只能 reconcile，不能再 broadcast。
- **Rate limits**：同時限制 tenant、user/service principal、source IP、route 與 spend velocity；`/settle`、sign、approval 採較低上限與 concurrency lock。回傳 `429`、`Retry-After` 與 stable error code；不得以 retry 繞過 budget/policy。
- **CORS/CSRF**：BFF 僅 allowlist 明確 HTTPS origins、methods、headers，禁止 wildcard + credentials。所有 cookie-authenticated mutation 驗證 Origin/Referer 與 synchronizer/double-submit CSRF token；service API 不接受 browser cookie。
- **Input/egress validation**：merchant resource 與 ERC-8004 metadata fetch 採 protocol/host allowlist、DNS/IP private-range deny、redirect/timeout/byte/MIME cap；explorer URL 只能由 allowlisted chain catalog 與經 receipt 驗證的 tx hash 派生。
- **Observability**：採 OpenTelemetry traces/metrics/structured logs，串接 `trace_id`、`correlation_id`、`tenant_id`、`intent_hash`、`idempotency_key_hash`、mode 與 state transition。監控 policy deny、reserve leak、UNKNOWN age、nonce collision、RPC quorum、confirmation latency、rate-limit、auth failure 與 outbox lag；audit event 使用 schema version、sequence 與 hash chain。Telemetry failure 不改變 payment correctness。

## 5. Mock/live 隔離與 Base Sepolia live gate

- `SENTINEL_MODE=mock|shadow|live` 必須在 startup 明確指定；production profile 不提供 `auto-demo`。三種 mode 使用不同 hostname、deployment、DB schema/credentials、queue/topic、merchant ID、payer/relayer account、nonce namespace 與 dashboard badge。
- Mock receipt 固定為 `mock:{uuid}`、`mode:"mock"`、`simulated:true`，永不產生 Basescan link；live UI 不接受 fixture 或 browser-generated settlement。禁止在 `BUDGET_RESERVED`、`SIGNED`、`SUBMITTED`、`UNKNOWN` 後切換至 mock。
- Real Base Sepolia 僅支援 `eip155:84532`、`exact`、USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` 與 ERC-3009 `transferWithAuthorization`。startup/pre-sign 必須驗證 RPC quorum、chain ID、USDC bytecode/code hash policy、`name/version/decimals`、payer balance、relayer gas、`authorizationState`、clock skew 與 configured addresses。
- Broadcast 前執行 exact payload equality、signature recovery、policy evidence/reservation、nonce claim 與 `eth_call` simulation；broadcast 後立即保存 tx hash，至少等待一個 safe confirmation，驗證 receipt status、chain、token address、payer/payee/value 與 logs，再產生 Basescan URL 並 commit budget。RPC timeout 保持 `UNKNOWN` 並由 reconciler 查 tx/nonce/event。
- ERC-8004 僅在 live probe 驗證 configured registry bytecode、registry linkage、pinned block、agent identity/reputation/payee binding 後才可顯示為 on-chain evidence；registry 為 draft 且地址須可配置。SLA stake 只有在另行部署並驗證 companion contract 後才可宣稱 on-chain；目前不得如此宣稱。

## 6. Frontend API adapter migration

1. 將 `App.tsx` 的 timer、隨機 tx hash、float balance 與 `data.ts` fixture 移至僅供 local demo 的 `MockApiAdapter`；production bundle 禁止 import mock module。
2. 定義 `IntentSentinelApi`：`getSnapshot()`、`runScenario()/createIntent()`、`approveIntent()`、`getSettlement()`、`subscribeEvents(afterSequence)`；新增 `HttpApiAdapter`，僅呼叫 same-origin authenticated BFF，mutation 帶 CSRF 與 idempotency key。
3. UI state 改由 server snapshot 加 ordered SSE/WebSocket events reducer 建立；斷線以 `afterSequence` replay。所有 amount 以 atomic string 傳輸，顯示層才 format；mode、verified、explorer URL 以 server response 為唯一 truth。
4. 收斂現有兩套 frontend types/engine，改由 generated API types 映射至 view model；移除預載「settled」假交易。若 `mode !== live` 或 `receiptVerified !== true`，receipt modal 必須明示 simulated 且不顯示 explorer link。

## 7. Tests、deployment 與 release gates

- Unit/property tests：canonical encoding、money/nonce/time、policy rule、capability scope、state machine、redaction、mode invariant；fuzz malformed x402/EIP-712 與 idempotency collision。
- Contract/integration tests：OpenAPI consumer/provider contract；PostgreSQL transaction 下的 concurrent reserve/settle、restart persistence、same/different payload replay、cross-tenant RLS、timeout reconciliation、outbox replay；Key Vault 使用 fake KMS，不載入 secret。
- Security tests：authz matrix、CSRF/CORS、rate limit、SSRF/DNS rebinding、header/body limits、log leakage、cross-tenant cache/event isolation。E2E 驗證 mock 永不出現 explorer link、live failure 永不降級 mock。
- Base Sepolia smoke test 由受保護 CI environment 手動核准，使用低額 testnet USDC，驗證實際 balance delta 與 receipt；不得在一般 PR 執行或輸出 secrets。Promotion gate 需要 unit/typecheck/integration/security/SBOM/dependency/container scan 全綠。
- 部署 immutable containers：`bff`、`facilitator/reconciler`、`policy`、`event-gateway`；Key Vault 為 private network service。使用 managed PostgreSQL、Redis、secret manager、KMS/HSM、雙 RPC provider、TLS/mTLS、WAF 與 OTel collector。先 migration/backup rehearsal，再 shadow、internal tenant、canary、general availability；rollback 只能回 application version，不能刪除 `UNKNOWN`/nonce/reservation state。

## 8. 分階段交付與四位 Luna workers 的獨占 ownership

為避免 merge conflict，下列 ownership 在整個專案期間固定且互不重疊；跨 boundary 先以 versioned contract/fixture 協作，不互改他人檔案。

| Luna worker | 獨占檔案 ownership | 主要交付 |
| --- | --- | --- |
| Luna-1 Contract/API | `packages/core/src/**`, `packages/bff/src/**`, `openapi/**` | canonical DTO/schema、OIDC session、tenant/RBAC、CSRF/CORS、BFF commands/queries |
| Luna-2 Settlement | `packages/agent-client/src/**`, `packages/facilitator/src/**`, `packages/reconciler/src/**` | controlled retry、durable idempotency/nonce state、`/verify`/`/settle`、Base Sepolia submit/reconcile |
| Luna-3 Policy/Custody | `packages/policy-engine/src/**`, `packages/key-vault/src/**`, `packages/persistence/src/**` | tenant budget reserve/commit/release、approval、ERC-8004 adapter、KMS capability signer |
| Luna-4 Experience/Release | `packages/frontend/src/**`, `packages/demo/src/**`, `tests/**`, `deploy/**`, `package.json` | API adapters、truthful mode/evidence UX、E2E/security harness、CI/CD與 deployment manifests |

交付順序：

1. **Stage 0 — Truthful baseline**：Luna-1 freeze canonical contracts；Luna-4 移除 production UI 假 live claims並建立 mock-only fixture；Luna-2/3 補齊 state/capability interface。Gate：mock default 與所有 simulated evidence 清楚標示。
2. **Stage 1 — Authenticated durable control plane**：Luna-1 完成 BFF tenant/auth boundary；Luna-2 將 idempotency/nonce/settlement 持久化；Luna-3 完成 atomic budget ledger 與 approval；Luna-4 接 `HttpApiAdapter` 與 event replay。Gate：restart、concurrency、cross-tenant、CSRF/replay tests 全綠。
3. **Stage 2 — Base Sepolia live path**：Luna-2 完成 preflight、simulation、broadcast、receipt verification/reconciler；Luna-3 接 KMS 與 pinned ERC-8004 reads；Luna-1 暴露只讀 evidence API；Luna-4 完成 live/mock badge與 receipt UX。Gate：人工核准 smoke test 實際移動 testnet USDC，且 evidence 可獨立驗證。
4. **Stage 3 — Production hardening**：四位依 ownership 補 observability、security/load/chaos、runbook 與 SLO；Luna-4 統籌 canary manifests，但不修改其他 worker paths。Gate：`UNKNOWN` reconciliation、RPC outage、KMS denial、event backlog 與 rollback drills 通過後才可 release。
