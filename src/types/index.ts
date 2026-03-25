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

// ─── Insights Engine Types ───

export interface ConvictionScore {
  stockId: number;
  symbol: string;
  name: string;
  score: number; // 0-100
  breakdown: {
    positionSize: number;  // 0-25
    addOnDeals: number;    // 0-20
    holdingPeriod: number; // 0-25
    averagedDown: number;  // 0-15
    dealFrequency: number; // 0-15
  };
  maturity: "New" | "Established" | "Long-term" | "Veteran";
  firstSeenQuarter: string;
  quartersHeld: number;
  currentWeight: number; // % of portfolio
}

export interface EntryQualityAnalysis {
  stockId: number;
  symbol: string;
  name: string;
  avgEntryPrice: number;
  currentPrice: number;
  currentReturn: number;
  maxDrawdownFromEntry: number;
  quality: "Excellent" | "Good" | "Average" | "Poor";
  holdingDays: number;
}

export interface DealPattern {
  stockId: number;
  symbol: string;
  name: string;
  pattern: "averaging_down" | "trimming_into_strength" | "accumulation" | "distribution" | "one_time_buy" | "mixed";
  dealCount: number;
  description: string;
}

export interface PortfolioDrawdown {
  maxDrawdownPct: number;
  peakDate: string;
  peakValue: number;
  troughDate: string;
  troughValue: number;
  recoveryDate: string | null;
  recoveryDays: number | null;
  currentDrawdownPct: number;
}

export interface PortfolioBeta {
  beta: number;
  correlation: number;
  alpha: number;
  interpretation: string;
}

export interface WinLossStats {
  totalExits: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  bestExit: { symbol: string; returnPct: number } | null;
  worstExit: { symbol: string; returnPct: number } | null;
}

export interface Attribution {
  symbol: string;
  name: string;
  contribution: number;
  contributionPct: number;
  priceChangePct: number;
  weight: number;
}

export interface SectorRotation {
  quarter: string;
  sectors: Array<{
    sector: string;
    weight: number;
    stockCount: number;
  }>;
}

export interface InsightsPayload {
  computedAt: string;
  conviction: ConvictionScore[];
  entryQuality: EntryQualityAnalysis[];
  dealPatterns: DealPattern[];
  drawdown: PortfolioDrawdown;
  beta: PortfolioBeta;
  winLoss: WinLossStats;
  topContributors: Attribution[];
  bottomDetractors: Attribution[];
  sectorRotation: SectorRotation[];
}
