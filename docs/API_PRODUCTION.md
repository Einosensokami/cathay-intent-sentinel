# IntentSentinel 生產級 API 與 BFF 邊界規範 (API Specification)

本文件定義 `packages/api` 實作之生產級多租戶（Tenant-scoped）HTTP API 與 BFF 邊界規範。

---

## 1. 路由清單 (Routes & Access Matrix)

| HTTP 方法 | 路由路徑 | 權限要求 | 說明 |
| :--- | :--- | :--- | :--- |
| **GET** | `/healthz` | 公開 (Public) | 存活狀態檢查（Liveness Check） |
| **GET** | `/readyz` | 公開 (Public) | 相依服務就緒檢查（Readiness Check） |
| **POST** | `/api/v1/verify` | `agent`, `operator`, `auditor` | 唯讀驗證 x402 支付簽章與政策相容性 |
| **POST** | `/api/v1/settle` | `agent`, `operator` | 執行結算並廣播 ERC-3009 授權交易 |
| **GET** | `/api/v1/events` | `operator`, `auditor` | SSE / 串流審計日誌與遙測事件廣播 |

---

## 2. 身份驗證與租戶隔離 (Authentication & Tenancy)

受保護之 API 請求必須攜帶 `Authorization: Bearer <token>` 標頭。
- **預設開發驗證器**：讀取 `INTENT_SENTINEL_DEV_BEARER_TOKEN`；若未配置則一律 Fail-Closed 拒絕連線。
- **生產環境對接**：透過 `BearerTokenVerifier` 介面無縫串接企業 OIDC、JWT 或 mTLS 邊界網關。

所有請求均強制封裝租戶範圍（Tenant Boundary）：

```json
{
  "tenantId": "tenant-cathay",
  "x402Id": "x402_01JABCDEF1234567",
  "paymentIntent": {
    "paymentIntentId": "pi_01JABCDEF1234567",
    "tenantId": "tenant-cathay",
    "taskId": "task-security-recon",
    "resource": "https://api.merchant.com/reports/vip",
    "payee": "0x1111111111111111111111111111111111111111",
    "maxAmount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "network": "eip155:84532",
    "expiresAt": 1900000000
  },
  "paymentPayload": {
    "x402Version": 2,
    "accepted": {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x1111111111111111111111111111111111111111",
      "maxTimeoutSeconds": 300
    },
    "payload": {
      "authorization": {
        "from": "0x14791697260E4c9A71f18484C9f997B308e59325",
        "to": "0x1111111111111111111111111111111111111111",
        "value": "10000",
        "validAfter": "1",
        "validBefore": "1900000000",
        "nonce": "0x0000000000000000000000000000000000000000000000000000000000000001"
      },
      "signature": "0x..."
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "eip155:84532",
    "amount": "10000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "0x1111111111111111111111111111111111111111",
    "maxTimeoutSeconds": 300
  }
}
```

---

## 3. 回應規格與錯誤封裝 (Response Format)

- **成功回應**：
  ```json
  {
    "ok": true,
    "requestId": "req_01JABCDEF1234567",
    "correlationId": "corr_01JABCDEF1234567",
    "data": { /* 業務資料或結算憑證 */ }
  }
  ```
- **錯誤回應**（絕不洩漏內部私鑰、資料庫連線或底層例外細節）：
  ```json
  {
    "ok": false,
    "error": {
      "code": "POLICY_DENIED",
      "message": "Payment blocked by the IntentSentinel policy gate",
      "requestId": "req_01JABCDEF1234567",
      "correlationId": "corr_01JABCDEF1234567"
    }
  }
  ```

---

## 4. 冪等性與重放保護規則 (Idempotency & Replay Rules)

- `POST /api/v1/settle` 強制要求攜帶 `Idempotency-Key` 標頭。
- 冪等鍵範圍綁定 `(tenantId, principal.subject)` 與請求本文的 SHA-256 雜湊。
- **重複調用相同請求**：回傳原始結算結果，並帶上標頭 `Idempotency-Replayed: true`。
- **重複使用相同 Key 於不同請求**：回傳 `409 idempotency_conflict` 阻斷。
- **超時與未知狀態**：若發生上游逾時，狀態標記為 `UNKNOWN`，該 Nonce 維持鎖定，嚴禁盲目重放扣款。
