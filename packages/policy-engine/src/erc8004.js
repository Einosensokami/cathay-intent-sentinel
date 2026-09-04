import { getAddress } from "ethers";
export class Erc8004TrustRegistry {
    identities = new Map();
    reputations = new Map();
    validations = new Map();
    registerAgent(identity, reputation) {
        const addressKey = getAddress(identity.walletAddress).toLowerCase();
        this.identities.set(addressKey, { ...identity, walletAddress: getAddress(identity.walletAddress) });
        this.reputations.set(addressKey, reputation);
    }
    recordValidation(record) {
        this.validations.set(record.taskId, record);
    }
    async verifyAgent(walletAddress, endpointUrl, minReputationScore = 60) {
        let cleanAddress;
        try {
            cleanAddress = getAddress(walletAddress).toLowerCase();
        }
        catch {
            return { verified: false, reason: "Invalid wallet address format for ERC-8004 check" };
        }
        const identity = this.identities.get(cleanAddress);
        if (!identity) {
            return { verified: false, reason: "Agent wallet address not registered in ERC-8004 Identity Registry" };
        }
        if (!identity.active) {
            return { verified: false, reason: "Agent registration in ERC-8004 Identity Registry is inactive or suspended" };
        }
        const urlNormalized = endpointUrl.toLowerCase();
        const serviceNormalized = identity.serviceEndpoint.toLowerCase();
        if (!urlNormalized.startsWith(serviceNormalized) && !serviceNormalized.startsWith(urlNormalized)) {
            return { verified: false, reason: "Endpoint URL does not match registered ERC-8004 service endpoint" };
        }
        const reputation = this.reputations.get(cleanAddress);
        if (!reputation) {
            return { verified: false, reason: "No reputation record found in ERC-8004 Reputation Registry" };
        }
        if (!reputation.antiSybilPassed) {
            return { verified: false, reason: "Agent failed ERC-8004 anti-Sybil verification" };
        }
        if (reputation.score < minReputationScore) {
            return {
                verified: false,
                reason: `Agent reputation score (${reputation.score}) is below minimum policy threshold (${minReputationScore})`,
                identity,
                reputation,
            };
        }
        return {
            verified: true,
            reason: "ERC-8004 identity and reputation signals verified",
            identity,
            reputation,
        };
    }
}
