"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PortfolioDrawdown, PortfolioBeta, WinLossStats } from "@/types";

interface ConcentrationMetrics {
  top5Pct: number;
  top10Pct: number;
  hhi: number;
  riskLevel: string;
}

export function RiskPulse({
  drawdown, beta, winLoss, concentration,
}: {
  drawdown: PortfolioDrawdown;
  beta: PortfolioBeta;
  winLoss: WinLossStats;
  concentration?: ConcentrationMetrics;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Risk Pulse</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drawdown */}
        <div className="rounded-lg border p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Max Drawdown</span>
            <span className={`text-xl font-bold ${drawdown.maxDrawdownPct < -10 ? "text-red-600" : drawdown.maxDrawdownPct < -5 ? "text-amber-600" : "text-green-600"}`}>
              {drawdown.maxDrawdownPct ? `${drawdown.maxDrawdownPct.toFixed(1)}%` : "N/A"}
            </span>
          </div>
          {drawdown.peakDate && (
            <p className="text-[10px] text-muted-foreground">
              Peak: {drawdown.peakDate} | Trough: {drawdown.troughDate}
              {drawdown.recoveryDays !== null ? ` | Recovered in ${drawdown.recoveryDays}d` : " | Not recovered"}
            </p>
          )}
          {drawdown.currentDrawdownPct !== 0 && (
            <p className="text-xs">
              Current: <span className={drawdown.currentDrawdownPct < 0 ? "text-red-600" : "text-green-600"}>
                {drawdown.currentDrawdownPct.toFixed(1)}%
              </span> from peak
            </p>
          )}
        </div>

        {/* Beta */}
        <div className="rounded-lg border p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Portfolio Beta</span>
            <span className={`text-xl font-bold ${beta.beta > 1.2 ? "text-red-600" : beta.beta < 0.8 ? "text-blue-600" : "text-foreground"}`}>
              {beta.beta.toFixed(2)}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px]">{beta.interpretation}</Badge>
          <div className="flex gap-4 text-[10px] text-muted-foreground">
            <span>Correlation: {beta.correlation.toFixed(2)}</span>
            <span>Alpha: {beta.alpha > 0 ? "+" : ""}{beta.alpha.toFixed(1)}%</span>
          </div>
        </div>

        {/* Win/Loss */}
        <div className="rounded-lg border p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Win Rate (Exited Positions)</span>
            <span className={`text-xl font-bold ${winLoss.winRate >= 60 ? "text-green-600" : winLoss.winRate >= 40 ? "text-amber-600" : "text-red-600"}`}>
              {winLoss.totalExits > 0 ? `${winLoss.winRate}%` : "N/A"}
            </span>
          </div>
          {winLoss.totalExits > 0 && (
            <>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">{winLoss.wins}W (avg +{winLoss.avgWinPct}%)</span>
                <span className="text-red-600">{winLoss.losses}L (avg {winLoss.avgLossPct}%)</span>
              </div>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                {winLoss.bestExit && <span>Best: {winLoss.bestExit.symbol} +{winLoss.bestExit.returnPct}%</span>}
                {winLoss.worstExit && <span>Worst: {winLoss.worstExit.symbol} {winLoss.worstExit.returnPct}%</span>}
              </div>
            </>
          )}
        </div>

        {/* Concentration */}
        {concentration && (
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Concentration</span>
              <Badge variant={concentration.riskLevel === "low" ? "outline" : "destructive"} className="text-[10px]">
                {concentration.riskLevel}
              </Badge>
            </div>
            <div className="flex gap-4 text-xs">
              <span>Top 5: {concentration.top5Pct}%</span>
              <span>Top 10: {concentration.top10Pct}%</span>
              <span>HHI: {concentration.hhi}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
