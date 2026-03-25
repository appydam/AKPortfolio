"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PortfolioChartProps {
  snapshots: Array<{
    snapshot_date: string;
    total_value: number;
    num_holdings: number;
  }>;
}

function formatValue(value: number): string {
  const cr = value / 10000000;
  return `₹${cr.toFixed(0)} Cr`;
}

export function PortfolioChart({ snapshots }: PortfolioChartProps) {
  const data = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.total_value,
    holdings: s.num_holdings,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Portfolio Value Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            Portfolio history will appear here after daily snapshots are captured
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Portfolio Value Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              className="text-xs"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={formatValue}
              className="text-xs"
              tick={{ fontSize: 11 }}
              width={80}
            />
            <Tooltip
              formatter={(value) => [formatValue(Number(value)), "Portfolio Value"]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="url(#colorValue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
