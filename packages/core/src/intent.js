export class InvalidPaymentIntentError extends Error {
    code = "invalid_payment_intent";
    constructor(message) {
        super(message);
        this.name = "InvalidPaymentIntentError";
    }
}
function nonNegativeAtomicAmount(value, field) {
    if (!/^(0|[1-9]\d*)$/.test(value)) {
        throw new InvalidPaymentIntentError(`${field} must be a non-negative decimal atomic amount`);
    }
    return BigInt(value);
}
export function assertValidPaymentIntent(intent, nowSeconds) {
    if (!intent.task_id.trim())
        throw new InvalidPaymentIntentError("task_id is required");
    if (!intent.resource.trim())
        throw new InvalidPaymentIntentError("resource is required");
    if (!intent.payee.trim())
        throw new InvalidPaymentIntentError("payee is required");
    if (!intent.asset_network.asset.trim() || !intent.asset_network.network.trim()) {
        throw new InvalidPaymentIntentError("asset_network.asset and asset_network.network are required");
    }
    nonNegativeAtomicAmount(intent.max_amount, "max_amount");
    if (!Number.isSafeInteger(intent.expires_at) || intent.expires_at <= 0) {
        throw new InvalidPaymentIntentError("expires_at must be a positive Unix timestamp in seconds");
    }
    if (nowSeconds !== undefined && intent.expires_at <= nowSeconds) {
        throw new InvalidPaymentIntentError("payment intent is expired");
    }
}
export function intentMatchesPaymentRequirements(intent, requirements, resourceUrl) {
    try {
        assertValidPaymentIntent(intent);
        if (resourceUrl !== undefined && intent.resource !== resourceUrl)
            return false;
        return (intent.payee.toLowerCase() === requirements.payTo.toLowerCase() &&
            intent.asset_network.asset.toLowerCase() === requirements.asset.toLowerCase() &&
            intent.asset_network.network === requirements.network &&
            BigInt(intent.max_amount) >= nonNegativeAtomicAmount(requirements.amount, "amount"));
    }
    catch {
        return false;
    }
}
export function assertIntentAllowsRequirements(intent, requirements, nowSeconds) {
    assertValidPaymentIntent(intent, nowSeconds);
    if (intent.payee.toLowerCase() !== requirements.payTo.toLowerCase())
        throw new InvalidPaymentIntentError("payee mismatch");
    if (intent.asset_network.asset.toLowerCase() !== requirements.asset.toLowerCase())
        throw new InvalidPaymentIntentError("asset mismatch");
    if (intent.asset_network.network !== requirements.network)
        throw new InvalidPaymentIntentError("network mismatch");
    if (BigInt(intent.max_amount) < nonNegativeAtomicAmount(requirements.amount, "amount")) {
        throw new InvalidPaymentIntentError("payment amount exceeds intent max_amount");
    }
}
