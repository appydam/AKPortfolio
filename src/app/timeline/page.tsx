"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, ArrowDownCircle, ArrowUpCircle, LogIn, LogOut } from "lucide-react";

const eventIcons: Record<string, typeof ArrowDownCircle> = {
  entry: LogIn,
  add: ArrowDownCircle,
  partial_exit: ArrowUpCircle,
  full_exit: LogOut,
};

const eventColors: Record<string, string> = {
  entry: "bg-blue-100 text-blue-800",
  add: "bg-green-100 text-green-800",
  partial_exit: "bg-orange-100 text-orange-800",
  full_exit: "bg-red-100 text-red-800",
};

function formatValue(value: number): string {
  if (Math.abs(value) >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (Math.abs(value) >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString("en-IN")}`;
}

export default function TimelinePage() {
  const queryClient = useQueryClient();

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["timeline"],
    queryFn: async () => {
      const res = await fetch("/api/timeline");
      return res.json();
    },
  });

  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ["pnl"],
    queryFn: async () => {
      const res = await fetch("/api/timeline?view=pnl");
      return res.json();
    },
  });

  const buildTimeline = useMutation({
    mutationFn: async () => {
      await fetch("/api/timeline", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      queryClient.invalidateQueries({ queryKey: ["pnl"] });
    },
  });

  const timeline = timelineData?.timeline || [];
  const pnl = pnlData?.pnl || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Portfolio Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Historical buy/sell activity and P&L tracking
          </p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => buildTimeline.mutate()}
          disabled={buildTimeline.isPending}
        >
          {buildTimeline.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Rebuild Timeline
        </Button>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Activity Timeline</TabsTrigger>
          <TabsTrigger value="pnl">P&L Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-4">
          {timelineLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : timeline.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No timeline data yet. Click &quot;Rebuild Timeline&quot; to generate from deal history.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {timeline.map((event: {
                id: number; symbol: string; stockName: string; eventType: string;
                eventDate: string; sharesBefore: number; sharesAfter: number;
                priceAtEvent: number | null; valueChange: number | null; notes: string | null;
              }) => {
                const Icon = eventIcons[event.eventType] || ArrowDownCircle;
                const colorClass = eventColors[event.eventType] || "";

                return (
                  <Card key={event.id}>
                    <CardContent className="flex items-start gap-3 p-4">
                      <div className={`rounded-full p-1.5 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{event.stockName}</span>
                          <Badge variant="outline" className="text-xs">{event.symbol}</Badge>
                          <Badge className={`text-xs ${colorClass}`}>
                            {event.eventType.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{event.notes}</p>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                          <span>Shares: {event.sharesBefore.toLocaleString("en-IN")} → {event.sharesAfter.toLocaleString("en-IN")}</span>
                          {event.priceAtEvent && <span>@ ₹{event.priceAtEvent.toLocaleString("en-IN")}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">{event.eventDate}</div>
                        {event.valueChange !== null && event.valueChange !== 0 && (
                          <div className={`text-xs font-mono font-medium ${event.valueChange > 0 ? "text-green-600" : "text-red-600"}`}>
                            {event.valueChange > 0 ? "+" : ""}{formatValue(Math.abs(event.valueChange))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pnl" className="mt-4">
          {pnlLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Avg Buy</TableHead>
                    <TableHead className="text-right">CMP</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Total Bought</TableHead>
                    <TableHead className="text-right">Total Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnl.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No P&L data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    pnl.map((s: {
                      symbol: string; name: string; currentShares: number; currentPrice: number;
                      currentValue: number; avgBuyPrice: number | null;
                      totalBuyValue: number; totalSellValue: number;
                    }) => (
                      <TableRow key={s.symbol}>
                        <TableCell>
                          <div className="font-medium text-sm">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.symbol}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {s.currentShares.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {s.avgBuyPrice ? `₹${s.avgBuyPrice.toFixed(0)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ₹{s.currentPrice.toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatValue(s.currentValue)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {s.totalBuyValue > 0 ? formatValue(s.totalBuyValue) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {s.totalSellValue > 0 ? formatValue(s.totalSellValue) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
