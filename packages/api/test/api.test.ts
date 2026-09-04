import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { Server } from "node:http";
import { createApiServer } from "../src/server.js";
import { SafeMockFacilitator, createDevelopmentBearerTokenVerifier } from "../src/adapters.js";
import type { ApiOptions, FacilitatorAdapter, Principal, SettlementOutcome } from "../src/types.js";

const TOKEN = "test-only-token";
const principal: Principal = { subject: "operator-1", tenantId: "tenant-a", roles: ["operator", "agent"] };
const nonce = (suffix: string): string => `0x${suffix.padStart(64, "0")}`;

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const requirements = {
    scheme: "exact",
    network: "eip155:84532",
    amount: "1000",
    asset: "asset-a",
    payTo: "payee-a",
    maxTimeoutSeconds: 300,
  };
  return {
    tenantId: "tenant-a",
    x402Id: "x402_01JABCDEF1234567",
    paymentIntent: {
      paymentIntentId: "pi_01JABCDEF1234567",
      tenantId: "tenant-a",
      taskId: "task-123",
      resource: "https://merchant.example/resource",
      payee: "payee-a",
      maxAmount: "2000",
      asset: "asset-a",
      network: "eip155:84532",
      expiresAt: 4_000_000_000,
    },
    paymentPayload: {
      x402Version: 2,
      resource: "https://merchant.example/resource",
      accepted: requirements,
      payload: {
        authorization: {
          from: "payer-a",
          to: "payee-a",
          value: "1000",
          validAfter: "1",
          validBefore: "4000000000",
          nonce: nonce("1"),
        },
        signature: "0xsignature",
      },
    },
    paymentRequirements: requirements,
    ...overrides,
  };
}

async function start(options: ApiOptions = {}): Promise<{ server: Server; url: string }> {
  const server = createApiServer({
    auth: createDevelopmentBearerTokenVerifier({ token: TOKEN, principal }),
    ...options,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function request(server: { url: string }, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${server.url}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

async function close(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

test("health/readiness are public and responses carry security plus correlation headers", async () => {
  const running = await start();
  try {
    const response = await request(running, "/healthz", { headers: { authorization: "" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(response.headers.get("x-request-id"));
    assert.ok(response.headers.get("x-correlation-id"));
    const readiness = await request(running, "/readyz");
    assert.equal(readiness.status, 200);
    assert.equal((await readiness.json()).ok, true);
  } finally {
    await close(running.server);
  }
});

test("authentication, runtime validation, role authorization, and tenant isolation fail closed", async () => {
  const running = await start();
  try {
    const unauthenticated = await fetch(`${running.url}/api/v1/verify`, { method: "POST", body: "{}" });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error.code, "unauthenticated");

    const malformed = await request(running, "/api/v1/verify", { method: "POST", body: "not-json" });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "invalid_json");

    const wrongTenant = await request(running, "/api/v1/verify", { method: "POST", body: JSON.stringify(body({ tenantId: "tenant-b" })) });
    assert.equal(wrongTenant.status, 403);
    assert.equal((await wrongTenant.json()).error.code, "tenant_forbidden");

    const auditor: Principal = { subject: "auditor-1", tenantId: "tenant-a", roles: ["auditor"] };
    const auditorServer = await start({ auth: createDevelopmentBearerTokenVerifier({ token: TOKEN, principal: auditor }) });
    try {
      const denied = await request(auditorServer, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "audit-cannot-settle" }, body: JSON.stringify(body()) });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error.code, "forbidden");
      const crossTenantEvents = await request(auditorServer, "/api/v1/events?tenantId=tenant-b");
      assert.equal(crossTenantEvents.status, 403);
    } finally {
      await close(auditorServer.server);
    }
  } finally {
    await close(running.server);
  }
});

test("settlement idempotency is tenant/principal scoped and nonce replay is rejected", async () => {
  let calls = 0;
  const facilitator: FacilitatorAdapter = {
    verify: async () => ({ isValid: true, mode: "live", simulated: false }),
    settle: async (): Promise<SettlementOutcome> => {
      calls += 1;
      return { status: "settled", mode: "mock", simulated: true, txHash: "mock:stable" };
    },
  };
  const running = await start({ adapters: { facilitator } });
  try {
    const first = await request(running, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "settle-1" }, body: JSON.stringify(body()) });
    assert.equal(first.status, 200);
    const firstJson = await first.json();
    assert.equal(firstJson.data.idempotent, false);
    assert.equal(calls, 1);

    const replay = await request(running, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "settle-1" }, body: JSON.stringify(body()) });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get("idempotency-replayed"), "true");
    assert.equal((await replay.json()).data.idempotent, true);
    assert.equal(calls, 1);

    const conflict = await request(running, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "settle-1" }, body: JSON.stringify(body({ x402Id: "x402_01JABCDEF1234568" })) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, "idempotency_conflict");

    const nonceReplay = await request(running, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "settle-2" }, body: JSON.stringify(body({ x402Id: "x402_01JABCDEF1234568" })) });
    assert.equal(nonceReplay.status, 409);
    assert.equal((await nonceReplay.json()).error.code, "replay_detected");
    assert.equal(calls, 1);
  } finally {
    await close(running.server);
  }
});

