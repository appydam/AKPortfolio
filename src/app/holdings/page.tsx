"use client";

import { useQuery } from "@tanstack/react-query";
import { HoldingsTable } from "@/components/dashboard/holdings-table";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export default function HoldingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const res = await fetch("/api/holdings");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const holdings = data?.holdings || [];
  const quarter = data?.quarter;

  const exportCSV = () => {
    if (holdings.length === 0) return;

    const headers = ["Symbol", "Name", "Sector", "Shares", "% Holding", "Price", "Change %", "Value", "P/E"];
    const rows = holdings.map((h: Record<string, unknown>) => [
      h.symbol,
      h.stock_name,
      h.sector || "",
      h.shares_held,
      h.pct_holding,
      h.current_price || "",
      h.change_pct || "",
      h.market_value || "",
      h.pe_ratio || "",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ak-portfolio-${quarter || "latest"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">All Holdings</h1>
          <p className="text-sm text-muted-foreground">
            {quarter ? `As of ${quarter}` : "Complete portfolio holdings with live prices"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={holdings.length === 0}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-md border">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <HoldingsTable holdings={holdings} />
      )}
    </div>
  );
}
