export type Side = "BUY" | "SELL"; // from customer's perspective
export type InputType = "PKR" | "GOLD";
export type QuoteStatus = "PENDING" | "CONFIRMED" | "EXPIRED";

export interface WalletState {
  pkrBalance: number;
  customerGoldGrams: number;
  platformInventoryGrams: number;
  updatedAt: string; // ISO
}

export interface PriceSnapshot {
  source: "GoldAPI" | "GoldPriceOrg"; // labeled honestly: GoldAPI (XAU spot) or GoldPriceOrg (XAU spot)
  pricePerGramPKR: number; // normalized 24K, PKR/gram (rounded to nearest PKR)
  fetchedAt: string;
  trusted: boolean;
  reason?: string;
}

export interface Quote {
  id: string;
  side: Side;
  inputType: InputType;
  inputAmount: number;
  lockedPricePerGramPKR: number;
  pkrAmount: number;
  goldGrams: number;
  createdAt: string;
  expiresAt: string; // createdAt + 75s
  status: QuoteStatus;
  tradeId?: string; // set once confirmed — makes confirm idempotent
}

export interface Trade {
  id: string;
  quoteId: string;
  side: Side;
  pkrAmount: number;
  goldGrams: number;
  pricePerGramPKR: number;
  executedAt: string;
  receiptNumber: string;
  balancesAfter: WalletState;
}
