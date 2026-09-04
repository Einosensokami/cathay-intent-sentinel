/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SENTINEL_HTTP_URL?: string;
  readonly VITE_EVENT_TRANSPORT?: "sse" | "websocket" | "polling" | "none";
  readonly VITE_EXECUTION_MODE?: "mock" | "live";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Host integration may provide one ephemeral, already-signed x402 payload. It is never persisted by the dashboard. */
  __INTENTSENTINEL_PAYMENT__?: {
    paymentPayload?: unknown;
    paymentRequirements?: unknown;
    payer?: string;
  };
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SENTINEL_HTTP_URL?: string;
  readonly VITE_EVENT_TRANSPORT?: "sse" | "websocket" | "polling" | "none";
  readonly VITE_EXECUTION_MODE?: "mock" | "live";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
