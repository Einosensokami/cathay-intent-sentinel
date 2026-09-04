import type { JsonObject, PaymentRequirements, PaymentScheme, PaymentFlow } from "./types.js";
export declare const BASE_MAINNET: "eip155:8453";
export declare const BASE_SEPOLIA: "eip155:84532";
export declare const BASE_MAINNET_USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export declare const BASE_SEPOLIA_USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export declare const EXACT_EIP3009: "eip3009";
export declare const UPTO_PERMIT2: "permit2";
export declare const BATCH_SETTLEMENT: "batch-settlement";
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
export declare const EXACT_EIP3009_SPEC: {
    readonly scheme: "exact";
    readonly assetTransferMethod: "eip3009";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["name", "version"];
    readonly errorCodes: readonly ["invalid_exact_evm_payload_authorization_valid_after", "invalid_exact_evm_payload_authorization_valid_before", "invalid_exact_evm_payload_authorization_value_mismatch", "invalid_exact_evm_payload_signature", "invalid_exact_evm_payload_recipient_mismatch"];
};
export declare const UPTO_PERMIT2_SPEC: {
    readonly scheme: "upto";
    readonly assetTransferMethod: "permit2";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["assetTransferMethod"];
    readonly errorCodes: readonly ["invalid_upto_evm_payload_settlement_exceeds_amount"];
};
export declare const BATCH_SETTLEMENT_SPEC: {
    readonly scheme: "batch-settlement";
    readonly assetTransferMethod: "network-binding";
    readonly paymentFlow: "authorization";
    readonly settlement: "deferred";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly [];
    readonly errorCodes: readonly ["settlement_pending"];
};
export declare const SUPPORTED_SCHEME_SPECIFICATIONS: readonly [{
    readonly scheme: "exact";
    readonly assetTransferMethod: "eip3009";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["name", "version"];
    readonly errorCodes: readonly ["invalid_exact_evm_payload_authorization_valid_after", "invalid_exact_evm_payload_authorization_valid_before", "invalid_exact_evm_payload_authorization_value_mismatch", "invalid_exact_evm_payload_signature", "invalid_exact_evm_payload_recipient_mismatch"];
}, {
    readonly scheme: "upto";
    readonly assetTransferMethod: "permit2";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["assetTransferMethod"];
    readonly errorCodes: readonly ["invalid_upto_evm_payload_settlement_exceeds_amount"];
}, {
    readonly scheme: "batch-settlement";
    readonly assetTransferMethod: "network-binding";
    readonly paymentFlow: "authorization";
    readonly settlement: "deferred";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly [];
    readonly errorCodes: readonly ["settlement_pending"];
}];
export declare const EXACT_SCHEME: {
    readonly scheme: "exact";
    readonly assetTransferMethod: "eip3009";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["name", "version"];
    readonly errorCodes: readonly ["invalid_exact_evm_payload_authorization_valid_after", "invalid_exact_evm_payload_authorization_valid_before", "invalid_exact_evm_payload_authorization_value_mismatch", "invalid_exact_evm_payload_signature", "invalid_exact_evm_payload_recipient_mismatch"];
};
export declare const UPTO_SCHEME: {
    readonly scheme: "upto";
    readonly assetTransferMethod: "permit2";
    readonly paymentFlow: "authorization";
    readonly settlement: "immediate";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly ["assetTransferMethod"];
    readonly errorCodes: readonly ["invalid_upto_evm_payload_settlement_exceeds_amount"];
};
export declare const BATCH_SETTLEMENT_SCHEME: {
    readonly scheme: "batch-settlement";
    readonly assetTransferMethod: "network-binding";
    readonly paymentFlow: "authorization";
    readonly settlement: "deferred";
    readonly supportedNetworks: readonly ["eip155:8453", "eip155:84532"];
    readonly requiredExtra: readonly [];
    readonly errorCodes: readonly ["settlement_pending"];
};
export declare function getSchemeSpecification(scheme: string, assetTransferMethod?: string): SchemeSpecification | undefined;
export declare function assertExactEip3009Requirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & {
    scheme: "exact";
    extra: JsonObject & {
        name: string;
        version: string;
        assetTransferMethod?: "eip3009";
    };
};
export declare function assertUptoPermit2Requirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & {
    scheme: "upto";
    extra: JsonObject & {
        assetTransferMethod: "permit2";
    };
};
/** Batch payload details remain network-binding-specific; unsupported bindings fail closed. */
export declare function assertBatchSettlementRequirements(requirements: PaymentRequirements): asserts requirements is PaymentRequirements & {
    scheme: "batch-settlement";
};