test("CORS is exact allowlist and request bodies are bounded", async () => {
  const running = await start({ corsOrigins: ["https://console.example"] , maxBodyBytes: 64 });
  try {
    const allowed = await request(running, "/healthz", { headers: { origin: "https://console.example" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://console.example");
    const denied = await request(running, "/healthz", { headers: { origin: "https://evil.example" } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, "cors_origin_denied");
    const tooLarge = await request(running, "/api/v1/verify", { method: "POST", body: JSON.stringify(body()) });
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).error.code, "body_too_large");
  } finally {
    await close(running.server);
  }
});

test("adapter failures are returned as a safe JSON error envelope", async () => {
  const failing: FacilitatorAdapter = {
    verify: async () => { throw new Error("backend credential must not cross the boundary"); },
    settle: async () => ({ status: "unknown", mode: "live", simulated: false }),
  };
  const running = await start({ adapters: { facilitator: failing } });
  try {
    const response = await request(running, "/api/v1/verify", { method: "POST", body: JSON.stringify(body()) });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("x-error-boundary"), "fail-closed");
    const result = await response.json();
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "internal_error");
    assert.equal(result.error.message, "request failed");
    assert.equal(JSON.stringify(result).includes("backend credential"), false);
  } finally {
    await close(running.server);
  }
});

test("mock results stay honest and live explorer URLs require attestation plus a real hash", async () => {
  const mockRunning = await start({ adapters: { facilitator: new SafeMockFacilitator() } });
  try {
    const response = await request(mockRunning, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "mock-1" }, body: JSON.stringify(body()) });
    const result = await response.json();
    assert.equal(result.status, undefined);
    assert.equal(result.data.settlement.mode, "mock");
    assert.equal(result.data.settlement.simulated, true);
    assert.match(result.data.settlement.txHash, /^mock:/);
    assert.equal(result.data.settlement.explorerUrl, undefined);
  } finally {
    await close(mockRunning.server);
  }

  const hash = `0x${"a".repeat(64)}`;
  const live: FacilitatorAdapter = {
    verify: async () => ({ isValid: true, mode: "live", simulated: false }),
    settle: async () => ({ status: "settled", mode: "live", simulated: false, verifiedLive: true, txHash: hash, explorerUrl: `https://sepolia.basescan.org/tx/${hash}` }),
  };
  const liveRunning = await start({ adapters: { facilitator: live } });
  try {
    const response = await request(liveRunning, "/api/v1/settle", { method: "POST", headers: { "idempotency-key": "live-1" }, body: JSON.stringify(body({ x402Id: "x402_01JABCDEF1234568", paymentPayload: { ...(body().paymentPayload as Record<string, unknown>), payload: { ...((body().paymentPayload as Record<string, unknown>).payload as Record<string, unknown>), authorization: { ...(((body().paymentPayload as Record<string, unknown>).payload as Record<string, unknown>).authorization as Record<string, unknown>), nonce: nonce("2") } } } })) });
    const result = await response.json();
    assert.equal(result.data.settlement.explorerUrl, `https://sepolia.basescan.org/tx/${hash}`);
  } finally {
    await close(liveRunning.server);
  }
});
