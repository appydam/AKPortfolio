"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend, ResponsiveContainer, Tooltip,
} from "recharts";
import { GitCompareArrows } from "lucide-react";

interface RadarEntry {
  metric: string;
  you: number;
  ak: number;
}

export function VsAKRadar({ data }: { data: RadarEntry[] }) {
  const hasAKData = data.some((d) => d.ak > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <GitCompareArrows className="h-4 w-4" />
          You vs Ashish Kacholia
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasAKData ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            AK portfolio data not loaded. Run a scrape from the Dashboard first.
          </p>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Radar name="You" dataKey="you" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} strokeWidth={2} />
                <Radar name="Ashish Kacholia" dataKey="ak" stroke="#ea580c" fill="#ea580c" fillOpacity={0.2} strokeWidth={2} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>

            {/* Comparison table */}
            <div className="lg:w-64 shrink-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 text-muted-foreground font-medium">Metric</th>
                    <th className="text-right pb-2 text-blue-600 font-medium">You</th>
                    <th className="text-right pb-2 text-orange-600 font-medium">AK</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const youWins = row.you >= row.ak;
                    return (
                      <tr key={row.metric} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{row.metric}</td>
                        <td className={`py-2 text-right font-mono font-semibold ${youWins ? "text-blue-600" : "text-muted-foreground"}`}>
                          {row.you}
                        </td>
                        <td className={`py-2 text-right font-mono font-semibold ${!youWins ? "text-orange-600" : "text-muted-foreground"}`}>
                          {row.ak}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
