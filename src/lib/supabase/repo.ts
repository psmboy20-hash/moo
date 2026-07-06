import { getSupabase } from "@/lib/supabase/server";
import type { AnalysisResult } from "@/lib/types";

const OWNER = "me";

export interface AnalysisRow {
  id: string;
  created_at: string;
  url: string | null;
  title: string | null;
  price_krw: number | null;
  verdict: string | null;
  best_market: string | null;
  net_profit: number | null;
  margin_pct: number | null;
  match_confidence: number | null;
  result: AnalysisResult;
}

export interface WatchlistRow {
  id: string;
  created_at: string;
  title: string;
  url: string | null;
  note: string | null;
  analysis_id: string | null;
}

export interface InventoryRow {
  id: string;
  created_at: string;
  title: string;
  buy_price_krw: number;
  buy_date: string | null;
  sell_price_krw: number | null;
  sell_date: string | null;
  market: string | null;
  status: "holding" | "sold";
  realized_profit_krw: number | null;
  analysis_id: string | null;
}

/** 분석 결과 스냅샷 저장 */
export async function saveAnalysis(result: AnalysisResult): Promise<AnalysisRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("analyses")
    .insert({
      owner: OWNER,
      url: result.listing.url || null,
      title: result.identity.name || result.listing.title,
      price_krw: result.listing.priceKRW,
      verdict: result.verdict.status,
      best_market: result.bestMarket,
      net_profit: result.profit.netProfit,
      margin_pct: result.profit.marginPct,
      match_confidence: result.matchConfidence,
      result,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as AnalysisRow;
}

export async function listAnalyses(limit = 50): Promise<AnalysisRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("analyses")
    .select()
    .eq("owner", OWNER)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AnalysisRow[];
}

/* --------------------------- watchlist --------------------------- */

export async function listWatchlist(): Promise<WatchlistRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("watchlist")
    .select()
    .eq("owner", OWNER)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WatchlistRow[];
}

export async function addWatchlist(item: {
  title: string;
  url?: string;
  note?: string;
  analysisId?: string;
}): Promise<WatchlistRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("watchlist")
    .insert({
      owner: OWNER,
      title: item.title,
      url: item.url ?? null,
      note: item.note ?? null,
      analysis_id: item.analysisId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WatchlistRow;
}

export async function removeWatchlist(id: string): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("watchlist").delete().eq("owner", OWNER).eq("id", id);
  if (error) throw new Error(error.message);
}

/* --------------------------- inventory --------------------------- */

export async function listInventory(): Promise<InventoryRow[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("inventory")
    .select()
    .eq("owner", OWNER)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryRow[];
}

export async function addInventory(item: {
  title: string;
  buyPriceKRW: number;
  buyDate?: string;
  market?: string;
  analysisId?: string;
}): Promise<InventoryRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data, error } = await db
    .from("inventory")
    .insert({
      owner: OWNER,
      title: item.title,
      buy_price_krw: item.buyPriceKRW,
      buy_date: item.buyDate ?? null,
      market: item.market ?? null,
      analysis_id: item.analysisId ?? null,
      status: "holding",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryRow;
}

/** 판매 기록으로 갱신 (실현손익 계산) */
export async function markInventorySold(
  id: string,
  sell: { sellPriceKRW: number; sellDate?: string },
): Promise<InventoryRow | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data: cur, error: e1 } = await db.from("inventory").select().eq("owner", OWNER).eq("id", id).single();
  if (e1) throw new Error(e1.message);
  const buy = (cur as InventoryRow).buy_price_krw;
  const realized = sell.sellPriceKRW - buy;
  const { data, error } = await db
    .from("inventory")
    .update({
      sell_price_krw: sell.sellPriceKRW,
      sell_date: sell.sellDate ?? null,
      status: "sold",
      realized_profit_krw: realized,
    })
    .eq("owner", OWNER)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryRow;
}
