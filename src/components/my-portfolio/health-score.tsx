"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from "recharts";

interface Props {
  data: {
    score: number;
    grade: string;
    breakdown: Record<string, { score: number; max: number; label: string }>;
  };
}

const gradeColors: Record<string, string> = {
  "A+": "text-green-500", A: "text-green-500", B: "text-lime-500",
  C: "text-yellow-500", D: "text-orange-500", F: "text-red-500",
};

const barColor = (score: number) =>
  score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : score >= 30 ? "#f97316" : "#ef4444";

export function HealthScore({ data }: Props) {
  const chartData = [{ value: data.score, fill: barColor(data.score) }];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Portfolio Health Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          {/* Gauge */}
          <div className="relative h-[160px] w-[160px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%"
                innerRadius="70%" outerRadius="100%"
                startAngle={210} endAngle={-30}
                data={chartData}
                barSize={14}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} angleAxisId={0} />
                <RadialBar
                  dataKey="value"
                  cornerRadius={8}
                  background={{ fill: "hsl(var(--muted))" }}
                  angleAxisId={0}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-black ${gradeColors[data.grade] || "text-muted-foreground"}`}>
                {data.grade}
              </span>
              <span className="text-sm text-muted-foreground">{data.score}/100</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="flex-1 space-y-3">
            {Object.values(data.breakdown).map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="font-mono font-medium">{b.score}/{b.max}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(b.score / b.max) * 100}%`,
                      backgroundColor: barColor((b.score / b.max) * 100),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
