# Cathay IntentSentinel (國泰意圖哨兵) — 協定與技術規範規格書 (SPEC)

> **國泰金控特別賽道 (Cathay Challenge) — 金融 AI 代理人安全基礎設施**
> 
> *「x402 協議讓代理人支付成為可能；IntentSentinel 則讓這一切安全合規。」*  
> *「AI 代理人絕不可直接調用資金金庫。」*

---

## 1. 專案概述與賽道挑戰 (Overview)

- **國泰金控挑戰命題**：構建能自主執行金融操作（錢包、支付、金庫與自動化工作流）的 AI Agent，同時在成本、風險、時效與業務合規層面達到最佳化平衡。
- **IntentSentinel 核心定位**：專為企業級自主 AI Agent 設計的「策略約束型金融風控閘道與 x402 支付中介層」。

---

## 2. 四層邊界解耦架構 (4-Layer Separation)

1. **01 推理層 (Reasoning Layer — AI Agent)**：
   - 負責探索資源並提出結構化「支付意圖（PaymentIntent）」。
   - **完全無私鑰簽章權限**。
2. **02 政策層 (Policy Layer — IntentSentinel Policy Gate)**：
   - 審查意圖與任務 ID 綁定、單筆/每日預算上限、商戶白名單、資產/網路配對、過期時間與速率限制。
   - **預設強制阻斷（Fail-Closed Gate）**。
3. **03 金庫層 (Custody Layer — Scoped KeyVault)**：
   - 隔離環境保管私鑰，嚴格僅對通過審核的 Payload 進行 EIP-712 密碼學簽章（ERC-3009 `transferWithAuthorization`）。
4. **04 結算與審計層 (Settlement & Evidence Layer — Facilitator + Audit)**：
   - 唯讀 `POST /verify` 與狀態變更 `POST /settle`。
   - 產出 `PAYMENT-RESPONSE` 與企業 CFO 即時防偽審計軌跡。

---

## 3. 傳輸協定：x402 v2 三大標頭規範 (Wire Protocol)

所有 x402 通訊均透過標準 HTTP 標頭進行 Base64 編碼之 JSON 交換：

### 1. `PAYMENT-REQUIRED` (商戶 ➜ Agent)
當資源受保護時，商戶回傳 HTTP 402：
```json
{
  "x402Version": 2,
  "resource": "https://api.merchant.com/reports/vip",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x1111111111111111111111111111111111111111",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USD Coin", "version": "2" }
    }
  ]
}
```

### 2. `PAYMENT-SIGNATURE` (Agent ➜ 商戶)
Agent 通過政策審核並由金庫簽章後，於重試請求中帶上：
```json
{
  "x402Version": 2,
  "resource": "https://api.merchant.com/reports/vip",
  "accepted": { /* 接受的 paymentRequirements */ },
  "payload": {
    "authorization": {
      "from": "0xPayer...",
      "to": "0x1111111111111111111111111111111111111111",
      "value": "10000",
      "validAfter": "1757000000",
      "validBefore": "1757000300",
      "nonce": "0x..."
    },
    "signature": "0x..."
  },
  "extensions": {
    "taskId": "task-security-recon",
    "intentId": "intent_123456"
  }
}
```

### 3. `PAYMENT-RESPONSE` (商戶 ➜ Agent)
結算完成後，商戶於 HTTP 200 回應中附加防偽收據：
```json
{
  "success": true,
  "transaction": "0x05df033bee22288798ad394ba9a668d90fb77ab71edae61ffa4cbcedf02007df",
  "network": "eip155:84532",
  "amount": "10000",
  "payer": "0xPayer...",
  "timestamp": "2026-09-05T08:00:00.000Z"
}
```

---

## 4. 支援之商業支付模式 (Commercial Schemes)

1. **EXACT（固定單筆計費）**：單一確定性資源的固定額度結算（如：購買單份 VIP 研報）。
2. **UPTO（最高上限預授權）**：預先設定授權上限，依照實際使用量（如串流 Token / 資料量）實報實銷。
3. **BATCH（批次聚合結算）**：多筆微額交易延遲合併結算，大幅節省鏈上手續費。

---

## 5. 威脅模型與 OWASP Agentic Top 10 防禦對照

| OWASP 威脅代號 | 攻擊情境 | IntentSentinel 規格級防禦機制 |
| :--- | :--- | :--- |
| **ASI01 目標劫持** | 外部資料誘導 Agent 竄改目標 URL | 強制比對 `resource_url`，非白名單立即阻斷 |
| **ASI02 工具濫用** | 惡意商戶替換為黑客錢包地址 | 強制比對 `allowed_payee_addresses` 白名單 |
| **ASI03 權限過度** | 發起超額轉帳掏空金庫 | 嚴格執行單筆上限、每日預算與速率限制 |
| **ASI06 上下文投毒** | 偽造審核 Token 誘騙簽名 | EIP-712 結構化綁定，上下文隔離無縫過濾 |
| **ASI08 連鎖失效** | 網路重放或併發雙花 | 32 位元組隨機 Nonce 原子鎖定與結算冪等性 |
| **ASI09 誤導性摘要** | 偽造成功回執矇混過關 | 唯讀驗證與可解釋的 Fail-Closed 判定 |

---

## 6. 三級金庫金鑰階層 (Key Hierarchy)

- **Level 1 (根金庫 Root Treasury)**：離線 / 多簽冷金庫（Multisig Vault），負責資金池撥款。
- **Level 2 (資金池 Funding Pool)**：受監控的營運緩衝區，設定全域每日限額。
- **Level 3 (工作階段金鑰 Session Key)**：短效、任務範圍綁定、隨時可被撤銷（Revocable）的隔離簽章金鑰。

---

## 7. 遵循之核心國際標準與技術協定

- **x402 Protocol (v2)**：Coinbase & IETF 草案標準微額數據付費協定。
- **ERC-3009**：`transferWithAuthorization` Base L2 零瓦斯（Gasless）代幣授權轉帳。
- **EIP-712**：以太坊型別化結構數據雜湊與簽章標準。
- **ERC-8004**：鏈上 AI Agent 身份認證、信任註冊表與 Staked SLA 違約罰扣合約。
- **OASIS STIX 2.1**：結構化網路威脅情報表達標準（Structured Threat Information Expression）。
- **Model Context Protocol (MCP)**：Anthropic 官方開放式 AI 代理人工具互操作協定。
