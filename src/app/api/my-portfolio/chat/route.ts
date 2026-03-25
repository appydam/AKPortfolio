import { NextRequest } from "next/server";

function createClient() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    const { AnthropicBedrock } = require("@anthropic-ai/bedrock-sdk");
    return new AnthropicBedrock({
      awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || "us-east-1",
    });
  }
  const Anthropic = require("@anthropic-ai/sdk").default;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function getModelId() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-opus-4-6-v1";
  }
  return "claude-opus-4-6";
}

function buildPortfolioContext(portfolio: Record<string, unknown>): string {
  const { my, mf, grand, comparison, analytics } = portfolio as {
    my: { holdings: Array<{symbol:string;quantity:number;avgPrice:number;ltp:number;invested:number;currentValue:number;pnlPct:number;dayChangePct:number}>; totalInvested:number; totalCurrent:number; totalPnl:number; totalPnlPct:number; count:number };
    mf: { holdings: Array<{fund:string;invested:number;currentValue:number;pnlPct:number}>; totalInvested:number; totalCurrent:number; totalPnl:number; totalPnlPct:number; count:number };
    grand: { totalInvested:number; totalCurrent:number; totalPnl:number; totalPnlPct:number };
    comparison: { overlap:Array<{symbol:string;myPnlPct:number;akPctHolding:number}>; onlyMine:string[]; onlyAK:string[]; overlapCount:number; similarityPct:number };
    analytics: Record<string, unknown>;
  };

  const stockLines = (my?.holdings || [])
    .sort((a, b) => b.currentValue - a.currentValue)
    .map(h => `${h.symbol}: qty=${h.quantity}, avg=₹${h.avgPrice.toFixed(0)}, ltp=₹${h.ltp.toFixed(0)}, invested=₹${h.invested.toFixed(0)}, current=₹${h.currentValue.toFixed(0)}, pnl=${h.pnlPct.toFixed(1)}%, day=${h.dayChangePct.toFixed(2)}%`)
    .join("\n");

  const mfLines = (mf?.holdings || [])
    .sort((a, b) => b.currentValue - a.currentValue)
    .map(h => `${h.fund.substring(0, 50)}: invested=₹${h.invested.toFixed(0)}, current=₹${h.currentValue.toFixed(0)}, pnl=${h.pnlPct.toFixed(1)}%`)
    .join("\n");

  const risk = (analytics?.risk || {}) as Record<string, unknown>;
  const pnlSummary = (analytics?.pnlSummary || {}) as Record<string, unknown>;
  const dayChange = (analytics?.dayChange || {}) as Record<string, unknown>;
  const health = (analytics?.healthScore || {}) as Record<string, unknown>;
  const concentrationRisk = (risk?.concentrationRisk || {}) as Record<string, unknown>;

  return `## PORTFOLIO CONTEXT (always reference these numbers)

### Summary
- Total Invested: ₹${grand?.totalInvested?.toFixed(0) || 0}
- Total Current: ₹${grand?.totalCurrent?.toFixed(0) || 0}
- Total P&L: ₹${grand?.totalPnl?.toFixed(0) || 0} (${grand?.totalPnlPct?.toFixed(2) || 0}%)
- Stocks P&L: ${my?.totalPnlPct?.toFixed(2) || 0}% | MF P&L: ${mf?.totalPnlPct?.toFixed(2) || 0}%
- Health Score: ${(health?.overall as number) || 'N/A'}/100
- Win Rate: ${(pnlSummary?.winRate as number) || 0}% (${(pnlSummary?.winners as number) || 0}W / ${(pnlSummary?.losers as number) || 0}L)
- Today: ₹${(dayChange?.totalDayPnl as number)?.toFixed(0) || 0} (${(dayChange?.greenCount as number) || 0}↑ ${(dayChange?.redCount as number) || 0}↓)

### Risk
- Concentration top3: ${(concentrationRisk?.top3Pct as number) || 0}%
- Max Drawdown: ${(risk?.maxDrawdownPct as number) || 0}%
- Sector count: ${(risk?.sectorCount as number) || 'N/A'}

### Stocks
${stockLines}

### Mutual Funds
${mfLines}

### vs Ashish Kacholia
- Similarity: ${comparison?.similarityPct || 0}%
- Overlap: ${(comparison?.overlap || []).map(o => `${o.symbol}(${o.myPnlPct.toFixed(1)}%)`).join(", ") || "None"}
- Only mine: ${(comparison?.onlyMine || []).join(", ") || "None"}
- Only AK (top 10): ${(comparison?.onlyAK || []).slice(0, 10).join(", ") || "None"}`;
}

export async function POST(req: NextRequest) {
  const { messages, portfolioData } = await req.json();

  const portfolioContext = buildPortfolioContext(portfolioData);

  const systemPrompt = `You are a sharp, direct Indian stock market analyst with deep knowledge of Indian equities, mutual funds, and investing. You have full access to the user's Zerodha portfolio.

${portfolioContext}

Rules:
- Always reference specific stocks, numbers, and percentages from the portfolio data above
- Be direct and opinionated — no generic disclaimers
- Use ₹ for amounts, format large numbers as L (lakhs) or Cr (crores)
- For amounts: <1L show exact, 1L-100L show as X.XL, >100L show as X.XCr
- Keep responses concise but complete — use bullet points and bold for key points
- Talk like a knowledgeable friend, not a SEBI-scared advisor
- If asked about a stock not in the portfolio, still give your view but note it's not currently held`;

  // Convert chat messages to Anthropic format (already in {role, content} shape)
  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = createClient();
        const modelId = getModelId();

        const anthropicStream = client.messages.stream({
          model: modelId,
          max_tokens: 2048,
          system: systemPrompt,
          messages: anthropicMessages,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chat failed";
        controller.enqueue(encoder.encode(`**Error:** ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
