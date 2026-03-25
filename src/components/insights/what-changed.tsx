"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface DiffItem {
  type: "NEW_ENTRY" | "FULL_EXIT" | "INCREASED" | "REDUCED" | "UNCHANGED";
  symbol: string;
  name: string;
  changeShares: number;
  changePct: number;
  estimatedValue: number;
  currShares: number;
}

const TYPE_CONFIG = {
  NEW_ENTRY: { label: "New Entry", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: "+" },
  FULL_EXIT: { label: "Exited", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: "-" },
  INCREASED: { label: "Increased", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: "^" },
  REDUCED: { label: "Reduced", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", icon: "v" },
  UNCHANGED: { label: "Unchanged", color: "bg-gray-100 text-gray-800", icon: "=" },
};

export function WhatChanged({ diffs }: { diffs: DiffItem[] }) {
  const entries = diffs.filter(d => d.type === "NEW_ENTRY").slice(0, 5);
  const exits = diffs.filter(d => d.type === "FULL_EXIT").slice(0, 5);
  const increased = diffs.filter(d => d.type === "INCREASED").slice(0, 5);
  const reduced = diffs.filter(d => d.type === "REDUCED").slice(0, 5);

  const hasChanges = entries.length > 0 || exits.length > 0 || increased.length > 0 || reduced.length > 0;

  if (!hasChanges) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">What Changed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No significant changes between quarters.</p>
        </CardContent>
      </Card>
    );
  }

  const renderSection = (title: string, items: DiffItem[], type: keyof typeof TYPE_CONFIG) => {
    if (items.length === 0) return null;
    const config = TYPE_CONFIG[type];
    return (
      <div className="space-y-1.5">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        {items.map(item => (
          <div key={item.symbol} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge className={`${config.color} text-xs`}>{config.label}</Badge>
              <span className="font-medium text-sm">{item.symbol}</span>
              <span className="text-xs text-muted-foreground">{item.name}</span>
            </div>
            <div className="text-right text-sm">
              {type === "FULL_EXIT" ? (
                <span className="text-red-600">-{Math.abs(item.changeShares).toLocaleString("en-IN")} shares</span>
              ) : type === "NEW_ENTRY" ? (
                <span className="text-blue-600">
                  {item.currShares.toLocaleString("en-IN")} shares
                  {item.estimatedValue > 0 && <span className="text-muted-foreground ml-1">(~{(item.estimatedValue / 1e7).toFixed(1)} Cr)</span>}
                </span>
              ) : (
                <span className={item.changeShares > 0 ? "text-green-600" : "text-orange-600"}>
                  {item.changeShares > 0 ? "+" : ""}{item.changeShares.toLocaleString("en-IN")} ({item.changePct > 0 ? "+" : ""}{item.changePct}%)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">What Changed (Quarter over Quarter)</CardTitle>
          <Link href="/timeline" className="text-xs text-primary hover:underline">View full timeline</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderSection("New Portfolio Entries", entries, "NEW_ENTRY")}
        {renderSection("Full Exits", exits, "FULL_EXIT")}
        {renderSection("Positions Increased", increased, "INCREASED")}
        {renderSection("Positions Reduced", reduced, "REDUCED")}
      </CardContent>
    </Card>
  );
}
