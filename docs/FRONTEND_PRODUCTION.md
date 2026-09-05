# IntentSentinel 前端架構與視覺化遙測規範 (Frontend Production)

本文件定義 `packages/frontend` 實作之前端架構、x402 虛擬數據市集 UI、即時遙測串流與憑證可信度規範。

---

## 1. 前端環境變數配置 (Configuration)

前端採用 Vite 建置，支援以下環境變數：

```ini
# API 基礎端點
VITE_API_BASE_URL=https://cathay-intent-sentinel.netlify.app/api/v1

# 事件串流傳輸模式 (sse | websocket | polling | none)
VITE_EVENT_TRANSPORT=sse

# 預設執行模式 (mock | live)
VITE_EXECUTION_MODE=mock
```

- **安全預設值**：本機開發與展示時預設採用安全模式，UI 介面明確標示「模擬 / Live」狀態，絕不將模擬數據偽造為鏈上憑證。

---

## 2. 前端架構與核心模組 (Architecture)

1. **`MarketplaceView.tsx`（虛擬數據市集首頁）**：
   - 包含 3 大 x402 數據商品卡片（VIP Threat Intel、Malicious Honeypot、Weather Feed）。
   - 整合即時金庫餘額、累計支出、OWASP 防禦防護等級與 STIX 2.1 攔截計數。
   - 底部提供「自然語言 Agent Prompt 快速模擬框」與預設指令膠囊。
2. **`Pipeline.tsx`（8 步即時管線視覺化）**：
   - 即時動畫流轉：`REQ (請求) ➜ CHAL (402報價) ➜ BIND (意圖綁定) ➜ POL (政策審查) ➜ SIGN (金庫簽章) ➜ FAC (促成結算) ➜ SETL (鏈上交付) ➜ REL (釋放研報)`。
3. **`PolicyInspector.tsx`（CFO 政策中心）**：
   - 提供單筆預算上限（Per-Tx Cap）、商戶白名單切換、OWASP 防禦等級切換與速率限制調整。
4. **`SecurityAuditView.tsx` & `StixModal.tsx`（資安審計與威脅情報彈窗）**：
   - 檢視遭攔截攻擊之 STIX 2.1 JSON 結構體、證據雜湊與脫敏欄位。

---

## 3. 證據誠實性原則 (Evidence & Provenance Rules)

為確保展示與生產環境之嚴謹性，前端嚴格遵守以下可信度原則：

- **模擬模式（Mock）**：收據明確標記 `MOCK 模擬`，`verified: false`，絕不生成虛假的 Basescan 連結。
- **真實結算（Live）**：僅當收到 Base Sepolia (`eip155:84532`) 廣播成功且附帶合法 32 位元組 Hash 時，才提供 `https://sepolia.basescan.org/tx/<hash>` 查驗連結。
- **Fail-Closed 視覺呈現**：一旦政策閘門阻斷或結算逾時，UI 即刻呈現紅色警示與阻斷原因，絕不靜默降級或忽略錯誤。

---

## 4. 建置與驗證指令 (Build & Verify)

在專案根目錄執行：

```bash
# 執行前端專屬單元測試
npm run test --workspace=@cathay/intent-sentinel-frontend

# 執行型別檢查
npm run typecheck --workspace=@cathay/intent-sentinel-frontend

# 執行正式生產打包
npm run build --workspace=@cathay/intent-sentinel-frontend
```
