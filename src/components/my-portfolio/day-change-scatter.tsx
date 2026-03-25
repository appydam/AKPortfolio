"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Zap } from "lucide-react";

interface DayChangeData {
  data: {
    symbol: string;
    dayChangePct: number;
    weightPct: number;
    currentValue: number;
    dayPnl: number;
  }[];
  avgDayChange: number;
  totalDayPnl: number;
  greenCount: number;
  redCount: number;
  flatCount: number;
}

function fmt(v: number) {
  const abs = Math.abs(v);
  const str = abs >= 100000 ? `₹${(abs / 100000).toFixed(1)}L` : `₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return v < 0 ? `-${str}` : `+${str}`;
}

export function DayChangeScatter({ data }: { data: DayChangeData }) {
  const points = data.data.map((d) => ({
    ...d,
    z: Math.max(Math.sqrt(d.currentValue) / 8, 30),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Zap className="h-4 w-4" />
          Today&apos;s Movement — Size = Position Weight
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Day summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3 text-center">
            <div className={`text-xl font-bold ${data.totalDayPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(data.totalDayPnl)}
            </div>
            <div className="text-xs text-muted-foreground">Day P&L</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className={`text-xl font-bold ${data.avgDayChange >= 0 ? "text-green-600" : "text-red-600"}`}>
              {data.avgDayChange >= 0 ? "+" : ""}{data.avgDayChange}%
            </div>
            <div className="text-xs text-muted-foreground">Avg Day Change</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xl font-bold text-green-600">{data.greenCount} ▲</div>
            <div className="text-xs text-muted-foreground">Up Today</div>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xl font-bold text-red-600">{data.redCount} ▼</div>
            <div className="text-xs text-muted-foreground">Down Today</div>
          </div>
        </div>

        {/* Scatter chart */}
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="dayChangePct"
              name="Day Change"
              unit="%"
              tick={{ fontSize: 11 }}
              label={{ value: "Day Change %", position: "insideBottom", offset: -4, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="weightPct"
              name="Portfolio Weight"
              unit="%"
              tick={{ fontSize: 11 }}
              width={36}
              label={{ value: "Weight %", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <ZAxis type="number" dataKey="z" range={[30, 400]} />
            <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border bg-popover p-2 shadow text-xs">
                    <div className="font-semibold">{d.symbol}</div>
                    <div className={d.dayChangePct >= 0 ? "text-green-600" : "text-red-600"}>
                      Day: {d.dayChangePct >= 0 ? "+" : ""}{d.dayChangePct}%
                    </div>
                    <div>Weight: {d.weightPct}%</div>
                    <div className={d.dayPnl >= 0 ? "text-green-600" : "text-red-600"}>
                      Day P&L: {fmt(d.dayPnl)}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={points} name="Holdings">
              {points.map((entry, i) => (
                <Cell key={i} fill={entry.dayChangePct > 0 ? "#16a34a" : entry.dayChangePct < 0 ? "#dc2626" : "#94a3b8"} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
