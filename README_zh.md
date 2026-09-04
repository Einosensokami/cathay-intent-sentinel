# Cathay IntentSentinel (國泰意圖哨兵)

[English](README.md) | [繁體中文](README_zh.md)

> **「x402 協議讓 AI 代理人的支付成為可能；IntentSentinel 則讓這一切安全合規。」**

**Cathay IntentSentinel** 是一套專為自主 AI 代理人（Autonomous AI Agents）打造的**策略約束型金融安全閘道與支付基礎設施**。
它允許 AI Agent 自主探索 x402 服務報價、提出支付意圖，並在完全不接觸錢包私鑰的情況下，為付費資源（API、研報、算力）進行零瓦斯（Gasless）即時結算。

在私鑰簽章者被調用前，每一筆支付都必須通過 **任務 ID、商戶白名單、資產/網路、預算上限、過期時間與 6 維策略門禁（Policy Gate）** 的嚴格審查。

---

## 🏛️ 系統架構（4 層邊界隔離）

```text
       不可信的提示詞 / 大模型生成內容
                  │  僅提出支付意圖 (Intent)
                  ▼
    ┌──────────────────────────────┐
    │  01 推理層：Agent Client      │── HTTP 請求 ─┐
    └──────────────────────────────┘              │
                  │                               ▼ 402 PAYMENT-REQUIRED
                  ▼                        ┌───────────────┐
    ┌──────────────────────────────┐       │ 付費資源伺服器 │
    │  02 策略層：IntentSentinel    │◄──────│ (Resource)    │
    │  任務·收款方·預算上限·有效期   │       └───────┬───────┘
    └───────────────┬──────────────┘               │ 合法 PAYMENT-SIGNATURE
                    │ 核准之意圖                   ▼
                    ▼                        ┌───────────────┐
    ┌──────────────────────────────┐         │ 04 結算層：    │
    │  03 金庫層：Scoped Key Vault │──簽章──►│ Facilitator   │
    │  僅支援 ERC-3009 / EIP-712   │         │ 驗證與鏈上結算│
    └──────────────────────────────┘         └───────┬───────┘
                    ▲                                │
                    └──────── PAYMENT-RESPONSE + 審計收據
```

### 受控單次重試有限狀態機（Finite State Machine）

```text
發起請求 ➔ 402 報價挑戰 ➔ 意圖綁定 ➔ 策略閘門審查 (Policy Gate)
                              │             │
                       拒絕 (Deny)   核准 (Allow)
                              │             │
                              ▼             ▼
                          中斷並記錄     金庫簽章 ➔ 單次重試 ➔ 鏈上結算 ➔ 200 OK 交付
```

- **Fail-Closed 預設關閉**：未經策略閘門核准的意圖絕不簽章。
- **單次重試保護**：杜絕無限重試扣款。
- **超時視為未知狀態**：網路超時絕非二次扣款許可，需進入審計待對帳佇列。

---

## 👑 5 大奪冠級創新特性

1. **雙引擎鏈上結算（Dual-Engine: Base Sepolia On-Chain + Fast Fallback）**：
   - 支援真實 Base Sepolia (Chain ID 84532) ERC-3009 廣播，即時生成可上 Basescan 查驗的交易 URL。
   - 嚴格遵守「Fallback before authorization, never after」金融鐵律。
2. **ERC-8004 鏈上身份與 Staked SLA 抵押保證金**：
   - 直連 Base Sepolia 查詢 ERC-8004 智能合約，驗證 Agent 身份與聲譽評分。
   - 實作履約質押機制：商戶若交付劣質情資，自動觸發鏈上保證金扣罰（Slash）。
3. **A2A 多代理人動態談判協議（A2ANegotiator）**：
   - 買賣雙方 Agent 進行自主動態商務談判（成功以量制價砍價 40%），並簽署雙方 EIP-712 法律承諾書。
4. **跨 L2 最優 Gas 與延遲智慧路由（CrossL2GasRouter）**：
   - 即時比較 Base L2、Arbitrum One、Polygon 費率，動態挑選成本最低之結算網路。
