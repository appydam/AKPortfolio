"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AlertItem {
  id: number;
  alert_type: string;
  message: string;
  symbol: string;
  stock_name: string;
  is_read: number;
  created_at: string;
}

export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const res = await fetch("/api/alerts?unread=true");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const alerts: AlertItem[] = data?.alerts || [];
  const unreadCount: number = data?.unreadCount || 0;

  const alertTypeColors: Record<string, string> = {
    NEW_BUY: "bg-green-100 text-green-800",
    NEW_SELL: "bg-red-100 text-red-800",
    NEW_ENTRY: "bg-blue-100 text-blue-800",
    EXIT: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        className="relative inline-flex items-center rounded-md p-2 hover:bg-accent"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-md border bg-card shadow-lg z-50">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Alerts</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </Button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No new alerts
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="border-b px-3 py-2.5 last:border-0 hover:bg-accent/50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${alertTypeColors[alert.alert_type] || ""}`}
                    >
                      {alert.alert_type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs leading-snug">{alert.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
