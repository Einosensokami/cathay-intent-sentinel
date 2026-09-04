import {
  ControlledRetryClient,
  type AgentClientOptions,
  type FetchLike,
  type RequestContext,
} from "./client.js";

export type PaymentFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
  context?: RequestContext,
) => Promise<Response>;

/**
 * Wrap native fetch with the controlled x402 retry loop.
 *
 * Supported forms are intentionally small and ergonomic:
 *   wrapFetchWithPayment(client)
 *   wrapFetchWithPayment(client, fetch)
 *   wrapFetchWithPayment(fetch, options)
 *   wrapFetchWithPayment(options)
 */
export function wrapFetchWithPayment(
  client: ControlledRetryClient,
  fetcher?: FetchLike,
): PaymentFetch;
export function wrapFetchWithPayment(
  fetcher: FetchLike,
  options: AgentClientOptions,
): PaymentFetch;
export function wrapFetchWithPayment(options: AgentClientOptions): PaymentFetch;
export function wrapFetchWithPayment(
  first: ControlledRetryClient | FetchLike | AgentClientOptions,
  second?: FetchLike | AgentClientOptions,
): PaymentFetch {
  let client: ControlledRetryClient;
  if (first instanceof ControlledRetryClient) {
    client = first;
    if (second && typeof second !== "function") {
      throw new TypeError("A client cannot be combined with client options");
    }
    // The client already owns its fetcher. The optional fetch argument is kept
    // for API readability and future adapter compatibility.
  } else if (typeof first === "function") {
    if (!second || typeof second === "function") {
      throw new TypeError("wrapFetchWithPayment(fetch, options) requires client options");
    }
    client = new ControlledRetryClient({ ...second, fetch: first });
  } else {
    if (second !== undefined) throw new TypeError("Options-only form accepts one argument");
    client = new ControlledRetryClient(first);
  }
  return (input, init, context) => client.fetch(input, init, context);
}
