import { fetchEbayActive, fetchEbayActiveByImage, fetchEbaySold } from "@/lib/sources/ebay";
import { fetchMercariActive, fetchMercariSold } from "@/lib/sources/mercari";
import { fetchPriceCharting } from "@/lib/sources/pricecharting";
import { fetchBuyeeActive, fetchFromJapanActive } from "@/lib/sources/proxy-malls";
import type { Rates } from "@/lib/sources/types";
import { fetchYahooActive, fetchYahooSold } from "@/lib/sources/yahoo-auction";
import type { ActiveListing, SearchQueries, SoldListing } from "@/lib/types";

/** 소스에 넘길 대표 검색어 (소스별 첫 쿼리, 없으면 공통 폴백) */
function queryFor(queries: SearchQueries, key: string, fallback: string): string {
  return queries[key]?.[0] ?? fallback;
}

function primaryFallback(queries: SearchQueries): string {
  for (const list of Object.values(queries)) {
    if (list.length > 0) return list[0];
  }
  return "";
}

/** 판매완료(sold) 데이터를 모든 소스에서 병렬 수집한다. 개별 실패는 무시된다. */
export async function collectSold(queries: SearchQueries, rates: Rates): Promise<SoldListing[]> {
  const fb = primaryFallback(queries);
  const tasks: Promise<SoldListing[]>[] = [
    fetchEbaySold(queryFor(queries, "ebay", fb), rates),
    fetchMercariSold(queryFor(queries, "mercari", fb), rates),
    fetchYahooSold(queryFor(queries, "yahoo-auction", fb), rates),
    fetchPriceCharting(queryFor(queries, "pricecharting", fb), rates),
  ];
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export interface CollectActiveOptions {
  /** 국내 상품 대표 이미지 — eBay search_by_image(시각 매칭)에 사용. 키 없으면 무시. */
  imageUrl?: string;
}

/** 현재 판매중(active) 데이터를 모든 소스에서 병렬 수집한다. 개별 실패는 무시된다. */
export async function collectActive(
  queries: SearchQueries,
  rates: Rates,
  opts: CollectActiveOptions = {},
): Promise<ActiveListing[]> {
  const fb = primaryFallback(queries);
  const tasks: Promise<ActiveListing[]>[] = [
    fetchEbayActive(queryFor(queries, "ebay", fb), rates),
    fetchMercariActive(queryFor(queries, "mercari", fb), rates),
    fetchYahooActive(queryFor(queries, "yahoo-auction", fb), rates),
    fetchBuyeeActive(fb, rates),
    fetchFromJapanActive(fb, rates),
  ];
  // 이미지 기반 매칭(제목이 부실한 토이/피규어에 특히 효과) — 텍스트 검색과 병행
  if (opts.imageUrl) tasks.push(fetchEbayActiveByImage(opts.imageUrl, rates));
  const settled = await Promise.allSettled(tasks);
  // 같은 매물이 텍스트/이미지 검색에 모두 잡히면 URL 기준으로 한 번만 남긴다
  const seen = new Set<string>();
  return settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((l) => {
      const key = `${l.source}|${l.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
