"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import type { ConvictionScore } from "@/types";

interface HoldingData {
  symbol: string;
  market_value: number;
  change_pct: number;
}

function getColor(conviction: number, changePct: number): string {
  // Base: conviction maps to saturation/brightness
  // Tint: positive change → green, negative → red
  if (changePct > 2) return conviction >= 50 ? "#15803d" : "#22c55e"; // strong green
  if (changePct > 0) return conviction >= 50 ? "#16a34a" : "#4ade80"; // light green
  if (changePct > -2) return conviction >= 50 ? "#6366f1" : "#a5b4fc"; // neutral purple
  return conviction >= 50 ? "#dc2626" : "#f87171"; // red
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  changePct?: number;
  fill?: string;
}

const CustomContent = (props: TreemapContentProps) => {
  const { x = 0, y = 0, width = 0, height = 0, name, changePct, fill } = props;
  if (width < 30 || height < 20) return null;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} rx={3} />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 6} y={y + 15} fill="#fff" fontSize={11} fontWeight={600}>
            {name}
          </text>
          {height > 40 && (
            <text x={x + 6} y={y + 30} fill="rgba(255,255,255,0.8)" fontSize={10}>
              {changePct !== undefined ? `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%` : ""}
            </text>
          )}
        </>
      )}
    </g>
  );
};

export function HoldingsHeatmap({
  conviction,
  holdings,
}: {
  conviction: ConvictionScore[];
  holdings: HoldingData[];
}) {
  if (!holdings || holdings.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">Holdings Heatmap</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No holdings data.</p></CardContent>
      </Card>
    );
  }

  const convictionMap = new Map<string, number>();
  for (const c of conviction || []) convictionMap.set(c.symbol, c.score);

  const treeData = holdings
    .filter(h => h.market_value > 0)
    .map(h => {
      const conv = convictionMap.get(h.symbol) || 0;
      return {
        name: h.symbol,
        size: h.market_value,
        conviction: conv,
        changePct: h.change_pct || 0,
        fill: getColor(conv, h.change_pct || 0),
      };
    })
    .sort((a, b) => b.size - a.size);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, number | string> }> }) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="rounded-md border bg-background p-2 shadow-md text-xs space-y-0.5">
        <p className="font-semibold">{d.name}</p>
        <p>Value: {((d.size as number) / 1e7).toFixed(1)} Cr</p>
        <p>Conviction: {d.conviction}/100</p>
        <p>Day change: {(d.changePct as number) > 0 ? "+" : ""}{(d.changePct as number).toFixed(1)}%</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Holdings Heatmap</CardTitle>
        <p className="text-xs text-muted-foreground">Size = market value | Color = conviction + daily performance</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <Treemap
            data={treeData}
            dataKey="size"
            aspectRatio={4 / 3}
            content={<CustomContent />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground justify-center">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-green-600" /> Green = up today</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-indigo-500" /> Purple = flat</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded bg-red-500" /> Red = down today</span>
          <span className="flex items-center gap-1">Darker = higher conviction</span>
        </div>
      </CardContent>
    </Card>
  );
}
