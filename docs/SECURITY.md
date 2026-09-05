# IntentSentinel 安全政策與生產環境資安檢核表 (Security Policy)

IntentSentinel 負責處理自主 AI Agent 的金融金流授權與不可信外部資料，每一處部署均視為最高安全防禦邊界。

---

## 1. 生產環境發布資安檢核清單 (Release Security Checklist)

- [x] **身份驗證與預設阻斷 (Fail-Closed Auth)**：API 網關與服務邊界強制實施身分驗證；所有未驗證、格式錯誤、過期或無法驗證的請求一律 Fail-Closed 拒絕。
- [x] **租戶嚴格隔離 (Tenant Isolation)**：租戶身分由已驗證的憑證解析而來，嚴禁信任請求本文傳入的偽造租戶 ID。政策、預算、Nonce、審計日誌均按租戶嚴密隔離。
- [x] **精確 CORS 與 CSRF 防護**：CORS 採用精確白名單（Strict Origin Allowlist），嚴禁搭配萬用字元 `*`。狀態變更請求採用嚴格的 Bearer Token 機制。
- [x] **多維度速率限制 (Rate Limiting)**：按租戶、調用者、IP 與敏感操作實施限制。驗證、結算與登入端點獨立限流，限流服務故障時預設 Fail-Closed。
- [x] **私鑰隔離與零儲存 (Zero Key Custody)**：簽章私鑰絕不進入版本控制、Docker 映像檔、日誌、前端打包或長時間駐留於普通應用程式記憶體。生產環境簽章委由 KMS / HSM 執行。
- [x] **RPC 節點通訊隱私與白名單**：RPC 連線採用白名單、TLS 加密與超時限制。絕不將原始提示詞、租戶隱私或未脫敏簽章傳送至公開第三方。
- [x] **防篡改審計日誌 (Tamper-evident Audit Trail)**：審計事件具備雜湊鏈結（Hash-chained）或防篡改儲存，敏感欄位自動脫敏，保存期限符合金融法遵要求。
- [x] **超時未知狀態不重試 (No Auto-Retry on Timeout)**：逾時交易嚴禁自動重發，Nonce 持續鎖定並進入待對帳佇列，杜絕重複扣款。
- [x] **零機密洩漏 (Zero Secrets Committed)**：CI/CD 流程整合 Gitleaks 敏感資訊掃描，防止任何金鑰或 Token 進入程式庫。
- [x] **邊界防護與輸入長度限制 (Bounded Inputs)**：在執行繁重複雜運算前，嚴格限制請求 Body 大小（1 MiB）、JSON 格式、數值範圍、URL 協定與白名單資產。
- [x] **模擬與真實憑證嚴格區隔**：模擬收據明確標記 `MOCK`，絕不生成虛假的區塊鏈瀏覽器連結；授權發起後嚴禁降級為模擬。

---

## 2. 敏感資料與威脅樣本脫敏規範 (Data Handling & Redaction)

1. **不可信樣本隔離**：外部惡意提示詞、釣魚注入樣本視為高危險隔離資料（Quarantined Data），不可直接存入公開日誌。
2. **STIX 2.1 脫敏輸出**：對外推播威脅情報時，僅輸出脫敏後的抽象行為模式（Pattern）、攻擊類型（`ASI01`）、信心度與證據 SHA-256 雜湊值。
3. **私鑰與憑證脫敏**：金鑰簽章、Bearer Token、Cookie 等敏感資訊在日誌輸出前必須強制 Redaction（例如 `0x1479...9325`）。

---

## 3. 安全漏洞通報機制 (Vulnerability Reporting)

若在 IntentSentinel 專案中發現任何潛在安全威脅或架構漏洞，請循負責任揭露（Responsible Disclosure）流程通報：
- **通報管道**：請透過 GitHub Security Advisory 或私訊專案維護者進行回報。
- **通報內容**：包含重現步驟、影響範圍評估與建議之修補方案。
- **原則**：在正式修復發布前，請勿在公開論壇或社群揭露可被利用的攻擊細節。