5. **OWASP ASI 威脅情報自動生成（STIX 2.1 Threat Intel）**：
   - 將任何被 Policy Gate 攔截的 Prompt Injection 攻擊自動脫敏轉化為標準 STIX 2.1 格式，即時推播至企業 SOC 中心。

---

## 🛡️ OWASP ASI01~ASI09 威脅防禦矩陣

| OWASP 威脅代號 | 攻擊情境 | IntentSentinel 防禦機制 |
| :--- | :--- | :--- |
| **ASI01 目標劫持** | 提示詞攻擊誘騙 Agent 竄改目標 URL | 強制綁定 `resource_url`，非白名單立即阻斷。 |
| **ASI02 工具濫用** | 攻擊者替換收款錢包為駭客地址 | 嚴格比對 `allowed_payee_addresses`，商戶不符直接拒絕。 |
| **ASI03 權限過度** | 發起超大額轉帳掏空金庫 | 嚴格執行 `per_call_budget_cap` 與 `daily_budget_cap` 熔斷。 |
| **ASI06 上下文投毒** | 偽造已審批 Token 誘騙簽名 | EIP-712 簽章參數與意圖原子級綁定，不可偽造。 |
| **ASI08 連鎖失效** | 重放簽名或發起高併發雙花 | Nonce 原子鎖定與結算冪等性，杜絕重複扣款。 |

---

## ⚡ 快速啟動（Quickstart）

### 1. 安裝與建置

```bash
# 安裝所有 Monorepo 依賴
npm install

# 執行全套 TypeScript 編譯 (包含 6 大套件與前端)
npm run build

# 執行 39 組自動化單元與紅隊安全測試
npm test
```

### 2. 啟動 Web 雙面板視覺化儀表板

```bash
# 啟動現代 Cyber-Fintech Web 前台
npm run frontend
# 瀏覽器開啟: http://localhost:3000
```

### 3. 執行 4 大終端 Live Demo 劇本

```bash
# 場景 1: 正常 0.01 USDC 情報購買
npx tsx packages/demo/src/01_legitimate_flow.ts

# 場景 2: 🛑 Prompt Injection 攻擊攔截 (紅燈熔斷，資金 1 毛沒少)
npx tsx packages/demo/src/02_prompt_injection_blocked.ts

# 場景 3: 動態流式 Token 計費
npx tsx packages/demo/src/03_streaming_upto_flow.ts

# 場景 4: 👑 5 大創新王炸完整閉環 (談判 ➔ 信用 ➔ 路由 ➔ 鏈上結算 ➔ TUI 儀表板)
npx tsx packages/demo/src/04_a2a_negotiation_and_onchain.ts
```

---

## 📦 專案結構（Monorepo）

```text
cathay-intent-sentinel/
├── packages/
│   ├── core/               # x402 v2 標頭編解碼、6 維 PaymentIntent、ERC-3009 EIP-712
│   ├── key-vault/          # 隔離式 ScopedKeyVault、3-tier 金鑰階層 (Root/Pool/Session)
│   ├── policy-engine/      # Fail-Closed 策略門禁、OWASP 防禦、ERC-8004、Staked SLA、STIX 情資
│   ├── facilitator/        # Base Sepolia 雙引擎結算、Cross-L2 路由、驗證/結算 API
│   ├── agent-client/       # A2A 談判協議、8 步受控重試、402 中間件
│   ├── demo/               # 4 大 Live Demo 展示腳本與 TUI 即時儀表板
│   └── frontend/           # 雙面板視覺化 React Web 控制台 (Vite + Tailwind)
├── ARCHITECTURE.md         # 4 層解耦架構藍圖
├── INNOVATIONS_AND_GRILL_REPORT.md # 5 大創新技術規格與評審 Runbook
├── HACKATHON_TRACK_PITCH.md# 雙賽道對標攻略
├── PITCH_DECK_AND_DEMO_RUNBOOK.md  # 3 分鐘 Demo 講稿與評審 Q&A 拆招
├── README.md               # 英文版文件
├── README_zh.md            # 繁體中文版文件
└── LICENSE                 # MIT License
```

---

## 📄 授權條款

本專案採用 [MIT License](LICENSE) 開源授權。
