import type { JsonObject, PaymentRequirements, PaymentScheme, PaymentFlow } from "./types.js";

export const BASE_MAINNET = "eip155:8453" as const;
export const BASE_SEPOLIA = "eip155:84532" as const;
export const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const EXACT_EIP3009 = "eip3009" as const;
export const UPTO_PERMIT2 = "permit2" as const;
export const BATCH_SETTLEMENT = "batch-settlement" as const;

export interface SchemeSpecification {
  readonly scheme: PaymentScheme;
  readonly assetTransferMethod: string;
  readonly paymentFlow: PaymentFlow;
  readonly settlement: "immediate" | "deferred";
  readonly supportedNetworks: readonly string[];
  readonly requiredExtra: readonly string[];
  readonly forbiddenExtraValues?: Readonly<Record<string, string>>;
  readonly errorCodes: readonly string[];
}

export const EXACT_EIP3009_SPEC = {
  scheme: "exact",
  assetTransferMethod: EXACT_EIP3009,
  paymentFlow: "authorization",
  settlement: "immediate",
  supportedNetworks: [BASE_MAINNET, BASE_SEPOLIA],
  requiredExtra: ["name", "version"],
  errorCodes: [
    "invalid_exact_evm_payload_authorization_valid_after",
    "invalid_exact_evm_payload_authorization_valid_before",
    "invalid_exact_evm_payload_authorization_value_mismatch",
    "invalid_exact_evm_payload_signature",
    "invalid_exact_evm_payload_recipient_mismatch",
  ],
} as const satisfies SchemeSpecification;

export const UPTO_PERMIT2_SPEC = {
  scheme: "upto",
  assetTransferMethod: UPTO_PERMIT2,
  paymentFlow: "authorization",
  settlement: "immediate",
  supportedNetworks: [BASE_MAINNET, BASE_SEPOLIA],
  requiredExtra: ["assetTransferMethod"],
  errorCodes: ["invalid_upto_evm_payload_settlement_exceeds_amount"],
} as const satisfies SchemeSpecification;

export const BATCH_SETTLEMENT_SPEC = {
  scheme: "batch-settlement",
  assetTransferMethod: "network-binding",
  paymentFlow: "authorization",
  settlement: "deferred",
  supportedNetworks: [BASE_MAINNET, BASE_SEPOLIA],
  requiredExtra: [],
  errorCodes: ["settlement_pending"],
} as const satisfies SchemeSpecification;

export const SUPPORTED_SCHEME_SPECIFICATIONS = [EXACT_EIP3009_SPEC, UPTO_PERMIT2_SPEC, BATCH_SETTLEMENT_SPEC] as const;
export const EXACT_SCHEME = EXACT_EIP3009_SPEC;
export const UPTO_SCHEME = UPTO_PERMIT2_SPEC;
export const BATCH_SETTLEMENT_SCHEME = BATCH_SETTLEMENT_SPEC;

export function getSchemeSpecification(scheme: string, assetTransferMethod?: string): SchemeSpecification | undefined {
  return SUPPORTED_SCHEME_SPECIFICATIONS.find(
    (spec) => spec.scheme === scheme && (assetTransferMethod === undefined || spec.assetTransferMethod === assetTransferMethod),
  );
}

export function assertExactEip3009Requirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & {
  scheme: "exact";
  extra: JsonObject & { name: string; version: string; assetTransferMethod?: "eip3009" };
} {
  if (requirements.scheme !== "exact") throw new Error("exact scheme is required");
  if (!EXACT_EIP3009_SPEC.supportedNetworks.some((network) => network === requirements.network)) throw new Error("unsupported Base network");
  const extra = requirements.extra;
  if (!extra || typeof extra.name !== "string" || typeof extra.version !== "string") {
    throw new Error("exact EIP-3009 requirements must include extra.name and extra.version");
  }
  if (extra.assetTransferMethod !== undefined && extra.assetTransferMethod !== EXACT_EIP3009) {
    throw new Error("exact EIP-3009 requires assetTransferMethod=eip3009");
  }
}

export function assertUptoPermit2Requirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & {
  scheme: "upto";
  extra: JsonObject & { assetTransferMethod: "permit2" };
} {
  if (requirements.scheme !== "upto") throw new Error("upto scheme is required");
  if (!UPTO_PERMIT2_SPEC.supportedNetworks.some((network) => network === requirements.network)) throw new Error("unsupported Base network");
  if (requirements.extra?.assetTransferMethod !== UPTO_PERMIT2) throw new Error("upto EVM requires assetTransferMethod=permit2");
}

/** Batch payload details remain network-binding-specific; unsupported bindings fail closed. */
export function assertBatchSettlementRequirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & { scheme: "batch-settlement" } {
  if (requirements.scheme !== BATCH_SETTLEMENT) throw new Error("batch-settlement scheme is required");
  if (!BATCH_SETTLEMENT_SPEC.supportedNetworks.some((network) => network === requirements.network)) throw new Error("unsupported Base network");
}
