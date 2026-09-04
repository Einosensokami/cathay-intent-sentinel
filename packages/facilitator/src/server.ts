import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { FacilitatorOptions } from "./settle.js";
import { Facilitator, type SettleRequest } from "./settle.js";
import { verifyPayment, type VerifyRequest } from "./verify.js";

const MAX_BODY_BYTES = 1_048_576;

function json(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(encoded);
}

async function body(request: IncomingMessage): Promise<unknown> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  if (bytes === 0) throw new Error("Request body is required");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export interface FacilitatorHttpOptions extends FacilitatorOptions {
  onError?: (error: unknown, request: IncomingMessage) => void;
}

export async function handleFacilitatorRequest(request: IncomingMessage, response: ServerResponse, facilitator: Facilitator, options: Pick<FacilitatorHttpOptions, "onError"> = {}): Promise<void> {
  if (request.method !== "POST" || (request.url !== "/verify" && request.url !== "/settle")) {
    json(response, 404, { error: "Not found" });
    return;
  }
  let parsed: Record<string, unknown>;
  try {
    const value = await body(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object body is required");
    parsed = value as Record<string, unknown>;
  } catch (error) {
    options.onError?.(error, request);
    json(response, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
    return;
  }
  if (request.url === "/verify") {
    const result = await verifyPayment(parsed as unknown as VerifyRequest, facilitator.optionsForVerification);
    json(response, 200, result);
    return;
  }
  const idempotencyKey = typeof parsed.idempotency_key === "string" ? parsed.idempotency_key : request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string") {
    json(response, 400, { error: "Idempotency key is required" });
    return;
  }
  const result = await facilitator.settle({ ...parsed, idempotency_key: idempotencyKey } as unknown as SettleRequest);
  json(response, result.status === "unknown" ? 202 : result.ok ? 200 : 409, result);
}

export function createFacilitatorServer(options: FacilitatorHttpOptions): Server {
  const facilitator = new Facilitator(options);
  return createServer((request, response) => {
    void handleFacilitatorRequest(request, response, facilitator, options).catch((error) => {
      options.onError?.(error, request);
      if (!response.headersSent) json(response, 500, { error: "Internal facilitator error" });
      else response.destroy();
    });
  });
}

export const createServerForFacilitator = createFacilitatorServer;
