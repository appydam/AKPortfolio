"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

interface PortfolioData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-sm font-semibold mt-4 mb-1.5 text-foreground">
          {line.replace("### ", "")}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-base font-bold mt-5 mb-2 text-foreground">
          {line.replace("## ", "")}
        </h2>
      );
    } else if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
      elements.push(
        <p key={key++} className="text-xs font-semibold mt-2 mb-0.5 text-foreground">
          {line.replace(/\*\*/g, "")}
        </p>
      );
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <div key={key++} className="flex gap-2 text-xs mb-1 ml-2">
          <span className="text-muted-foreground shrink-0">{line.match(/^\d+/)![0]}.</span>
          <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={key++} className="flex gap-2 text-xs mb-0.5 ml-2">
          <span className="text-muted-foreground shrink-0">•</span>
          <span>{renderInline(line.replace(/^- /, ""))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1" />);
    } else {
      elements.push(
        <p key={key++} className="text-xs text-foreground/90 mb-0.5 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div className="space-y-0">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function AIAnalysis({ portfolioData }: { portfolioData: PortfolioData }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [content, setContent] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function runAnalysis() {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setStatus("loading");
    setContent("");
    setCollapsed(false);

    try {
      const res = await fetch("/api/my-portfolio/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portfolioData),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setContent(accumulated);
      }

      setStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStatus("error");
      setContent(`Failed to generate analysis: ${(err as Error).message}`);
    }
  }

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-blue-50/30 dark:from-purple-950/20 dark:to-blue-950/10 dark:border-purple-800">
      <CardHeader className="py-2.5 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-purple-600" />
            AI Portfolio Analysis
            <span className="text-[10px] font-normal text-muted-foreground ml-1">powered by Claude Opus</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {status === "done" && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                {collapsed ? "expand" : "collapse"}
              </button>
            )}
            <Button
              size="sm"
              onClick={runAnalysis}
              disabled={status === "loading"}
              className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
            >
              {status === "loading" ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Analyzing...</>
              ) : status === "done" ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1" />Re-analyze</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1" />Analyze My Portfolio</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {status === "idle" && (
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground">
            Get a deep, personalized AI analysis of your portfolio — what&apos;s working, what&apos;s not, and exactly what to do next.
          </p>
        </CardContent>
      )}

      {status === "loading" && content === "" && (
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
            Claude is thinking deeply about your portfolio...
          </div>
        </CardContent>
      )}

      {content && !collapsed && (
        <CardContent className="px-4 pb-4">
          <div className="prose prose-sm max-w-none">
            <MarkdownRenderer text={content} />
            {status === "loading" && (
              <span className="inline-block w-1.5 h-3.5 bg-purple-600 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </CardContent>
      )}

      {collapsed && status === "done" && (
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-muted-foreground italic">Analysis collapsed. Click expand to view.</p>
        </CardContent>
      )}
    </Card>
  );
}
