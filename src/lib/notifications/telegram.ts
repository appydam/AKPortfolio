import { getDb } from "../db";

const TELEGRAM_API = "https://api.telegram.org/bot";

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

function getChatId(): string | null {
  return process.env.TELEGRAM_CHAT_ID || null;
}

export function isConfigured(): boolean {
  return !!getBotToken() && !!getChatId();
}

async function sendTelegramMessage(text: string, parseMode = "HTML"): Promise<boolean> {
  const token = getBotToken();
  const chatId = getChatId();
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("[Telegram] Send failed:", error);
    return false;
  }
}

export async function queueNotification(
  channel: string,
  priority: "urgent" | "normal" | "low",
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  await db.from("notification_queue").insert({
    channel,
    priority,
    title,
    message,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

export async function processNotificationQueue(): Promise<number> {
  if (!isConfigured()) return 0;

  const db = getDb();

  // Supabase doesn't support CASE in ORDER BY directly, so we fetch and sort in JS
  const { data: pending } = await db
    .from("notification_queue")
    .select("*")
    .eq("sent", false)
    .order("created_at", { ascending: true })
    .limit(30);

  if (!pending || pending.length === 0) return 0;

  // Sort by priority in JS: urgent (0), normal (1), low (2)
  const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
  const sorted = pending
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (priorityOrder[a.priority as string] ?? 2) - (priorityOrder[b.priority as string] ?? 2)
    )
    .slice(0, 10);

  let sent = 0;
  for (const notif of sorted) {
    if (notif.channel === "telegram") {
      const text = `<b>${notif.title}</b>\n\n${notif.message}`;
      const success = await sendTelegramMessage(text);

      if (success) {
        await db
          .from("notification_queue")
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        sent++;
      }

      // Delay between messages to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return sent;
}

// Alert generators that create notifications

export async function notifyNewDeal(
  symbol: string,
  stockName: string,
  action: "Buy" | "Sell",
  quantity: number,
  price: number,
  exchange: string
): Promise<void> {
  const emoji = action === "Buy" ? "🟢" : "🔴";
  const title = `${emoji} ${action}: ${stockName} (${symbol})`;
  const message = [
    `<b>Action:</b> ${action}`,
    `<b>Quantity:</b> ${quantity.toLocaleString("en-IN")} shares`,
    `<b>Price:</b> ₹${price.toLocaleString("en-IN")}`,
    `<b>Value:</b> ₹${((quantity * price) / 10000000).toFixed(2)} Cr`,
    `<b>Exchange:</b> ${exchange}`,
    `<b>Time:</b> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  ].join("\n");

  await queueNotification("telegram", "urgent", title, message, { symbol, action, quantity, price });
}

export async function notifyPortfolioEntry(symbol: string, stockName: string, quantity: number, price: number): Promise<void> {
  const title = `🆕 New Portfolio Entry: ${stockName}`;
  const message = [
    `Ashish Kacholia has taken a <b>NEW position</b> in ${stockName} (${symbol})`,
    `<b>Quantity:</b> ${quantity.toLocaleString("en-IN")} shares`,
    `<b>Price:</b> ₹${price.toLocaleString("en-IN")}`,
  ].join("\n");

  await queueNotification("telegram", "urgent", title, message, { symbol, quantity, price });
}

export async function notifyPortfolioExit(symbol: string, stockName: string, quantity: number, price: number): Promise<void> {
  const title = `🚪 Portfolio Exit: ${stockName}`;
  const message = [
    `Ashish Kacholia has <b>EXITED</b> ${stockName} (${symbol})`,
    `<b>Sold:</b> ${quantity.toLocaleString("en-IN")} shares @ ₹${price.toLocaleString("en-IN")}`,
  ].join("\n");

  await queueNotification("telegram", "urgent", title, message, { symbol, quantity, price });
}

export async function notifyPriceAlert(symbol: string, stockName: string, price: number, changePct: number): Promise<void> {
  const direction = changePct > 0 ? "📈" : "📉";
  const title = `${direction} ${stockName}: ${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`;
  const message = `${stockName} (${symbol}) is at ₹${price.toLocaleString("en-IN")} (${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%)`;

  await queueNotification("telegram", changePct > 5 || changePct < -5 ? "urgent" : "normal", title, message);
}

export async function notifyDataConflict(symbol: string, sourceA: string, priceA: number, sourceB: string, priceB: number, deviation: number): Promise<void> {
  const title = `⚠️ Price Conflict: ${symbol}`;
  const message = [
    `<b>${sourceA}:</b> ₹${priceA}`,
    `<b>${sourceB}:</b> ₹${priceB}`,
    `<b>Deviation:</b> ${deviation.toFixed(2)}%`,
  ].join("\n");

  await queueNotification("telegram", "normal", title, message);
}
