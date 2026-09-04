import { DashboardState, PipelineStep } from "./types";

export const INITIAL_PIPELINE_STEPS: PipelineStep[] = [
  { id: 1, name: "任務觸發", subtext: "Agent 請求付費資源", status: "idle" },
  { id: 2, name: "402 報價挑戰", subtext: "資源伺服器挑戰", status: "idle" },
  { id: 3, name: "策略閘門審核", subtext: "6維意圖與 OWASP 審計", status: "idle" },
  { id: 4, name: "隔離金庫簽章", subtext: "EIP-712 離線簽署", status: "idle" },
  { id: 5, name: "L2 Gas 路由", subtext: "挑選 Base L2 最優路徑", status: "idle" },
  { id: 6, name: "結算中繼驗證", subtext: "/verify 唯讀檢查", status: "idle" },
  { id: 7, name: "鏈上狀態結算", subtext: "Base Sepolia ERC-3009", status: "idle" },
  { id: 8, name: "200 OK 交付", subtext: "原子級數據解鎖交付", status: "idle" },
];

export const INITIAL_STATE: DashboardState = {
  treasuryBalance: 9999.97,
  treasuryCap: 10000.0,
  activeScenario: null,
  isRunning: false,
  pipeline: INITIAL_PIPELINE_STEPS,
  transactions: [
    {
      id: "tx-init-01",
      timestamp: "14:10:02",
      scenario: "初始健康檢查",
      task: "系統自檢",
      merchant: "國泰認證閘道 (Cathay Verified)",
      merchantUrl: "https://api.cathay-verified.com/health",
      amount: "0.01 USDC",
      status: "settled",
      txHash: "0x8f2c3d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      explorerUrl: "https://sepolia.basescan.org/tx/0x8f2c3d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      reputationScore: 99,
    }
  ],
  threatAlerts: [],
  agentLogs: [
    { time: "14:10:00", text: "哨兵安全護欄已在 Base Sepolia (84532) 初始化完畢", type: "info" },
    { time: "14:10:02", text: "策略閘門已布防：6 維意圖約束生效中 (預設關閉 Fail-Closed 模式)", type: "success" },
    { time: "14:10:02", text: "金庫隔離：大模型上下文無法直接讀取或調用私鑰", type: "info" },
  ],
  policyGateArmed: true,
  activeModal: null,
};
