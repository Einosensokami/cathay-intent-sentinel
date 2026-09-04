import type { ExecutionMode, SettlementEvidence, SignatureEvidence } from "./types";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_NETWORK = "eip155:84532";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASESCAN_TX_ORIGIN = "https://sepolia.basescan.org/tx";

export interface SignRequest {
  from: string;
  to: string;
  amountAtomic: string;
  nonce: string;
  validAfter: string;
  validBefore: string;
}

export interface PaymentAdapter {
  signErc3009(request: SignRequest): Promise<SignatureEvidence>;
  settle(request: SignRequest): Promise<SettlementEvidence>;
}

export interface EventStreamAdapter {
  readonly kind: "mock" | "websocket";
  connect(): Promise<void>;
  disconnect(): void;
  publish(event: unknown): void;
  subscribe(listener: (event: unknown) => void): () => void;
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) values[index] = (index * 37 + Date.now()) % 256;
  }
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function basescanUrl(txHash: string, mode: ExecutionMode = "live"): string | undefined {
  if (mode !== "live" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return undefined;
  return `${BASESCAN_TX_ORIGIN}/${txHash}`;
}

export const getBasescanUrl = basescanUrl;

export class MockPaymentAdapter implements PaymentAdapter {
  async signErc3009(request: SignRequest): Promise<SignatureEvidence> {
    await delay(240);
    return {
      signature: `mock:eip712:${randomHex(32)}`,
      nonce: request.nonce,
      typedData: {
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: BASE_SEPOLIA_CHAIN_ID,
          verifyingContract: BASE_SEPOLIA_USDC,
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: request.from,
          to: request.to,
          value: request.amountAtomic,
          validAfter: request.validAfter,
          validBefore: request.validBefore,
          nonce: request.nonce,
        },
      },
    };
  }

  async settle(request: SignRequest): Promise<SettlementEvidence> {
    await delay(380);
    return {
      txHash: `mock:${randomHex(16)}`,
      mode: "mock",
      verified: false,
      payer: request.from,
      payee: request.to,
      amountAtomic: request.amountAtomic,
      gasUsed: "0 (simulated)",
    };
  }
}

/** Browser-safe event transport used until an authenticated gateway is configured. */
export class MockWebSocketAdapter implements EventStreamAdapter {
  readonly kind = "mock" as const;
  private connected = true;
  private readonly listeners = new Set<(event: unknown) => void>();

  async connect(): Promise<void> {
    await delay(80);
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  publish(event: unknown): void {
    if (!this.connected) return;
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Optional live transport boundary. It never changes payment mode by itself. */
export class WebSocketEventAdapter implements EventStreamAdapter {
  readonly kind = "websocket" as const;
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<(event: unknown) => void>();

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    if (typeof WebSocket === "undefined") throw new Error("WebSocket is unavailable in this runtime");
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("Event gateway connection failed"));
      socket.onmessage = (message) => {
        try {
          const value: unknown = JSON.parse(String(message.data));
          this.listeners.forEach((listener) => listener(value));
        } catch {
          // Ignore malformed gateway frames at the presentation boundary.
        }
      };
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  publish(event: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(event));
  }

  subscribe(listener: (event: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createEventStream(url = ""): EventStreamAdapter {
  return url ? new WebSocketEventAdapter(url) : new MockWebSocketAdapter();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
