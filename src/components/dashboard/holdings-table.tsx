"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, Search } from "lucide-react";
import type { HoldingWithPrice } from "@/types";

interface HoldingsTableProps {
  holdings: HoldingWithPrice[];
}

type SortKey = "stock_name" | "shares_held" | "current_price" | "change_pct" | "market_value" | "pct_holding" | "pe_ratio";

function formatNumber(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return value.toLocaleString("en-IN");
  return value.toFixed(2);
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("market_value");
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = useMemo(() => {
    let result = holdings;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (h) =>
          h.stock_name?.toLowerCase().includes(q) ||
          h.symbol?.toLowerCase().includes(q) ||
          h.sector?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [holdings, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const SortableHead = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-accent/50"
      onClick={() => toggleSort(sortKeyName)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by stock name, symbol, or sector..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Stock" sortKeyName="stock_name" />
              <SortableHead label="Shares" sortKeyName="shares_held" />
              <SortableHead label="% Holding" sortKeyName="pct_holding" />
              <SortableHead label="Price (₹)" sortKeyName="current_price" />
              <SortableHead label="Change" sortKeyName="change_pct" />
              <SortableHead label="Value" sortKeyName="market_value" />
              <SortableHead label="P/E" sortKeyName="pe_ratio" />
              <TableHead>Sector</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  {search ? "No matching stocks found" : "No holdings data yet. Run a scrape to fetch data."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{h.stock_name}</div>
                      <div className="text-xs text-muted-foreground">{h.symbol}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {h.shares_held?.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {h.pct_holding?.toFixed(2)}%
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {h.current_price ? `₹${h.current_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                  </TableCell>
                  <TableCell>
                    {h.change_pct !== undefined && h.change_pct !== 0 ? (
                      <Badge
                        variant={h.change_pct > 0 ? "default" : "destructive"}
                        className={
                          h.change_pct > 0
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-red-100 text-red-800 hover:bg-red-100"
                        }
                      >
                        {h.change_pct > 0 ? "+" : ""}
                        {h.change_pct.toFixed(2)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {h.market_value ? formatNumber(h.market_value) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {h.pe_ratio ? h.pe_ratio.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell>
                    {h.sector ? (
                      <Badge variant="secondary" className="text-xs">
                        {h.sector}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {holdings.length} holdings
      </p>
    </div>
  );
}
