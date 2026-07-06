import { mean, quantile, removeLowNoise, removeOutliersIQR } from "@/lib/pipeline/outliers";
import type {
  ActiveListing,
  ActiveStats,
  ConditionTier,
  SoldListing,
  SoldSourceId,
  SoldStats,
  TierStat,
} from "@/lib/types";

/** 가격 배열 → 보수/기준/공격 티어 통계 (노이즈·이상치 제거 후) */
function tierStatFromPrices(prices: number[]): TierStat {
  const cleaned = removeOutliersIQR(removeLowNoise(prices));
  const sorted = [...cleaned].sort((a, b) => a - b);
  return {
    conservative: Math.round(quantile(sorted, 0.25)),
    base: Math.round(quantile(sorted, 0.5)),
    aggressive: Math.round(quantile(sorted, 0.75)),
    sampleN: cleaned.length,
  };
}

/**
 * 판매완료(sold) 매물로 보수/기준/공격 시세를 계산한다 (순수 함수).
 * 전체 통계 + 상태 티어별 통계(byTier)를 함께 산출해 같은 티어끼리 비교할 수 있게 한다.
 */
export function computeSoldStats(listings: SoldListing[], targetTier: ConditionTier = "UNKNOWN"): SoldStats {
  const matched = listings.filter((l) => l.matched);
  const rawPrices = matched.map((l) => l.priceKRW);
  const overall = tierStatFromPrices(rawPrices);

  const bySource: Partial<Record<SoldSourceId, number>> = {};
  for (const source of new Set(matched.map((l) => l.source))) {
    const prices = matched.filter((l) => l.source === source).map((l) => l.priceKRW);
    if (prices.length > 0) {
      bySource[source] = Math.round(
        quantile(
          [...prices].sort((a, b) => a - b),
          0.5,
        ),
      );
    }
  }

  const byTier: Partial<Record<ConditionTier, TierStat>> = {};
  for (const tier of new Set(matched.map((l) => l.conditionTier ?? "UNKNOWN"))) {
    const prices = matched.filter((l) => (l.conditionTier ?? "UNKNOWN") === tier).map((l) => l.priceKRW);
    if (prices.length > 0) byTier[tier] = tierStatFromPrices(prices);
  }

  return {
    conservative: overall.conservative,
    base: overall.base,
    aggressive: overall.aggressive,
    sampleN: overall.sampleN,
    rawN: rawPrices.length,
    bySource,
    byTier,
    targetTier,
  };
}

/**
 * 현재 판매중(active) 매물로 경쟁가를 분석한다 (순수 함수).
 * 이 값은 실제 시세가 아니라 "내가 얼마로 올릴지" 판매가 제안·경쟁 분석에만 사용한다.
 */
export function computeActiveStats(listings: ActiveListing[]): ActiveStats {
  const matched = listings.filter((l) => l.matched);
  const prices = matched.map((l) => l.priceKRW).filter((v) => v > 0);
  const perceived = matched.map((l) => l.buyerPerceivedKRW).filter((v) => v > 0);

  if (prices.length === 0) {
    return {
      minCompetitor: 0,
      avgCompetitor: 0,
      topTier: 0,
      buyerPerceivedAvg: 0,
      listingCount: matched.length,
    };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const topQuartileThreshold = quantile(sorted, 0.75);
  const topPrices = sorted.filter((p) => p >= topQuartileThreshold);

  return {
    minCompetitor: Math.round(sorted[0]),
    avgCompetitor: Math.round(mean(sorted)),
    topTier: Math.round(mean(topPrices.length > 0 ? topPrices : sorted)),
    buyerPerceivedAvg: Math.round(perceived.length > 0 ? mean(perceived) : mean(sorted)),
    listingCount: matched.length,
  };
}
