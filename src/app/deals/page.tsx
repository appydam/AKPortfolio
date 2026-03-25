"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Deal } from "@/types";

export default function DealsPage() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["deals", page, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (filter) params.set("action", filter);
      const res = await fetch(`/api/deals?${params}`);
      return res.json();
    },
  });

  const deals: Deal[] = data?.deals || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Deal History</h1>
          <p className="text-sm text-muted-foreground">
            All bulk and block deals by Ashish Kacholia
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant={filter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(null)}
          >
            All
          </Button>
          <Button
            variant={filter === "Buy" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("Buy")}
          >
            Buys
          </Button>
          <Button
            variant={filter === "Sell" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("Sell")}
          >
            Sells
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-md border">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Avg Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No deals found. Run a scrape to fetch data.
                    </TableCell>
                  </TableRow>
                ) : (
                  deals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="text-sm">{deal.deal_date}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{deal.stock_name}</div>
                          <div className="text-xs text-muted-foreground">{deal.symbol}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={deal.action === "Buy" ? "default" : "destructive"}
                          className={
                            deal.action === "Buy"
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : "bg-red-100 text-red-800 hover:bg-red-100"
                          }
                        >
                          {deal.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{deal.exchange}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{deal.deal_type}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {deal.quantity?.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ₹{deal.avg_price?.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        ₹{((deal.quantity || 0) * (deal.avg_price || 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
