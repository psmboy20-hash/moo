import type { ActiveStats, PriceSuggestion, ProductIdentity, SellDifficulty, SoldStats } from "@/lib/types";

/** 상태가 좋거나 미개봉/희귀품이면 고가 대기 전략이 유효하다 */
function isPremiumEligible(identity: ProductIdentity): boolean {
  if (identity.sealed === true) return true;
  const cond = identity.condition.toLowerCase();
  if (/미개봉|new|sealed|s급|a급|mint/.test(cond)) return true;
  const ver = identity.version.toLowerCase();
  if (/한정|limited|희귀|rare|초회|스틸북|steelbook/.test(ver)) return true;
  return false;
}

/**
 * 판매완료 시세와 현재 경쟁가를 바탕으로 판매가를 제안한다 (순수 함수).
 * - 빠른 판매가: 판매완료 평균 근처이거나 현재 경쟁 최저가보다 약간 낮게
 * - 기준 판매가: 판매완료 상단과 현재 경쟁가 중간
 * - 고가 대기: 상태 좋음/미개봉/희귀 시 현재 상위 매물 근처
 */
export function suggestPrices(
  sold: SoldStats,
  active: ActiveStats,
  identity: ProductIdentity,
  difficulty: SellDifficulty,
): PriceSuggestion {
  const hasSold = sold.base > 0;
  const hasActive = active.minCompetitor > 0;

  const soldBase = hasSold ? sold.base : active.avgCompetitor;
  const soldTop = hasSold ? sold.aggressive : active.topTier;

  // 빠른 판매가: sold 평균과 (경쟁 최저가 * 0.97) 중 더 낮은 쪽
  const quickCandidates: number[] = [];
  if (soldBase > 0) quickCandidates.push(soldBase);
  if (hasActive) quickCandidates.push(Math.round(active.minCompetitor * 0.97));
  const quick = quickCandidates.length > 0 ? Math.min(...quickCandidates) : 0;

  // 기준 판매가: sold 상단과 경쟁 평균가의 중간
  const baseParts: number[] = [];
  if (soldTop > 0) baseParts.push(soldTop);
  if (hasActive) baseParts.push(active.avgCompetitor);
  const base = baseParts.length > 0 ? Math.round(baseParts.reduce((a, b) => a + b, 0) / baseParts.length) : quick;

  // 고가 대기: 현재 상위 매물 근처 (없으면 sold 공격가)
  const premiumBaseline = hasActive ? active.topTier : soldTop;
  const premiumEligible = isPremiumEligible(identity);
  const premium = premiumEligible ? Math.round(Math.max(premiumBaseline, base) * 1.03) : premiumBaseline;

  // 최종 추천: 판매 난이도가 높으면 빠른가, 아니면 기준가.
  // 미개봉/희귀 + 난이도 낮음이면 기준가 유지(무리한 고가는 회전 저하).
  let finalRecommended = base;
  let reason: string;
  if (difficulty === "HIGH") {
    finalRecommended = quick > 0 ? quick : base;
    reason = "현재 판매중 매물이 많아 회전을 우선했습니다. 경쟁 최저가보다 약간 낮은 빠른 판매가를 추천합니다.";
  } else if (premiumEligible && difficulty === "LOW") {
    finalRecommended = base;
    reason =
      "미개봉/희귀·상태 우수 매물이고 경쟁이 적어 기준 판매가를 추천합니다. 급하지 않다면 고가 대기가로 상위 시세를 노려볼 수 있습니다.";
  } else {
    finalRecommended = base;
    reason =
      "판매완료 상단과 현재 경쟁가의 중간인 기준 판매가를 추천합니다. 빠른 회전이 필요하면 빠른 판매가로 낮추세요.";
  }

  return {
    quick: Math.max(0, quick),
    base: Math.max(0, base),
    premium: Math.max(0, premium),
    finalRecommended: Math.max(0, finalRecommended),
    reason,
  };
}
