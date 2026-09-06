import { redis } from "./redis";
import { WalletState } from "./types";

export const INITIAL_WALLET_STATE: WalletState = {
  pkrBalance: 5000000,
  customerGoldGrams: 50,
  platformInventoryGrams: 5000,
  updatedAt: new Date().toISOString(),
};

export async function getOrSeedWalletState(): Promise<WalletState> {
  try {
    const existing = await redis.get<WalletState>("wallet:state");
    if (
      existing &&
      typeof existing === "object" &&
      typeof existing.pkrBalance === "number"
    ) {
      return existing;
    }
  } catch (err) {
    console.warn("Failed to read wallet:state from Redis:", err);
  }

  const seededState: WalletState = {
    ...INITIAL_WALLET_STATE,
    updatedAt: new Date().toISOString(),
  };

  try {
    await redis.set("wallet:state", seededState);
  } catch (err) {
    console.warn("Failed to seed wallet:state in Redis:", err);
  }

  return seededState;
}
