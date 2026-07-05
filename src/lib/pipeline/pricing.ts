import { mean, quantile, removeLowNoise, removeOutliersIQR } from "@/lib/pipeline/outliers";
import type { ActiveListing, ActiveStats, SoldListing, SoldSourceId, SoldStats } from "@/lib/types";

/**
 * 판매완료(sold) 매물로 보수/기준/공격 시세를 계산한다 (순수 함수).
 * - 보수(conservative): 하위 25% 분위수 → 확실히 팔리는 가격
 * - 기준(base): 중앙값 → 실질 시장가
 * - 공격(aggressive): 상위 75% 분위수 → 잘 받으면 나오는 가격
 * 실제 시세 판단은 반드시 이 sold 데이터를 우선 기준으로 사용한다.
 */
export function computeSoldStats(listings: SoldListing[]): SoldStats {
  const matched = listings.filter((l) => l.matched);
  const rawPrices = matched.map((l) => l.priceKRW);
  // 1) 극단적 저가 노이즈 제거(야후 1엔 낙찰 등) → 2) IQR 이상치 제거
  const denoised = removeLowNoise(rawPrices);
  const cleaned = removeOutliersIQR(denoised);
  const sorted = [...cleaned].sort((a, b) => a - b);

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

  return {
    conservative: Math.round(quantile(sorted, 0.25)),
    base: Math.round(quantile(sorted, 0.5)),
    aggressive: Math.round(quantile(sorted, 0.75)),
    sampleN: cleaned.length,
    rawN: rawPrices.length,
    bySource,
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
