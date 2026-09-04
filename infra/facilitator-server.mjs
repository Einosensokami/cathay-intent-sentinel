import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  BaseSepoliaSubmitter,
  Facilitator,
  handleFacilitatorRequest,
} from "@intent-sentinel/facilitator";

const host = process.env.FACILITATOR_HOST ?? "0.0.0.0";
const port = Number(process.env.FACILITATOR_PORT ?? "8081");
const runtimeMode = process.env.FACILITATOR_RUNTIME_MODE ?? "production";

function mockOptions() {
  return {
    balanceReader: { getBalance: async () => 0n },
    nonceStore: {
      consumed: new Set(),
      async isConsumed(nonce) { return this.consumed.has(nonce); },
      async consume(nonce) { if (this.consumed.has(nonce)) return false; this.consumed.add(nonce); return true; },
      async release(nonce) { this.consumed.delete(nonce); },
    },
    submitter: new BaseSepoliaSubmitter({ settlement_mode: "mock" }),
  };
}

async function loadOptions() {
  if (runtimeMode === "mock") return mockOptions();
  const adapterPath = process.env.FACILITATOR_ADAPTER_MODULE;
  if (!adapterPath) throw new Error("FACILITATOR_ADAPTER_MODULE is required in production");
  const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
  if (typeof adapter.createFacilitatorOptions !== "function") {
    throw new Error("Facilitator adapter must export createFacilitatorOptions");
  }
  return adapter.createFacilitatorOptions({ env: process.env });
}

let facilitator;
let startupError;
try {
  facilitator = new Facilitator(await loadOptions());
} catch (error) {
  startupError = error instanceof Error ? error.message : "Facilitator adapter failed to load";
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(value));
}

const server = createServer((request, response) => {
  if (request.url === "/healthz" && request.method === "GET") {
    json(response, 200, { ok: true });
    return;
  }
  if (request.url === "/readyz" && request.method === "GET") {
    json(response, facilitator ? 200 : 503, facilitator ? { ok: true } : { ok: false, error: startupError });
    return;
  }
  if (!facilitator) {
    json(response, 503, { error: "Facilitator is not ready" });
    return;
  }
  void handleFacilitatorRequest(request, response, facilitator).catch(() => {
    if (!response.headersSent) json(response, 500, { error: "Internal facilitator error" });
    else response.destroy();
  });
});

server.listen(port, host, () => {
  process.stdout.write(`facilitator listening on ${host}:${port} (${runtimeMode})\n`);
});
