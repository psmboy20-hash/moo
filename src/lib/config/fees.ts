/**
 * 수익 계산에 쓰이는 모든 상수 설정.
 * 실제 운영 시 플랫폼 정책·배송 계약에 맞게 조정한다.
 */

export interface FeeConfig {
  /** 해외 판매 플랫폼 수수료율 (예상 판매가 대비) */
  sellingFeeRate: number;
  /** 결제/정산 수수료율 (예상 판매가 대비) */
  paymentFeeRate: number;
  /** 국제 배송비 (KRW, 기본 무게 구간) */
  intlShipping: number;
  /** 포장비 (KRW) */
  packing: number;
  /** 국내 수령 배송비 (KRW) */
  domesticShipping: number;
  /** 환율 변동 리스크 버퍼율 (예상 판매가 대비) */
  fxRiskRate: number;
  /** 반품/클레임 리스크 버퍼율 (예상 판매가 대비) */
  claimRiskRate: number;
}

/**
 * 기본 수수료 프리셋.
 * eBay final value fee(~13%)를 기준값으로 두고, Mercari(~10%)는 낮은 편.
 * 링크 하나로 빠르게 판단하는 앱이므로 보수적으로 eBay 기준을 기본값으로 사용한다.
 */
export const DEFAULT_FEES: FeeConfig = {
  sellingFeeRate: 0.13,
  paymentFeeRate: 0.03,
  intlShipping: 18_000,
  packing: 2_000,
  domesticShipping: 3_000,
  fxRiskRate: 0.02,
  claimRiskRate: 0.03,
};

export const MERCARI_FEES: FeeConfig = {
  ...DEFAULT_FEES,
  sellingFeeRate: 0.1,
};

/* ------------------------------------------------------------------ */
/* 시장별 수수료·통화 (멀티마켓 순이익)                                  */
/* ------------------------------------------------------------------ */

import { estimateShippingKRW } from "@/lib/config/shipping";
import type { Currency, MarketId } from "@/lib/types";

export const MARKET_LABEL: Record<MarketId, string> = {
  "ebay-us": "eBay (US)",
  "mercari-jp": "Mercari (JP)",
  "yahoo-jp": "Yahoo Auction (JP)",
};

interface MarketFeeSpec {
  currency: Currency;
  sellingFeeRate: number;
  paymentFeeRate: number;
  fxRiskRate: number;
  claimRiskRate: number;
}

/** 시장별 수수료율(판매가 대비)·정산 통화. 배송비는 무게로 별도 산정. */
export const MARKET_FEES: Record<MarketId, MarketFeeSpec> = {
  // eBay: final value fee ~13% + 결제/정산 ~3%, USD 정산(환전 리스크 큼)
  "ebay-us": { currency: "USD", sellingFeeRate: 0.13, paymentFeeRate: 0.03, fxRiskRate: 0.02, claimRiskRate: 0.03 },
  // Mercari JP: 판매 수수료 10%(결제 포함), JPY 정산
  "mercari-jp": { currency: "JPY", sellingFeeRate: 0.1, paymentFeeRate: 0.0, fxRiskRate: 0.02, claimRiskRate: 0.03 },
  // Yahoo Auction JP: 시스템 이용료 ~10%, JPY 정산
  "yahoo-jp": { currency: "JPY", sellingFeeRate: 0.1, paymentFeeRate: 0.0, fxRiskRate: 0.02, claimRiskRate: 0.03 },
};

/** 시장·무게로 완전한 FeeConfig 구성 (배송비=무게 테이블, 포장·국내배송=공통 상수) */
export function feesForMarket(market: MarketId, weightGrams: number): FeeConfig {
  const m = MARKET_FEES[market];
  return {
    sellingFeeRate: m.sellingFeeRate,
    paymentFeeRate: m.paymentFeeRate,
    intlShipping: estimateShippingKRW(market, weightGrams),
    packing: DEFAULT_FEES.packing,
    domesticShipping: DEFAULT_FEES.domesticShipping,
    fxRiskRate: m.fxRiskRate,
    claimRiskRate: m.claimRiskRate,
  };
}

/* ------------------------------------------------------------------ */
/* 판정 임계값                                                          */
/* ------------------------------------------------------------------ */

export const THRESHOLDS = {
  /** 매입 추천: 순이익 이상 */
  recommendNetProfit: 50_000,
  /** 매입 추천: 수익률(%) 이상 */
  recommendMarginPct: 30,
  /** 조건부 매입: 순이익 하한 (이상) */
  conditionalNetProfitMin: 20_000,
  /** 조건부 매입: 수익률(%) 이상 */
  conditionalMarginPct: 20,
  /** 보류: 순이익 이하 */
  holdNetProfitMax: 20_000,
  /** 판매 난이도 '높음' 판단: 현재 판매중 매물 수 이상 */
  highCompetitionListingCount: 25,
  /** 판매 난이도 '보통' 판단: 현재 판매중 매물 수 이상 */
  mediumCompetitionListingCount: 10,
  /** 제품 식별 정확도가 이 값 미만이면 추가 사진 요청 */
  identityAccuracyMin: 70,
  /** 시세 표본이 이 수 미만이면 데이터 부족 경고 */
  thinDataSampleCount: 3,
  /** 매칭 신뢰도가 이 값 미만이면 사용자 확인 필요 */
  matchConfirmMin: 60,
} as const;

/**
 * 추천 최대 매입가 산정에 쓰는 목표치.
 * 조건부 매입 하한(순이익 2만, 수익률 20%)을 만족하는 최대 매입가를 역산한다.
 */
export const BUY_TARGETS = {
  /** 안전 매입가: 이 순이익을 확보하는 매입가 */
  safeNetProfit: THRESHOLDS.recommendNetProfit,
  /** 추천 최대 매입가: 이 순이익을 확보하는 매입가 */
  maxNetProfit: THRESHOLDS.conditionalNetProfitMin,
  /** 추천 최대 매입가: 최소 수익률(%) */
  maxMarginPct: THRESHOLDS.conditionalMarginPct,
} as const;
