import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, createApiClient, getRuntimeConfig } from "./client";

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

test("client uses the configured API boundary and correlation headers", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createApiClient({ baseUrl: "https://sentinel.example/api/v1", fetcher: async (url, init) => { calls.push({ url: String(url), init }); return response(200, { ok: true }); } });
  const result = await client.health({ requestId: "req-test", correlationId: "corr-test" });
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.url, "https://sentinel.example/api/v1/health");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-request-id"), "req-test");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-correlation-id"), "corr-test");
});

test("settlement carries an idempotency key and preserves unknown failures", async () => {
  let received: RequestInit | undefined;
  const client = createApiClient({ baseUrl: "/api/v1", fetcher: async (_url, init) => { received = init; return response(202, { success: false, transaction: "", errorReason: "Settlement outcome is unknown" }); } });
  const result = await client.settle({ idempotency_key: "idem-1", intent: { scenario: "legitimate", resource: "/q3", amount: "10000" } });
  assert.equal(result.success, false);
  assert.equal(result.errorReason, "Settlement outcome is unknown");
  assert.equal(new Headers(received?.headers).get("idempotency-key"), "idem-1");
});

test("server envelopes become bounded, typed errors with request metadata", async () => {
  const client = createApiClient({ fetcher: async () => response(409, { errorCode: "POLICY_DENIED", errorReason: "merchant mismatch" }, { "x-request-id": "req-server", "x-correlation-id": "corr-server" }) });
  await assert.rejects(() => client.verify({ intent: { scenario: "attack", resource: "/q3", amount: "500000000" } }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "POLICY_DENIED");
    assert.equal(error.requestId, "req-server");
    assert.equal(error.correlationId, "corr-server");
    return true;
  });
});

test("network failures are safe to retry and keep correlation metadata", async () => {
  const client = createApiClient({ fetcher: async () => { throw new Error("socket details must not reach the UI"); } });
  await assert.rejects(() => client.health({ correlationId: "corr-network" }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.equal(error.correlationId, "corr-network");
    assert.match(error.message, /無法連線/);
    assert.doesNotMatch(error.message, /socket details/);
    return true;
  });
});

test("runtime config defaults to same-origin API and never invents live configuration", () => {
  assert.deepEqual(getRuntimeConfig({}), { baseUrl: "/api/v1", eventTransport: "sse", liveConfigured: false });
  assert.deepEqual(getRuntimeConfig({ VITE_SENTINEL_HTTP_URL: "http://127.0.0.1:4040/" }), { baseUrl: "http://127.0.0.1:4040/api/v1", eventTransport: "sse", liveConfigured: true });
});
