"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, FileSpreadsheet, Check, AlertTriangle, Plus, Trash2, Loader2 } from "lucide-react";
import { parsePortfolioCSV, type ParsedHolding } from "@/lib/csv-parser";

interface UploadZoneProps {
  portfolioId: string | null;
  onUploaded: (id: string) => void;
}

export function UploadZone({ portfolioId, onUploaded }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<{ holdings: ParsedHolding[]; format: string; errors: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualEntries, setManualEntries] = useState<{ symbol: string; quantity: string; avgPrice: string }[]>([
    { symbol: "", quantity: "", avgPrice: "" },
  ]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setParsed(null);

    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parsePortfolioCSV(text);
      if (result.holdings.length === 0) {
        setError(result.errors[0] || "No holdings found in the CSV file");
        return;
      }
      setParsed(result);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSaveCSV = async () => {
    if (!parsed) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/my-portfolio/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: parsed.holdings,
          id: portfolioId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUploaded(data.id);
      setParsed(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveManual = async () => {
    const valid = manualEntries.filter((e) => e.symbol && e.quantity && Number(e.quantity) > 0);
    if (valid.length === 0) {
      setError("Add at least one stock with symbol and quantity");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const holdings = valid.map((e) => ({
        symbol: e.symbol.toUpperCase().trim(),
        exchange: "NSE",
        quantity: Math.round(Number(e.quantity)),
        avgPrice: Number(e.avgPrice) || 0,
        lastPrice: 0,
        closePrice: 0,
        pnl: 0,
        dayChangePct: 0,
      }));

      const res = await fetch("/api/my-portfolio/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings, id: portfolioId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUploaded(data.id);
      setManualEntries([{ symbol: "", quantity: "", avgPrice: "" }]);
      setManualMode(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => { setManualMode(false); setError(null); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            !manualMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <FileSpreadsheet className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
          Upload CSV
        </button>
        <button
          onClick={() => { setManualMode(true); setError(null); setParsed(null); }}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            manualMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Plus className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
          Manual Entry
        </button>
      </div>

      {!manualMode ? (
        <>
          {/* Drop Zone */}
          {!parsed && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all ${
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className={`mx-auto h-10 w-10 mb-3 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-medium">
                {dragOver ? "Drop your CSV here" : "Drag & drop your portfolio CSV"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse. Supports Zerodha Kite, Groww, and generic formats
              </p>
              <p className="text-[10px] text-muted-foreground mt-3">
                Kite: Console &rarr; Portfolio &rarr; Holdings &rarr; Download CSV
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Preview */}
          {parsed && (
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-600" />
                    {parsed.holdings.length} stocks parsed
                    <Badge variant="outline" className="text-[10px]">{parsed.format}</Badge>
                  </CardTitle>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setParsed(null)}
                      className="rounded-md px-3 py-1.5 text-xs border hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveCSV}
                      disabled={saving}
                      className="rounded-md px-4 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                      {portfolioId ? "Update Portfolio" : "Save Portfolio"}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="py-2">Symbol</TableHead>
                        <TableHead className="py-2 text-right">Qty</TableHead>
                        <TableHead className="py-2 text-right">Avg Price</TableHead>
                        <TableHead className="py-2 text-right">LTP</TableHead>
                        <TableHead className="py-2 text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.holdings.map((h, i) => (
                        <TableRow key={`${h.symbol}-${i}`} className="text-xs">
                          <TableCell className="py-1.5 font-medium">{h.symbol}</TableCell>
                          <TableCell className="py-1.5 text-right">{h.quantity}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono">
                            {h.avgPrice > 0 ? `₹${h.avgPrice.toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                          <TableCell className="py-1.5 text-right font-mono">
                            {h.lastPrice > 0 ? `₹${h.lastPrice.toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                          <TableCell className={`py-1.5 text-right font-mono ${h.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {h.pnl !== 0 ? `${h.pnl >= 0 ? "+" : ""}₹${Math.round(h.pnl).toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        /* Manual Entry Mode */
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Add your holdings</CardTitle>
              <button
                onClick={handleSaveManual}
                disabled={saving}
                className="rounded-md px-4 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
                {portfolioId ? "Update Portfolio" : "Save Portfolio"}
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {manualEntries.map((entry, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  placeholder="SYMBOL"
                  value={entry.symbol}
                  onChange={(e) => {
                    const next = [...manualEntries];
                    next[i] = { ...next[i], symbol: e.target.value.toUpperCase() };
                    setManualEntries(next);
                  }}
                  className="flex-1 rounded-md border px-3 py-1.5 text-xs font-mono bg-background focus:ring-1 focus:ring-primary outline-none"
                />
                <input
                  placeholder="Qty"
                  type="number"
                  value={entry.quantity}
                  onChange={(e) => {
                    const next = [...manualEntries];
                    next[i] = { ...next[i], quantity: e.target.value };
                    setManualEntries(next);
                  }}
                  className="w-20 rounded-md border px-3 py-1.5 text-xs font-mono bg-background focus:ring-1 focus:ring-primary outline-none"
                />
                <input
                  placeholder="Avg Price"
                  type="number"
                  value={entry.avgPrice}
                  onChange={(e) => {
                    const next = [...manualEntries];
                    next[i] = { ...next[i], avgPrice: e.target.value };
                    setManualEntries(next);
                  }}
                  className="w-24 rounded-md border px-3 py-1.5 text-xs font-mono bg-background focus:ring-1 focus:ring-primary outline-none"
                />
                {manualEntries.length > 1 && (
                  <button
                    onClick={() => setManualEntries(manualEntries.filter((_, j) => j !== i))}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setManualEntries([...manualEntries, { symbol: "", quantity: "", avgPrice: "" }])}
              className="w-full rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <Plus className="inline-block h-3.5 w-3.5 mr-1 -mt-0.5" />
              Add another stock
            </button>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Info */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Supported formats:</p>
        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
          <li><strong>Zerodha Kite</strong> — Console &rarr; Portfolio &rarr; Holdings &rarr; Download</li>
          <li><strong>Groww</strong> — Stocks &rarr; Holdings &rarr; Download Statement</li>
          <li><strong>Generic CSV</strong> — Any CSV with symbol, quantity, and price columns</li>
        </ul>
        <p className="mt-2 text-[11px]">Your data stays in the browser until you save. Portfolio is identified by a unique ID stored locally.</p>
      </div>
    </div>
  );
}
