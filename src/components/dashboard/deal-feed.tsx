"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Deal } from "@/types";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface DealFeedProps {
  deals: Deal[];
}

export function DealFeed({ deals }: DealFeedProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium">Recent Deals</CardTitle>
        <Link
          href="/deals"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No deals tracked yet
          </p>
        ) : (
          deals.slice(0, 10).map((deal) => (
            <div
              key={deal.id}
              className="flex items-start justify-between gap-2 rounded-md border p-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
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
                  <span className="font-medium text-sm truncate">
                    {deal.stock_name || deal.symbol}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {deal.quantity?.toLocaleString("en-IN")} shares @ ₹{deal.avg_price?.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <Badge variant="outline" className="text-xs">
                  {deal.exchange}
                </Badge>
                <div className="mt-1 text-xs text-muted-foreground">
                  {deal.deal_date}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
