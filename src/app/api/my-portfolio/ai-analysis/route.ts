import { NextRequest } from "next/server";

// Use Bedrock if AWS credentials are present, otherwise direct Anthropic API
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

// Bedrock uses different model IDs
function getModelId() {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return process.env.BEDROCK_MODEL_ID || "anthropic.claude-opus-4-5";
  }
  return "claude-opus-4-6";
}

export async function POST(req: NextRequest) {
  const portfolioData = await req.json();

  const { my, mf, grand, comparison, analytics } = portfolioData;

  const stockLines = (my?.holdings || [])
    .sort((a: { currentValue: number }, b: { currentValue: number }) => b.currentValue - a.currentValue)
    .map((h: {
      symbol: string; quantity: number; avgPrice: number; ltp: number;
      invested: number; currentValue: number; pnl: number; pnlPct: number; dayChangePct: number;
    }) =>
      `${h.symbol}: qty=${h.quantity}, avg=₹${h.avgPrice.toFixed(0)}, ltp=₹${h.ltp.toFixed(0)}, invested=₹${h.invested.toFixed(0)}, current=₹${h.currentValue.toFixed(0)}, pnl=${h.pnlPct.toFixed(1)}%, day=${h.dayChangePct.toFixed(2)}%`
    ).join("\n");

  const mfLines = (mf?.holdings || [])
    .sort((a: { currentValue: number }, b: { currentValue: number }) => b.currentValue - a.currentValue)
    .map((h: { fund: string; invested: number; currentValue: number; pnl: number; pnlPct: number }) =>
      `${h.fund.substring(0, 50)}: invested=₹${h.invested.toFixed(0)}, current=₹${h.currentValue.toFixed(0)}, pnl=${h.pnlPct.toFixed(1)}%`
    ).join("\n");

  const overlapSymbols = (comparison?.overlap || []).map((o: { symbol: string; myPnlPct: number; akPctHolding: number }) =>
    `${o.symbol} (your P&L: ${o.myPnlPct.toFixed(1)}%, AK weight: ${o.akPctHolding}%)`
  ).join(", ");

  const onlyMine = (comparison?.onlyMine || []).join(", ");
  const onlyAK = (comparison?.onlyAK || []).slice(0, 15).join(", ");

  const risk = analytics?.risk || {};
  const pnlSummary = analytics?.pnlSummary || {};
  const dayChange = analytics?.dayChange || {};
  const health = analytics?.healthScore || {};

  const prompt = `You are a sharp, direct Indian stock market analyst and personal financial advisor. You have access to my complete portfolio from Zerodha. Give me a brutally honest, highly personalized analysis. Be direct, use specific numbers, and give actionable advice. Do NOT be generic.

## MY COMPLETE PORTFOLIO DATA

### Overall Summary
- Total Invested: ₹${grand?.totalInvested?.toFixed(0) || 0}
- Total Current Value: ₹${grand?.totalCurrent?.toFixed(0) || 0}
- Total P&L: ₹${grand?.totalPnl?.toFixed(0) || 0} (${grand?.totalPnlPct?.toFixed(2) || 0}%)
- Stocks P&L: ₹${my?.totalPnl?.toFixed(0) || 0} (${my?.totalPnlPct?.toFixed(2) || 0}%)
- MF P&L: ₹${mf?.totalPnl?.toFixed(0) || 0} (${mf?.totalPnlPct?.toFixed(2) || 0}%)
- Portfolio Health Score: ${health?.overall || 'N/A'}/100
- Win Rate: ${pnlSummary?.winRate || 0}% (${pnlSummary?.winners || 0} winners, ${pnlSummary?.losers || 0} losers)
- Today's P&L: ₹${dayChange?.totalDayPnl?.toFixed(0) || 0} (${dayChange?.greenCount || 0}↑ ${dayChange?.redCount || 0}↓)

### Risk Metrics
- Concentration Risk: ${risk?.concentrationRisk?.score || 'N/A'}
- Top 3 stocks weight: ${risk?.concentrationRisk?.top3Pct || 0}%
- Diversification Score: ${risk?.diversificationScore || 'N/A'}
- Sector Count: ${risk?.sectorCount || 'N/A'}
- Beta (portfolio): ${risk?.beta || 'N/A'}
- Max Drawdown: ${risk?.maxDrawdownPct || 0}%

### My Stock Holdings (sorted by value)
${stockLines}

### My Mutual Funds
${mfLines}

### AK Comparison
- Similarity with Ashish Kacholia: ${comparison?.similarityPct || 0}%
- Common stocks: ${overlapSymbols || 'None'}
- Stocks only I hold (not AK): ${onlyMine || 'None'}
- AK stocks I'm missing (top 15): ${onlyAK || 'None'}

## WHAT I NEED FROM YOU

Please structure your response with these sections using markdown:

### 🎯 Portfolio Verdict
2-3 sentence honest overall assessment. Don't sugarcoat.

### 💪 What's Working
My top 2-3 strongest positions with specific numbers and WHY they're strong.

### ⚠️ Danger Zones
My 2-3 biggest risks or underperformers I should be worried about. Be blunt.

### 🔥 Immediate Action Items
3-5 specific, numbered, actionable things I should do THIS WEEK. Not vague advice — specific stocks to buy more of, cut, or watch.

### 📊 AK Strategy Gap
What is Ashish Kacholia doing that I'm not? What can I learn from his portfolio vs mine?

### 🧠 Hidden Insights
2-3 non-obvious patterns or insights from my data that I probably haven't noticed.

### 🎯 6-Month Game Plan
Concrete steps for the next 6 months to improve my portfolio performance.

Be specific, use the actual stock names and numbers from my data. Talk to me like a friend who knows markets, not like a disclaimer-heavy advisor.`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = createClient();
        const modelId = getModelId();

        const anthropicStream = client.messages.stream({
          model: modelId,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
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
        const msg = err instanceof Error ? err.message : "AI analysis failed";
        controller.enqueue(encoder.encode(`\n\n**Error:** ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
