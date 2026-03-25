export interface Stock {
  id: number;
  symbol: string;
  bse_code: string | null;
  name: string;
  sector: string | null;
  market_cap: number | null;
  pe_ratio: number | null;
  roe: number | null;
  roce: number | null;
  updated_at: string;
}

export interface Deal {
  id: number;
  stock_id: number;
  deal_date: string;
  exchange: string;
  deal_type: string;
  action: "Buy" | "Sell";
  quantity: number;
  avg_price: number;
  pct_traded: number | null;
  created_at: string;
  // Joined fields
  symbol?: string;
  stock_name?: string;
}

export interface Holding {
  id: number;
  stock_id: number;
  quarter: string;
  shares_held: number;
  pct_holding: number;
  created_at: string;
  // Joined fields
  symbol?: string;
  stock_name?: string;
  sector?: string;
  current_price?: number;
  change_pct?: number;
  market_value?: number;
  pe_ratio?: number;
  market_cap?: number;
}

export interface PortfolioSnapshot {
  id: number;
  snapshot_date: string;
  total_value: number;
  num_holdings: number;
  details_json: string | null;
}

export interface Alert {
  id: number;
  stock_id: number;
  alert_type: "NEW_BUY" | "NEW_SELL" | "NEW_ENTRY" | "EXIT";
  message: string;
  deal_id: number | null;
  is_read: number;
  created_at: string;
  // Joined fields
  symbol?: string;
  stock_name?: string;
}

export interface PriceData {
  symbol: string;
  price: number;
  change_pct: number;
  updated_at: string;
}

export interface HoldingWithPrice extends Holding {
  current_price: number;
  change_pct: number;
  market_value: number;
}
