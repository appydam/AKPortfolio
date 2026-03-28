"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp,
  MessageSquare, Send, X, RotateCcw,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PortfolioData = Record<string, any>;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

// ── Suggested prompts ──────────────────────────────────────────────────────
const SUGGESTED = [
  "Which Big Bull am I most similar to?",
  "What consensus picks am I missing?",
  "What should I buy/sell right now?",
  "Rate my portfolio diversification",
  "Which stocks are dragging me down?",
  "Where am I taking contrarian bets?",
  "What would AK do with my portfolio?",
  "Compare my risk vs Big Bulls",
];

// ── Markdown renderer ──────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
}

function MarkdownRenderer({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="text-sm font-bold mt-4 mb-1.5 text-foreground">{line.slice(3)}</h2>);
    } else if (line.match(/^\d+\.\s/)) {
      elements.push(
        <div key={key++} className="flex gap-2 text-xs mb-1 ml-1">
          <span className="text-muted-foreground shrink-0">{line.match(/^\d+/)![0]}.</span>
          <span className="leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
        </div>
      );
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={key++} className="flex gap-2 text-xs mb-0.5 ml-1">
          <span className="text-muted-foreground shrink-0">•</span>
          <span className="leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-1.5" />);
    } else {
      elements.push(
        <p key={key++} className="text-xs leading-relaxed mb-0.5">
          {renderInline(line)}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}

// ── Chat bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center mr-1.5 mt-0.5 shrink-0">
          <Sparkles className="h-2.5 w-2.5 text-purple-600" />
        </div>
      )}
      <div
        className={`max-w-[88%] rounded-xl px-3 py-2 text-xs ${
          isUser
            ? "bg-purple-600 text-white rounded-br-sm"
            : "bg-muted rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p className="leading-relaxed">{msg.content}</p>
        ) : (
          <>
            <MarkdownRenderer text={msg.content} />
            {msg.streaming && (
              <span className="inline-block w-1 h-3 bg-purple-600 animate-pulse ml-0.5 align-middle" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function AIAnalysis({ portfolioData }: { portfolioData: PortfolioData }) {
  // Analysis state
  const [analysisStatus, setAnalysisStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [analysisContent, setAnalysisContent] = useState("");
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const analysisAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [chatOpen]);

  // ── Analysis ──────────────────────────────────────────────────────────────
  async function runAnalysis() {
    if (analysisAbortRef.current) analysisAbortRef.current.abort();
    analysisAbortRef.current = new AbortController();
    setAnalysisStatus("loading");
    setAnalysisContent("");
    setAnalysisCollapsed(false);

    try {
      const res = await fetch("/api/my-portfolio/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portfolioData),
        signal: analysisAbortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAnalysisContent(acc);
      }
      setAnalysisStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setAnalysisStatus("error");
      setAnalysisContent(`Failed: ${(err as Error).message}`);
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setChatLoading(true);

    // Add streaming assistant placeholder
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    if (chatAbortRef.current) chatAbortRef.current.abort();
    chatAbortRef.current = new AbortController();

    try {
      const res = await fetch("/api/my-portfolio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          portfolioData,
        }),
        signal: chatAbortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: acc, streaming: true };
          return updated;
        });
      }

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: acc, streaming: false };
        return updated;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: `Error: ${(err as Error).message}`, streaming: false };
        return updated;
      });
    } finally {
      setChatLoading(false);
    }
  }, [messages, chatLoading, portfolioData]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Analysis Card ── */}
      <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50/50 to-blue-50/30 dark:from-purple-950/20 dark:to-blue-950/10 dark:border-purple-800">
        <CardHeader className="py-2.5 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
              <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
              AI Portfolio Analysis
              <span className="text-[10px] font-normal text-muted-foreground hidden sm:inline">powered by Claude Opus 4.6</span>
            </CardTitle>

            <div className="flex items-center gap-1.5 shrink-0">
              {analysisStatus === "done" && (
                <button
                  onClick={() => setAnalysisCollapsed(v => !v)}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1"
                >
                  {analysisCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  {analysisCollapsed ? "expand" : "collapse"}
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setChatOpen(v => !v)}
                className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
                {messages.length > 0 && (
                  <span className="ml-0.5 bg-purple-600 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center">
                    {messages.filter(m => m.role === "user").length}
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                onClick={runAnalysis}
                disabled={analysisStatus === "loading"}
                className="h-7 text-xs bg-purple-600 hover:bg-purple-700 gap-1"
              >
                {analysisStatus === "loading" ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing...</>
                ) : analysisStatus === "done" ? (
                  <><RefreshCw className="h-3.5 w-3.5" />Re-analyze</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" />Analyze</>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {analysisStatus === "idle" && (
          <CardContent className="px-4 pb-4">
            <p className="text-xs text-muted-foreground">
              Get a deep, personalized AI analysis — what&apos;s working, what&apos;s not, and exactly what to do next.
              Or click <strong>Chat</strong> to ask any question about your portfolio.
            </p>
          </CardContent>
        )}

        {analysisStatus === "loading" && analysisContent === "" && (
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
              Claude is thinking deeply about your portfolio...
            </div>
          </CardContent>
        )}

        {analysisContent && !analysisCollapsed && (
          <CardContent className="px-4 pb-4">
            <MarkdownRenderer text={analysisContent} />
            {analysisStatus === "loading" && (
              <span className="inline-block w-1 h-3.5 bg-purple-600 animate-pulse ml-0.5 align-middle" />
            )}
          </CardContent>
        )}

        {analysisCollapsed && analysisStatus === "done" && (
          <CardContent className="px-4 pb-3">
            <p className="text-xs text-muted-foreground italic">Analysis collapsed. Click expand to view.</p>
          </CardContent>
        )}
      </Card>

      {/* ── Chat Panel ── */}
      {chatOpen && (
        <Card className="border-2 border-purple-200 dark:border-purple-800">
          <CardHeader className="py-2.5 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-purple-600" />
                Chat with your portfolio
              </CardTitle>
              <div className="flex items-center gap-1.5">
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1"
                  >
                    <RotateCcw className="h-3 w-3" /> clear
                  </button>
                )}
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Suggested prompts — only shown when no messages yet */}
            {messages.length === 0 && (
              <div className="p-3 border-b bg-muted/30">
                <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">Suggested questions</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-[11px] rounded-full border border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800 text-purple-700 dark:text-purple-300 px-2.5 py-1 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors text-left"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="h-72 overflow-y-auto p-3 space-y-0">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs text-muted-foreground text-center">
                    Ask anything about your portfolio above
                  </p>
                </div>
              )}
              {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-2 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={chatLoading}
                placeholder="Ask anything about your portfolio… (Enter to send)"
                rows={1}
                className="flex-1 resize-none text-xs rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50 min-h-[36px] max-h-[100px]"
                style={{ height: "36px" }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = "36px";
                  t.style.height = Math.min(t.scrollHeight, 100) + "px";
                }}
              />
              <Button
                size="sm"
                onClick={() => sendMessage(input)}
                disabled={chatLoading || !input.trim()}
                className="h-9 w-9 p-0 bg-purple-600 hover:bg-purple-700 shrink-0"
              >
                {chatLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
