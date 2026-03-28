// CSV parser for broker portfolio exports
// Supports: Zerodha Kite, Groww, and generic CSV formats

export interface ParsedHolding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
  closePrice: number;
  pnl: number;
  dayChangePct: number;
}

export interface ParsedMutualFund {
  fund: string;
  folio: string;
  tradingsymbol: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
}

export interface ParseResult {
  holdings: ParsedHolding[];
  mutualFunds: ParsedMutualFund[];
  format: string;
  errors: string[];
}

function parseCSVRows(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
}

function num(val: string): number {
  return parseFloat(val.replace(/,/g, "").replace(/[₹%]/g, "")) || 0;
}

function findCol(headers: string[], patterns: RegExp[]): number {
  for (const pat of patterns) {
    const idx = headers.findIndex((h) => pat.test(h.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Zerodha Kite CSV format:
// Instrument, Qty., Avg. cost, LTP, Cur. val, P&L, Net chg., Day chg.
function parseKiteFormat(headers: string[], rows: string[][]): ParseResult {
  const iSymbol = findCol(headers, [/^instrument$/]);
  const iQty = findCol(headers, [/^qty/]);
  const iAvg = findCol(headers, [/^avg/]);
  const iLTP = findCol(headers, [/^ltp$/]);
  const iPnl = findCol(headers, [/^p&l$/, /^p.l$/]);
  const iDayChg = findCol(headers, [/^day\s*chg/]);

  const holdings: ParsedHolding[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    if (row.length < 3 || !row[iSymbol]) continue;
    const raw = row[iSymbol];
    // Kite uses "SYMBOL" or "SYMBOL-BE" format
    const symbol = raw.replace(/-BE$/, "").replace(/-BL$/, "").trim();
    if (!symbol || /^\d+$/.test(symbol)) continue;

    holdings.push({
      symbol,
      exchange: "NSE",
      quantity: Math.abs(Math.round(num(row[iQty]))),
      avgPrice: num(row[iAvg]),
      lastPrice: iLTP >= 0 ? num(row[iLTP]) : 0,
      closePrice: 0,
      pnl: iPnl >= 0 ? num(row[iPnl]) : 0,
      dayChangePct: iDayChg >= 0 ? num(row[iDayChg]) : 0,
    });
  }

  return { holdings, mutualFunds: [], format: "Zerodha Kite", errors };
}

// Groww format:
// Symbol, Company Name, Quantity, Avg Price, Current Price, Current Value, P&L
function parseGrowwFormat(headers: string[], rows: string[][]): ParseResult {
  const iSymbol = findCol(headers, [/^symbol$/]);
  const iQty = findCol(headers, [/^quantity$/, /^qty$/]);
  const iAvg = findCol(headers, [/^avg\s*price$/, /^buy\s*price$/]);
  const iCurrent = findCol(headers, [/^current\s*price$/, /^ltp$/]);
  const iPnl = findCol(headers, [/^p.?l$/, /^profit/]);

  const holdings: ParsedHolding[] = [];

  for (const row of rows) {
    if (row.length < 3 || !row[iSymbol]) continue;
    const symbol = row[iSymbol].trim();
    if (!symbol || /^\d+$/.test(symbol)) continue;

    holdings.push({
      symbol,
      exchange: "NSE",
      quantity: Math.abs(Math.round(num(row[iQty]))),
      avgPrice: num(row[iAvg]),
      lastPrice: iCurrent >= 0 ? num(row[iCurrent]) : 0,
      closePrice: 0,
      pnl: iPnl >= 0 ? num(row[iPnl]) : 0,
      dayChangePct: 0,
    });
  }

  return { holdings, mutualFunds: [], format: "Groww", errors: [] };
}

// Generic CSV — tries to map any columns containing symbol/qty/price
function parseGenericFormat(headers: string[], rows: string[][]): ParseResult {
  const iSymbol = findCol(headers, [/symbol/, /instrument/, /stock/, /ticker/, /scrip/]);
  const iQty = findCol(headers, [/qty/, /quantity/, /shares/, /units/]);
  const iAvg = findCol(headers, [/avg/, /average/, /buy\s*price/, /cost/]);
  const iCurrent = findCol(headers, [/ltp/, /current/, /last\s*price/, /market/]);
  const iPnl = findCol(headers, [/p.?l/, /profit/, /gain/]);

  if (iSymbol < 0 || iQty < 0) {
    return { holdings: [], mutualFunds: [], format: "Unknown", errors: ["Could not identify symbol and quantity columns"] };
  }

  const holdings: ParsedHolding[] = [];

  for (const row of rows) {
    if (row.length < 2 || !row[iSymbol]) continue;
    const symbol = row[iSymbol].replace(/-BE$/, "").trim();
    if (!symbol || /^\d+$/.test(symbol)) continue;

    holdings.push({
      symbol,
      exchange: "NSE",
      quantity: Math.abs(Math.round(num(row[iQty]))),
      avgPrice: iAvg >= 0 ? num(row[iAvg]) : 0,
      lastPrice: iCurrent >= 0 ? num(row[iCurrent]) : 0,
      closePrice: 0,
      pnl: iPnl >= 0 ? num(row[iPnl]) : 0,
      dayChangePct: 0,
    });
  }

  return { holdings, mutualFunds: [], format: "Generic CSV", errors: [] };
}

function detectFormat(headers: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  if (lower.some((h) => h === "instrument") && lower.some((h) => h.startsWith("avg"))) {
    return "kite";
  }
  if (lower.some((h) => h === "company name") || lower.some((h) => h === "symbol" && lower.includes("current value"))) {
    return "groww";
  }
  return "generic";
}

export function parsePortfolioCSV(csvText: string): ParseResult {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) {
    return { holdings: [], mutualFunds: [], format: "Unknown", errors: ["CSV file is empty or has no data rows"] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim()));
  const format = detectFormat(headers);

  switch (format) {
    case "kite":
      return parseKiteFormat(headers, dataRows);
    case "groww":
      return parseGrowwFormat(headers, dataRows);
    default:
      return parseGenericFormat(headers, dataRows);
  }
}
