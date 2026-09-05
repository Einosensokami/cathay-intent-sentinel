# IntentSentinel 生產維運與部屬手冊 (Operations Runbook)

本文件定義 IntentSentinel 於容器化、Kubernetes 或雲端環境下的維運拓撲、安全性加固、監控告警與超時對帳指引。

---

## 1. 服務拓撲架構 (Service Topology)

```text
瀏覽器 (Client) ──► TLS / Ingress 反向代理 (HTTPS)
                         │
                         ├──► 前端容器 (Nginx :8080)
                         └──► Facilitator API 容器 (:8081) ──► 政策風控閘門
                                                                  ├──► Base Sepolia RPC
                                                                  ├──► KMS / HSM 簽章服務
                                                                  └──► Nonce / 審計持久化儲存
```

- **網路隔離原則**：TLS 憑證於 Ingress 入口卸載；Facilitator API 僅對內部或授權代理人開放；RPC 節點、KMS 金鑰與審計資料庫嚴禁對公網直接暴露。

---

## 2. 容器化建置與本地快速測試 (Build & Local Smoke Test)

```bash
# 透過 Docker Compose 建置並啟動服務
docker compose -f infra/docker-compose.yml build --pull
docker compose -f infra/docker-compose.yml up -d

# 檢查健康狀態
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8081/healthz
curl -fsS http://127.0.0.1:8081/readyz
```

---

## 3. 生產環境部署檢核清單 (Production Deployment Checklist)

1. **環境變數安全注入**：
   - 生產金鑰與連線字串必須透過 AWS Secrets Manager、GCP Secret Manager 或 Vault 注入，**嚴禁提交至 Git 或寫死於 Dockerfile**。
2. **生產級簽章介面 (`FACILITATOR_ADAPTER_MODULE`)**：
   - 生產環境必須接入硬體安全模組（Cloud KMS / HSM）或多簽金庫，嚴禁使用明文私鑰。
3. **健康檢查門禁**：
   - 存活性檢查（Liveness）：使用 `/healthz`（僅檢查行程存活，不發起 RPC）。
   - 就緒性檢查（Readiness）：使用 `/readyz`（確認資料庫、KMS 與 RPC 連線正常）。
4. **滾動更新 (Rolling Update)**：
   - 必須於 Nonce 儲存庫遷移完成並確認無待對帳交易後，方可執行版本滾動更新。

---

## 4. 容器與主機安全性加固 (Security Hardening)

- **非 Root 使用者運行**：所有映像檔強制以 `non-root` 身份執行。
- **唯讀檔案系統 (`read_only: true`)**：除必要的暫存目錄（`tmpfs`）外，容器根檔案系統一律設定為唯讀。
- **最小權限原則**：關閉 `no-new-privileges`，移除不必要的 Linux Capabilities。
- **請求大小限制**：Facilitator 請求本文上限強制設為 `1 MiB`，防止記憶體耗盡攻擊。
- **出口白名單 (Egress Filtering)**：僅允許連線至核准之 Base Sepolia RPC 節點、KMS 與威脅情資伺服器。

---

## 5. 監控指標與警報策略 (Monitoring & Alerts)

| 監控項目 | 觸發警報條件 | 應變處置措施 |
| :--- | :--- | :--- |
| **就緒性失效 (`/readyz`)** | 連續 3 次探測失敗 | 檢查 RPC 節點延遲與 KMS 連線狀態 |
| **政策大量阻斷 (Deny Spike)** | 1 分鐘內阻斷次數 > 50 次 | 調閱 STIX 2.1 情資日誌，確認是否遭受分散式注入攻擊 |
| **Nonce 重複衝突** | 1 分鐘內出現 > 5 次 409 Conflict | 檢查是否有異常 Agent 在進行並發雙花或重放攻擊 |
| **超時未知交易 (`UNKNOWN`)** | 出現未決對帳交易 | 啟動對帳工作（Reconciliation Worker）查驗鏈上最終狀態 |

---

## 6. 超時對帳與異常復原 (Timeout Reconciliation)

當發送 RPC 廣播遇到網路逾時，該筆交易狀態會被標記為 `UNKNOWN`：
1. **絕不自動發起重試**：防止因延遲確認引發重複付款。
2. **鎖定 Nonce**：在鏈上狀態未明確前，該 Nonce 禁止被其他任務使用。
3. **對帳程序**：後台 Reconciler 透過獨立查詢節點查驗該 Hash 是否上鏈，確認後方可更新為 `SETTLED` 或 `REJECTED` 並解鎖預算。
