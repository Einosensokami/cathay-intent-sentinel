import { getAddress, verifyTypedData } from "ethers";
const authorizationTypes = {
    TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
    ],
};
function fail(code, message) {
    return { ok: false, error: { code, message } };
}
function isAuthorization(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    return ["from", "to", "value", "validAfter", "validBefore", "nonce"].every((key) => typeof candidate[key] === "string");
}
function isPaymentPayload(value) {
    if (!value || typeof value !== "object")
        return false;
    const candidate = value;
    const payload = candidate.payload;
    return candidate.x402Version === 2 &&
        (!candidate.resource || typeof candidate.resource === "string" || (typeof candidate.resource === "object" && typeof candidate.resource.url === "string")) &&
        !!candidate.accepted && typeof candidate.accepted === "object" && !!payload && typeof payload === "object" &&
        isAuthorization(payload.authorization) && typeof payload.signature === "string";
}
function chainId(network, requirements) {
    const configured = requirements.extra?.chainId;
    if (typeof configured === "number" && Number.isSafeInteger(configured))
        return configured;
    if (network === "base" || network === "eip155:8453")
        return 8453;
    if (network === "base-sepolia" || network === "base-sepolia-testnet" || network === "eip155:84532")
        return 84532;
    return undefined;
}
function sameRequirement(payload, requirements) {
    const accepted = payload.accepted;
    return accepted.scheme === requirements.scheme && accepted.network === requirements.network &&
        accepted.asset.toLowerCase() === requirements.asset.toLowerCase() && accepted.amount === requirements.amount &&
        accepted.payTo.toLowerCase() === requirements.payTo.toLowerCase() &&
        (!requirements.extra?.resource || (typeof requirements.extra.resource === "string" && ((typeof payload.resource === "string" && payload.resource === requirements.extra.resource) || (typeof payload.resource === "object" && payload.resource.url === requirements.extra.resource))));
}
export async function verifyPayment(request, options) {
    const now = request?.now ?? (options.now ?? (() => Math.floor(Date.now() / 1000)))();
    try {
        const requirements = request?.paymentRequirements ?? request?.requirements;
        const rawPayload = request?.paymentPayload ?? request?.payload;
        if (!request || !requirements || !Number.isFinite(now))
            return fail("MALFORMED_PAYLOAD", "Request and verification time are required");
        if (requirements.scheme !== "exact")
            return fail("UNSUPPORTED_SCHEME", "Only x402 exact/ERC-3009 is executable");
        if (!isPaymentPayload(rawPayload))
            return fail("MALFORMED_PAYLOAD", "PaymentPayload.payload is malformed");
        const payload = rawPayload;
        if (!sameRequirement(payload, requirements))
            return fail("REQUIREMENTS_MISMATCH", "Payment requirements do not match the payload");
        const authorization = payload.payload.authorization;
        let from;
        let to;
        let asset;
        try {
            from = getAddress(authorization.from);
            to = getAddress(authorization.to);
            asset = getAddress(requirements.asset);
            if (to.toLowerCase() !== getAddress(requirements.payTo).toLowerCase())
                return fail("REQUIREMENTS_MISMATCH", "Authorization recipient does not match payTo");
        }
        catch {
            return fail("MALFORMED_PAYLOAD", "Address field is invalid");
        }
        if (request.payer && from.toLowerCase() !== getAddress(request.payer).toLowerCase())
            return fail("REQUIREMENTS_MISMATCH", "Payer does not match authorization.from");
        if (authorization.value !== requirements.amount)
            return fail("REQUIREMENTS_MISMATCH", "Authorization value does not match amount");
        if (BigInt(authorization.validAfter) > BigInt(Math.floor(now)) || BigInt(authorization.validBefore) <= BigInt(Math.floor(now))) {
            return fail("INVALID_TIME_WINDOW", "Authorization is outside its valid time window");
        }
        if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce))
            return fail("MALFORMED_PAYLOAD", "ERC-3009 nonce must be bytes32");
        if (await options.nonceStore.isConsumed(authorization.nonce))
            return fail("NONCE_CONSUMED", "Authorization nonce has already been consumed");
        const id = chainId(requirements.network, requirements);
        if (id === undefined)
            return fail("VERIFICATION_ERROR", "Unsupported network; chainId is required");
        let recovered;
        try {
            const extraName = requirements.extra?.name;
            const extraVersion = requirements.extra?.version;
            const domain = { name: options.domainName ?? (typeof extraName === "string" ? extraName : "USD Coin"), version: options.domainVersion ?? (typeof extraVersion === "string" ? extraVersion : "2"), chainId: id, verifyingContract: asset };
            recovered = getAddress(verifyTypedData(domain, authorizationTypes, authorization, payload.payload.signature));
        }
        catch {
            return fail("INVALID_SIGNATURE", "EIP-712 ERC-3009 signature is invalid");
        }
        if (recovered.toLowerCase() !== from.toLowerCase())
            return fail("INVALID_SIGNATURE", "Signature does not recover authorization.from");
        const balance = await options.balanceReader.getBalance(from, asset, requirements.network);
        if (balance < BigInt(requirements.amount))
            return fail("INSUFFICIENT_BALANCE", "Payer balance is insufficient");
        return { ok: true, payer: from, amount: authorization.value, nonce: authorization.nonce };
    }
    catch (error) {
        return fail("VERIFICATION_ERROR", `Verification failed closed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
}
export const createVerifyHandler = (options) => (request) => verifyPayment(request, options);
export const verify = verifyPayment;
