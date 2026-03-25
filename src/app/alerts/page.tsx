"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCheck } from "lucide-react";

interface AlertItem {
  id: number;
  alert_type: string;
  message: string;
  symbol: string;
  stock_name: string;
  is_read: number;
  created_at: string;
}

const alertTypeColors: Record<string, string> = {
  NEW_BUY: "bg-green-100 text-green-800",
  NEW_SELL: "bg-red-100 text-red-800",
  NEW_ENTRY: "bg-blue-100 text-blue-800",
  EXIT: "bg-orange-100 text-orange-800",
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["all-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const alerts: AlertItem[] = data?.alerts || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount} unread alert{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="flex h-48 items-center justify-center">
            <p className="text-muted-foreground">No alerts yet. They will appear when new deals are detected.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <Card key={alert.id} className={alert.is_read ? "opacity-60" : ""}>
              <CardContent className="flex items-start gap-3 p-4">
                <Badge
                  variant="secondary"
                  className={`shrink-0 text-xs ${alertTypeColors[alert.alert_type] || ""}`}
                >
                  {alert.alert_type.replace(/_/g, " ")}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm">{alert.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
