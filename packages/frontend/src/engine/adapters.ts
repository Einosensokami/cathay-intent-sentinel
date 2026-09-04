import type { Eip712Domain, Eip712TypedData, ExecutionMode, SettlementEvidence, SignatureEvidence } from "./types";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_NETWORK = "eip155:84532";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASESCAN_TX_ORIGIN = "https://sepolia.basescan.org/tx";

export const ERC3009_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export interface SignRequest {
  from: string;
  to: string;
  amountAtomic: string;
  nonce: string;
  validAfter: string;
  validBefore: string;
}

export function createErc3009TypedData(request: SignRequest): Eip712TypedData {
  return {
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      verifyingContract: BASE_SEPOLIA_USDC,
    },
    types: {
      EIP712Domain: [...ERC3009_TYPES.EIP712Domain],
      TransferWithAuthorization: [...ERC3009_TYPES.TransferWithAuthorization],
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
  };
}

/** EIP-712 uses Keccak-256 (not the NIST SHA-3 padding variant). */
export function domainSeparatorHash(domain: Eip712Domain): string {
  const encoded = concatBytes(
    keccak256Bytes(new TextEncoder().encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
    keccak256Bytes(new TextEncoder().encode(domain.name)),
    keccak256Bytes(new TextEncoder().encode(domain.version)),
    uint256Bytes(BigInt(domain.chainId)),
    addressBytes(domain.verifyingContract),
  );
  return bytesToHex(keccak256Bytes(encoded));
}

export function typedDataDigest(typedData: Eip712TypedData): string {
  const message = typedData.message;
  const encoded = concatBytes(
    keccak256Bytes(new TextEncoder().encode("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")),
    addressBytes(message.from),
    addressBytes(message.to),
    uint256Bytes(BigInt(message.value)),
    uint256Bytes(BigInt(message.validAfter)),
    uint256Bytes(BigInt(message.validBefore)),
    hexBytes(message.nonce, 32),
  );
  const structHash = keccak256Bytes(encoded);
  return bytesToHex(keccak256Bytes(concatBytes(new Uint8Array([0x19, 0x01]), hexBytes(domainSeparatorHash(typedData.domain), 32), structHash)));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
  return bytesToHex(sha256Bytes(bytes));
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
    const typedData = createErc3009TypedData(request);
    const domainHash = domainSeparatorHash(typedData.domain);
    const digest = typedDataDigest(typedData);
    const evidenceHash = await sha256Hex(canonicalJson({ domainSeparatorHash: domainHash, digest, typedData }));
    return {
      // The mock adapter has no custody key. This is a deterministic cryptographic
      // proof of the exact EIP-712 payload, clearly labelled as non-authorization.
      signature: `mock:eip712:${digest}`,
      nonce: request.nonce,
      typedData,
      domainSeparatorHash: domainHash,
      evidenceHash,
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
      simulated: true,
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

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

const MASK_64 = (1n << 64n) - 1n;
const ROTATION: readonly (readonly number[])[] = [
  [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
];
const ROUND_CONSTANTS = [
  1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n, 0x808bn, 0x80000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x8an, 0x88n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n,
];

function keccak256Bytes(input: Uint8Array): Uint8Array {
  const rate = 136;
  const paddedLength = Math.ceil((input.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLength || rate);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state = Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) state[lane] ^= readLane(padded, offset + lane * 8);
    keccakF(state);
  }
  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  return output;
}

function keccakF(state: bigint[]): void {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = Array<bigint>(5).fill(0n);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) c[x] ^= state[x + 5 * y];
    const d = c.map((_, x) => c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1));
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) state[x + 5 * y] ^= d[x];
    const b = Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROTATION[x][y]);
    for (let x = 0; x < 5; x += 1) for (let y = 0; y < 5; y += 1) state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]);
    state[0] ^= roundConstant;
  }
}

function rotl(value: bigint, shift: number): bigint {
  if (shift === 0) return value & MASK_64;
  return ((value << BigInt(shift)) | (value >> BigInt(64 - shift))) & MASK_64;
}

function readLane(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  return value;
}

function uint256Bytes(value: bigint): Uint8Array { return hexBytes(value.toString(16), 32); }
function addressBytes(value: string): Uint8Array { return hexBytes(value.replace(/^0x/i, ""), 32); }
function hexBytes(value: string, length: number): Uint8Array { const normalized = value.replace(/^0x/i, "").padStart(length * 2, "0"); if (normalized.length !== length * 2 || !/^[0-9a-f]+$/i.test(normalized)) throw new TypeError("Invalid EIP-712 hexadecimal value"); return Uint8Array.from(normalized.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16)); }
function concatBytes(...values: Uint8Array[]): Uint8Array { const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0)); let offset = 0; for (const value of values) { output.set(value, offset); offset += value.length; } return output; }
function bytesToHex(value: Uint8Array): string { return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`; }

function sha256Bytes(input: Uint8Array): Uint8Array {
  // Fallback for runtimes without Web Crypto. Browser and Node normally use subtle.digest above.
  const words = new Uint32Array(64);
  const bitLength = input.length * 8;
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  padded.set(input); padded[input.length] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, bitLength, false);
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const k = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) words[i] = new DataView(padded.buffer, offset + i * 4, 4).getUint32(0, false);
    for (let i = 16; i < 64; i += 1) { const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3); const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10); words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, j] = h;
    for (let i = 0; i < 64; i += 1) { const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ (~e & g); const temp1 = (j + s1 + ch + k[i] + words[i]) >>> 0; const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const maj = (a & b) ^ (a & c) ^ (b & c); const temp2 = (s0 + maj) >>> 0; [j, g, f, e, d, c, b, a] = [g, f, e, (d + temp1) >>> 0, c, b, a, (temp1 + temp2) >>> 0]; }
    h = h.map((value, i) => (value + [a, b, c, d, e, f, g, j][i]) >>> 0);
  }
  const output = new Uint8Array(32); h.forEach((value, i) => new DataView(output.buffer).setUint32(i * 4, value, false)); return output;
}
function rotr(value: number, shift: number): number { return (value >>> shift) | (value << (32 - shift)); }
