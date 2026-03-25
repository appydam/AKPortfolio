"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Treemap, ResponsiveContainer } from "recharts";
import { LayoutDashboard } from "lucide-react";

interface TreemapEntry {
  name: string;
  size: number;
  pnlPct: number;
  [key: string]: unknown;
}

interface PerformanceTreemapProps {
  data: TreemapEntry[];
}

function pnlToColor(pnlPct: number): string {
  if (pnlPct >= 20) return "#15803d";
  if (pnlPct >= 10) return "#16a34a";
  if (pnlPct >= 0) return "#4ade80";
  if (pnlPct >= -10) return "#fca5a5";
  if (pnlPct >= -25) return "#ef4444";
  if (pnlPct >= -50) return "#b91c1c";
  return "#7f1d1d";
}

function CustomContent(props: {
  x?: number; y?: number; width?: number; height?: number;
  name?: string; pnlPct?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", pnlPct = 0 } = props;
  if (width < 30 || height < 20) return null;

  const bg = pnlToColor(pnlPct);
  const textColor = pnlPct >= 0 && pnlPct < 10 ? "#166534" : "#ffffff";
  const showPct = width > 55 && height > 35;

  return (
    <g>
      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} fill={bg} rx={3} />
      <text
        x={x + width / 2}
        y={y + height / 2 - (showPct ? 7 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={textColor}
        fontSize={Math.min(12, width / 5)}
        fontWeight="600"
      >
        {name}
      </text>
      {showPct && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 9}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          fontSize={Math.min(10, width / 6)}
          opacity={0.9}
        >
          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

export function PerformanceTreemap({ data }: PerformanceTreemapProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <LayoutDashboard className="h-4 w-4" />
          Portfolio Heatmap — Size = Position Size, Color = P&L
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 mb-3 text-xs flex-wrap">
          {[
            { label: "> +20%", color: "#15803d" },
            { label: "+10–20%", color: "#16a34a" },
            { label: "0–10%", color: "#4ade80" },
            { label: "-10–0%", color: "#fca5a5" },
            { label: "-25–10%", color: "#ef4444" },
            { label: "< -50%", color: "#7f1d1d" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={4 / 3}
            content={<CustomContent />}
          />
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
