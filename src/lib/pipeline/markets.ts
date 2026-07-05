import { feesForMarket } from "@/lib/config/fees";
import { median, removeLowNoise } from "@/lib/pipeline/outliers";
import { computeProfit } from "@/lib/pipeline/profit";
import {
  type ActiveListing,
  type ConditionTier,
  type MarketId,
  type MarketProfit,
  marketOfSource,
  type SellThrough,
  type SoldListing,
} from "@/lib/types";

/** 대상 티어의 판매완료만 추린다. 표본이 3개 미만이면 전체로 폴백(같은 티어 우선, 부족 시 전체). */
function pickTierMatched(matched: SoldListing[], targetTier: ConditionTier): SoldListing[] {
  if (targetTier === "UNKNOWN") return matched;
  const tierOnly = matched.filter((l) => (l.conditionTier ?? "UNKNOWN") === targetTier);
  return tierOnly.length >= 3 ? tierOnly : matched;
}

/**
 * 시장별(eBay US / Mercari JP / Yahoo JP) 순이익을 각각 계산한다 (순수 함수).
 * 각 시장은 자기 판매완료 표본의 중앙값을 예상 판매가로 쓰고,
 * 시장 고유 수수료·통화·무게배송비로 순이익을 산출한다. 순이익 내림차순 정렬.
 */
export function computeMarketProfits(
  sold: SoldListing[],
  buyPriceKRW: number,
  weightGrams: number,
  targetTier: ConditionTier = "UNKNOWN",
): MarketProfit[] {
  const matchedAll = sold.filter((l) => l.matched && l.priceKRW > 0);
  const matched = pickTierMatched(matchedAll, targetTier);
  const byMarket = new Map<MarketId, number[]>();
  for (const l of matched) {
    const m = marketOfSource(l.source);
    const arr = byMarket.get(m) ?? [];
    arr.push(l.priceKRW);
    byMarket.set(m, arr);
  }

  const out: MarketProfit[] = [];
  for (const [market, pricesRaw] of byMarket) {
    const prices = removeLowNoise(pricesRaw);
    if (prices.length === 0) continue;
    const expectedSalePriceKRW = Math.round(median(prices));
    const profit = computeProfit(expectedSalePriceKRW, buyPriceKRW, feesForMarket(market, weightGrams));
    out.push({ market, expectedSalePriceKRW, sampleN: prices.length, profit });
  }

  return out.sort((a, b) => b.profit.netProfit - a.profit.netProfit);
}

/**
 * 판매 회전성(sell-through)을 계산한다 (순수 함수).
 * 판매완료 수 대비 판매중 수 비율로 "얼마나 잘 팔리는가"를 근사한다.
 * 예상 회전기간은 판매완료 표본이 충분할 때만 대략 추정(데이터 한계로 보수적).
 */
export function computeSellThrough(sold: SoldListing[], active: ActiveListing[]): SellThrough {
  const soldCount = sold.filter((l) => l.matched).length;
  const activeCount = active.filter((l) => l.matched).length;
  const denom = soldCount + activeCount;
  const ratio = denom > 0 ? soldCount / denom : 0;

  // 회전기간 추정: 판매중 매물이 판매완료 속도로 소진된다고 가정한 대략치.
  // sold 표본이 최근 30일 것이라고 근사(정확한 날짜 데이터 부족) → days ≈ activeCount / (soldCount/30).
  let estTurnoverDays: number | null = null;
  if (soldCount >= 3) {
    const soldPerDay = soldCount / 30;
    estTurnoverDays = soldPerDay > 0 ? Math.round(Math.max(1, activeCount) / soldPerDay) : null;
  }

  return { soldCount, activeCount, ratio: Math.round(ratio * 100) / 100, estTurnoverDays };
}
