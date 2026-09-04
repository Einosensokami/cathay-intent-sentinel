import { getAddress } from "ethers";

export interface MerchantIdentity {
  address: string;
  merchant_url: string;
  name?: string;
  registered_at?: number;
}

export interface MerchantReputation {
  score: number;
  successful_settlements: number;
  disputes: number;
  last_updated: number;
}

export interface MerchantRecord {
  identity: MerchantIdentity;
  reputation: MerchantReputation;
  revoked?: boolean;
}

export interface TrustVerification {
  verified: boolean;
  reason: string;
  identity?: MerchantIdentity;
  reputation?: MerchantReputation;
}

export interface TrustRegistry {
  verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification>;
}

export class InMemoryTrustRegistry implements TrustRegistry {
  private readonly records = new Map<string, MerchantRecord>();

  register(record: MerchantRecord): void {
    const address = getAddress(record.identity.address).toLowerCase();
    if (!/^https:\/\//i.test(record.identity.merchant_url)) throw new TypeError("Merchant URL must use HTTPS");
    if (!Number.isFinite(record.reputation.score) || record.reputation.score < 0 || record.reputation.score > 100) {
      throw new TypeError("Reputation score must be between 0 and 100");
    }
    this.records.set(address, { ...record, identity: { ...record.identity, address } });
  }

  revoke(address: string): void {
    const key = getAddress(address).toLowerCase();
    const record = this.records.get(key);
    if (record) this.records.set(key, { ...record, revoked: true });
  }

  async verifyMerchant(address: string, merchantUrl: string): Promise<TrustVerification> {
    let key: string;
    try { key = getAddress(address).toLowerCase(); } catch { return { verified: false, reason: "Invalid merchant address" }; }
    const record = this.records.get(key);
    if (!record) return { verified: false, reason: "Merchant identity is not registered" };
    if (record.revoked) return { verified: false, reason: "Merchant identity is revoked" };
    if (!record.identity || record.identity.merchant_url !== merchantUrl) return { verified: false, reason: "Merchant URL does not match registered identity" };
    if (!record.reputation || record.reputation.score < 50) return { verified: false, reason: "Merchant reputation is below the minimum threshold" };
    return { verified: true, reason: "Merchant identity and reputation verified", identity: record.identity, reputation: record.reputation };
  }
}

export const MockTrustRegistry = InMemoryTrustRegistry;
