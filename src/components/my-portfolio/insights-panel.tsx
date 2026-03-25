"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, AlertTriangle, TrendingUp, Info } from "lucide-react";

interface Insight {
  type: "warning" | "opportunity" | "info";
  title: string;
  description: string;
}

const config = {
  warning: {
    icon: AlertTriangle,
    border: "border-l-amber-500",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
    label: "Warning",
    labelColor: "text-amber-600",
  },
  opportunity: {
    icon: TrendingUp,
    border: "border-l-emerald-500",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    label: "Opportunity",
    labelColor: "text-emerald-600",
  },
  info: {
    icon: Info,
    border: "border-l-blue-500",
    bg: "bg-blue-50",
    iconColor: "text-blue-600",
    label: "Info",
    labelColor: "text-blue-600",
  },
};

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          Portfolio Insights ({insights.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const c = config[insight.type];
            const Icon = c.icon;
            return (
              <div
                key={i}
                className={`flex gap-3 rounded-lg border-l-4 p-3 ${c.border} ${c.bg}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${c.iconColor}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${c.labelColor}`}>
                      {c.label}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
