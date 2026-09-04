import { createServer } from "node:http";
import { Facilitator } from "./settle.js";
import { verifyPayment } from "./verify.js";
const MAX_BODY_BYTES = 1_048_576;
function json(response, status, body) {
    const encoded = JSON.stringify(body);
    response.statusCode = status;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(encoded);
}
function wireVerifyResponse(result) {
    return result.ok
        ? { isValid: true, ...(result.payer ? { payer: result.payer } : {}), ...(result.amount ? { amount: result.amount } : {}) }
        : { isValid: false, invalidReason: result.error?.message ?? "Payment verification failed", ...(result.error ? { errorCode: result.error.code } : {}) };
}
async function body(request) {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_BODY_BYTES)
            throw new Error("Request body is too large");
        chunks.push(buffer);
    }
    if (bytes === 0)
        throw new Error("Request body is required");
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function handleFacilitatorRequest(request, response, facilitator, options = {}) {
    if (request.method !== "POST" || (request.url !== "/verify" && request.url !== "/settle")) {
        json(response, 404, { error: "Not found" });
        return;
    }
    let parsed;
    try {
        const value = await body(request);
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("JSON object body is required");
        parsed = value;
    }
    catch (error) {
        options.onError?.(error, request);
        json(response, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
        return;
    }
    if (request.url === "/verify") {
        const result = await verifyPayment(parsed, facilitator.optionsForVerification);
        json(response, 200, wireVerifyResponse(result));
        return;
    }
    const idempotencyKey = typeof parsed.idempotency_key === "string" ? parsed.idempotency_key : request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string") {
        json(response, 400, { error: "Idempotency key is required" });
        return;
    }
    const result = await facilitator.settle({ ...parsed, idempotency_key: idempotencyKey });
    const requirements = (parsed.paymentRequirements ?? parsed.requirements);
    const transaction = result.record.explorerUrl ?? result.record.txHash ?? "";
    const settlementMeta = {
        ...(result.record.mode ? { mode: result.record.mode } : {}),
        ...(result.record.simulated !== undefined ? { simulated: result.record.simulated } : {}),
    };
    const wire = result.ok
        ? { success: true, transaction, ...settlementMeta, ...(result.record.explorerUrl ? { explorerUrl: result.record.explorerUrl } : {}), network: requirements?.network ?? "unknown", ...(result.record.payer ? { payer: result.record.payer } : {}) }
        : { success: false, errorReason: result.record.error ?? "Settlement failed", transaction, ...settlementMeta, ...(result.record.explorerUrl ? { explorerUrl: result.record.explorerUrl } : {}), network: requirements?.network ?? "unknown", ...(result.record.payer ? { payer: result.record.payer } : {}) };
    json(response, result.status === "unknown" ? 202 : result.ok ? 200 : 409, wire);
}
export function createFacilitatorServer(options) {
    const facilitator = new Facilitator(options);
    return createServer((request, response) => {
        void handleFacilitatorRequest(request, response, facilitator, options).catch((error) => {
            options.onError?.(error, request);
            if (!response.headersSent)
                json(response, 500, { error: "Internal facilitator error" });
            else
                response.destroy();
        });
    });
}
export const createServerForFacilitator = createFacilitatorServer;
export const createFacilitatorHttpServer = createFacilitatorServer;
