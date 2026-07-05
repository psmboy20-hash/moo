import { analyzeImages, generateSearchQueries } from "@/lib/ai";
import { fallbackIdentity, fallbackQueries } from "@/lib/ai/fallback";
import { DEFAULT_FEES, feesForMarket } from "@/lib/config/fees";
import { getRates } from "@/lib/config/fx";
import { estimateWeightGrams } from "@/lib/config/shipping";
import { tagConditionTiers, tierOfIdentity } from "@/lib/pipeline/condition";
import { markMatches } from "@/lib/pipeline/filter";
import { computeMarketProfits, computeSellThrough } from "@/lib/pipeline/markets";
import { computeActiveStats, computeSoldStats } from "@/lib/pipeline/pricing";
import { computeProfit } from "@/lib/pipeline/profit";
import { suggestPrices } from "@/lib/pipeline/suggest";
import { buildBuyDecision, buildVerdict, computeSellDifficulty } from "@/lib/pipeline/verdict";
import { collectActive, collectSold } from "@/lib/sources";
import type {
  ActiveListing,
  AnalysisResult,
  Currency,
  DomesticListing,
  ProductIdentity,
  SearchQueries,
  SoldListing,
} from "@/lib/types";

export interface AnalyzeOverrides {
  /** 이미 알고 있는 식별 정보 (fixture/테스트용) */
  identity?: ProductIdentity;
  /** 미리 준비된 판매완료 매물 (fixture/테스트용) */
  sold?: SoldListing[];
  /** 미리 준비된 판매중 매물 (fixture/테스트용) */
  active?: ActiveListing[];
  /** 환율 오버라이드 */
  rates?: Record<Currency, number>;
}

/** AI 검색어에 폴백을 병합해 4개 소스가 항상 채워지도록 보장 */
function mergeQueries(ai: SearchQueries | null, fb: SearchQueries): SearchQueries {
  const merged: SearchQueries = { ...fb };
  if (ai) {
    for (const [k, v] of Object.entries(ai)) {
      if (v.length > 0) merged[k] = v;
    }
  }
  return merged;
}

/**
 * 데이터 흐름 1~17단계를 실행해 6카드 결과를 만든다.
 * 스크래핑/AI 실패는 저하 동작으로 흡수하며 절대 throw하지 않는 것을 지향한다.
 */
export async function analyze(listing: DomesticListing, overrides: AnalyzeOverrides = {}): Promise<AnalysisResult> {
  const notes: string[] = [];

  // 3) AI 이미지 분석 (실패 시 제목 기반 저하)
  let degraded = false;
  let identity: ProductIdentity;
  if (overrides.identity) {
    identity = overrides.identity;
  } else {
    const ai = await analyzeImages(listing);
    if (ai) {
      identity = ai;
    } else {
      identity = fallbackIdentity(listing);
      degraded = true;
      notes.push("AI 이미지 분석을 사용할 수 없어 제목 기반으로 식별했습니다. 정확도가 낮습니다.");
    }
  }

  // 5) 해외 검색어 생성 (+ 폴백 병합)
  const fb = fallbackQueries(identity, listing);
  const aiQueries = overrides.identity || degraded ? null : await generateSearchQueries(identity);
  const queries = mergeQueries(aiQueries, fb);

  // 환율
  const rates = overrides.rates ?? (await getRates());

  // 6~7) 판매완료/판매중 수집
  const [soldRaw, activeRaw] = await Promise.all([
    overrides.sold ? Promise.resolve(overrides.sold) : collectSold(queries, rates),
    overrides.active
      ? Promise.resolve(overrides.active)
      : collectActive(queries, rates, { imageUrl: listing.images[0] }),
  ]);

  // 8~9) 동일 제품 검증 + 불일치 제거 (matched 플래그 재판정) + 상태 티어 태깅
  const sold = tagConditionTiers(markMatches(soldRaw, identity));
  const active = tagConditionTiers(markMatches(activeRaw, identity));
  const targetTier = tierOfIdentity(identity);

  const matchedSold = sold.filter((l) => l.matched).length;
  const _matchedActive = active.filter((l) => l.matched).length;
  if (matchedSold === 0) notes.push("동일 제품으로 검증된 판매완료 데이터가 없습니다. 시세 신뢰도가 낮습니다.");
  if (soldRaw.length > 0 && matchedSold === 0) {
    notes.push("수집된 판매완료 매물이 지역판/제품명 불일치로 모두 제외되었습니다.");
  }

  // 10~11) 이상치 제거 + 보수/기준/공격 시세 (티어별 포함)
  const soldStats = computeSoldStats(sold, targetTier);
  // 12) 경쟁가 분석
  const activeStats = computeActiveStats(active);

  // 판매 난이도
  const difficulty = computeSellDifficulty(activeStats);

  // 13) 판매가 제안
  const suggestion = suggestPrices(soldStats, activeStats, identity, difficulty);

  // 시장별 순이익 + 최적 판매처 + 회전성 + 무게
  const weightGrams = estimateWeightGrams(identity.categoryKey, identity.weightGramsEst);
  const markets = computeMarketProfits(sold, listing.priceKRW, weightGrams, targetTier);
  const bestMarket = markets[0]?.market ?? null;
  const sellThrough = computeSellThrough(sold, active);

  // 14~15) 수수료·배송·환율·리스크 반영 순이익/수익률
  // 최적 판매처가 있으면 그 시장 기준을, 없으면(시세 없음) 제안가+기본수수료로 판정.
  const best = markets[0];
  const headlineFees = bestMarket ? feesForMarket(bestMarket, weightGrams) : DEFAULT_FEES;
  const expectedSale = best ? best.expectedSalePriceKRW : suggestion.finalRecommended;
  const profit = best ? best.profit : computeProfit(expectedSale, listing.priceKRW, DEFAULT_FEES);

  // 16~17) 매입 판단 + 최종 판정
  const verdict = buildVerdict(profit, identity, soldStats, difficulty);
  const decision = buildBuyDecision(listing.priceKRW, expectedSale, profit, verdict, difficulty, headlineFees);

  return {
    listing,
    identity,
    queries,
    sold: { listings: sold, stats: soldStats },
    active: { listings: active, stats: activeStats },
    suggestion,
    profit,
    decision,
    verdict,
    markets,
    bestMarket,
    sellThrough,
    weightGrams,
    degraded,
    notes,
  };
}
