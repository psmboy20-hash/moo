import type { MarketId } from "@/lib/types";

/**
 * 무게 기반 국제배송비 추정 (KRW).
 * 목적지별(미국/일본) 우체국 K-Packet·등기소형포장물 대략 요금을 무게 구간으로 근사.
 * 실제 계약 요율에 맞게 조정 가능.
 */

/** 카테고리 → 대표 무게(g) 추정. AI가 무게를 못 줄 때의 폴백. */
export const CATEGORY_WEIGHT_G: Record<string, number> = {
  "game-cart": 120, // GBA/DS/스위치 카트리지 (케이스 포함)
  "game-boxed": 300, // 박스 포함 게임(디스크/롬)
  "game-big-box": 600, // 빅박스 PC/한정판
  console: 2500, // 콘솔 본체
  "console-boxed": 3500, // 박스 콘솔
  card: 80, // 카드/부스터
  "card-box": 500, // 카드 박스
  figure: 500, // 피규어
  "figure-large": 1500,
  disc: 150, // CD/DVD/BD
  book: 400,
  default: 400,
};

export function estimateWeightGrams(categoryKey?: string, aiWeightGrams?: number): number {
  if (aiWeightGrams && Number.isFinite(aiWeightGrams) && aiWeightGrams > 0) {
    return Math.round(aiWeightGrams);
  }
  if (categoryKey && CATEGORY_WEIGHT_G[categoryKey]) return CATEGORY_WEIGHT_G[categoryKey];
  return CATEGORY_WEIGHT_G.default;
}

/** 무게 구간(g 상한)별 배송비(KRW). 목적지별 테이블. */
const SHIPPING_TABLE: Record<"US" | "JP", Array<[number, number]>> = {
  // [무게상한g, 배송비KRW]
  US: [
    [100, 9_000],
    [250, 13_000],
    [500, 18_000],
    [1000, 26_000],
    [2000, 40_000],
    [3000, 55_000],
    [Number.POSITIVE_INFINITY, 75_000],
  ],
  JP: [
    [100, 7_000],
    [250, 10_000],
    [500, 14_000],
    [1000, 20_000],
    [2000, 30_000],
    [3000, 42_000],
    [Number.POSITIVE_INFINITY, 58_000],
  ],
};

const MARKET_DEST: Record<MarketId, "US" | "JP"> = {
  "ebay-us": "US",
  "mercari-jp": "JP",
  "yahoo-jp": "JP",
};

/** 시장·무게로 국제배송비(KRW) 추정 */
export function estimateShippingKRW(market: MarketId, weightGrams: number): number {
  const dest = MARKET_DEST[market];
  const table = SHIPPING_TABLE[dest];
  const w = Math.max(1, weightGrams);
  for (const [maxG, cost] of table) {
    if (w <= maxG) return cost;
  }
  return table[table.length - 1][1];
}
