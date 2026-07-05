import { fetchEbayActive, fetchEbayActiveByImage, fetchEbaySold } from "@/lib/sources/ebay";
import { fetchMercariActive, fetchMercariSold } from "@/lib/sources/mercari";
import { fetchPriceCharting } from "@/lib/sources/pricecharting";
import { fetchBuyeeActive, fetchFromJapanActive } from "@/lib/sources/proxy-malls";
import type { Rates } from "@/lib/sources/types";
import { fetchYahooActive, fetchYahooSold } from "@/lib/sources/yahoo-auction";
import type { ActiveListing, SearchQueries, SoldListing, SourceStatus } from "@/lib/types";

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

/** 수집 결과 + 소스별 상태(수집 실패와 "정상 0건"을 구분) */
export interface CollectSoldResult {
  listings: SoldListing[];
  statuses: SourceStatus[];
}
export interface CollectActiveResult {
  listings: ActiveListing[];
  statuses: SourceStatus[];
}

/** 개별 소스 실행을 상태로 감싼다. 예외는 삼키고 ok=false로 기록해 앱 안정성을 유지한다. */
async function runSource<T>(
  source: string,
  kind: "sold" | "active",
  fn: () => Promise<T[]>,
): Promise<{ listings: T[]; status: SourceStatus }> {
  try {
    const listings = await fn();
    return { listings, status: { source, kind, count: listings.length, ok: true } };
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e).slice(0, 120);
    return { listings: [], status: { source, kind, count: 0, ok: false, error } };
  }
}

/** 판매완료(sold) 데이터를 모든 소스에서 병렬 수집한다. 개별 실패는 상태로 기록된다. */
export async function collectSold(queries: SearchQueries, rates: Rates): Promise<CollectSoldResult> {
  const fb = primaryFallback(queries);
  const results = await Promise.all([
    runSource("ebay", "sold", () => fetchEbaySold(queryFor(queries, "ebay", fb), rates)),
    runSource("mercari", "sold", () => fetchMercariSold(queryFor(queries, "mercari", fb), rates)),
    runSource("yahoo-auction", "sold", () => fetchYahooSold(queryFor(queries, "yahoo-auction", fb), rates)),
    runSource("pricecharting", "sold", () => fetchPriceCharting(queryFor(queries, "pricecharting", fb), rates)),
  ]);
  return {
    listings: results.flatMap((r) => r.listings),
    statuses: results.map((r) => r.status),
  };
}

export interface CollectActiveOptions {
  /** 국내 상품 대표 이미지 — eBay search_by_image(시각 매칭)에 사용. 키 없으면 무시. */
  imageUrl?: string;
}

/** 현재 판매중(active) 데이터를 모든 소스에서 병렬 수집한다. 개별 실패는 상태로 기록된다. */
export async function collectActive(
  queries: SearchQueries,
  rates: Rates,
  opts: CollectActiveOptions = {},
): Promise<CollectActiveResult> {
  const fb = primaryFallback(queries);
  const tasks: Promise<{ listings: ActiveListing[]; status: SourceStatus }>[] = [
    runSource("ebay", "active", () => fetchEbayActive(queryFor(queries, "ebay", fb), rates)),
    runSource("mercari", "active", () => fetchMercariActive(queryFor(queries, "mercari", fb), rates)),
    runSource("yahoo-auction", "active", () => fetchYahooActive(queryFor(queries, "yahoo-auction", fb), rates)),
    runSource("buyee", "active", () => fetchBuyeeActive(fb, rates)),
    runSource("fromjapan", "active", () => fetchFromJapanActive(fb, rates)),
  ];
  // 이미지 기반 매칭(제목이 부실한 토이/피규어에 특히 효과) — 텍스트 검색과 병행
  if (opts.imageUrl) {
    const imageUrl = opts.imageUrl;
    tasks.push(runSource("ebay-image", "active", () => fetchEbayActiveByImage(imageUrl, rates)));
  }
  const results = await Promise.all(tasks);

  // 같은 매물이 텍스트/이미지 검색에 모두 잡히면 URL 기준으로 한 번만 남긴다
  const seen = new Set<string>();
  const listings = results
    .flatMap((r) => r.listings)
    .filter((l) => {
      const key = `${l.source}|${l.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { listings, statuses: results.map((r) => r.status) };
}
