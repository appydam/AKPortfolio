import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (supabase) return supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  supabase = createClient(url, key);
  return supabase;
}

// Helper to match the old ensureStock pattern used across all scrapers
export async function ensureStock(symbol: string, name: string): Promise<number> {
  const db = getDb();

  const { data: existing } = await db
    .from("stocks")
    .select("id")
    .eq("symbol", symbol)
    .single();

  if (existing) return existing.id;

  const { data: inserted, error } = await db
    .from("stocks")
    .insert({ symbol, name })
    .select("id")
    .single();

  if (error) {
    // Might be a race condition — try fetching again
    const { data: retry } = await db
      .from("stocks")
      .select("id")
      .eq("symbol", symbol)
      .single();
    if (retry) return retry.id;
    throw error;
  }

  return inserted!.id;
}
