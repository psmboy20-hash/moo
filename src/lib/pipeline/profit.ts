import { DEFAULT_FEES, type FeeConfig } from "@/lib/config/fees";
import type { ProfitBreakdown } from "@/lib/types";

/** 예상 판매가 대비 변동비율 합 (수수료·결제·환율·클레임) */
function variableRate(fees: FeeConfig): number {
  return fees.sellingFeeRate + fees.paymentFeeRate + fees.fxRiskRate + fees.claimRiskRate;
}

/** 판매가와 무관한 고정비 합 (국제배송·포장·국내배송) */
function fixedCost(fees: FeeConfig): number {
  return fees.intlShipping + fees.packing + fees.domesticShipping;
}

/**
 * 실순이익 계산 (순수 함수).
 *
 *   예상 해외 판매가
 *   − 해외 판매 수수료 − 결제 수수료 − 국제배송비 − 포장비 − 국내배송비
 *   − 환율 리스크 − 클레임 리스크 − 국내 매입가
 *   = 예상 순이익
 *
 * 수익률(marginPct)은 매입가 대비 순이익으로 계산한다.
 */
export function computeProfit(
  expectedSalePriceKRW: number,
  domesticBuyPriceKRW: number,
  fees: FeeConfig = DEFAULT_FEES,
): ProfitBreakdown {
  const S = Math.max(0, expectedSalePriceKRW);
  const sellingFee = Math.round(S * fees.sellingFeeRate);
  const paymentFee = Math.round(S * fees.paymentFeeRate);
  const fxRisk = Math.round(S * fees.fxRiskRate);
  const claimRisk = Math.round(S * fees.claimRiskRate);
  const intlShipping = fees.intlShipping;
  const packing = fees.packing;
  const domesticShipping = fees.domesticShipping;

  const netProfit =
    S - sellingFee - paymentFee - intlShipping - packing - domesticShipping - fxRisk - claimRisk - domesticBuyPriceKRW;

  const marginPct = domesticBuyPriceKRW > 0 ? (netProfit / domesticBuyPriceKRW) * 100 : 0;

  return {
    expectedSalePriceKRW: S,
    sellingFee,
    paymentFee,
    intlShipping,
    packing,
    domesticShipping,
    fxRisk,
    claimRisk,
    domesticBuyPrice: domesticBuyPriceKRW,
    netProfit: Math.round(netProfit),
    marginPct: Math.round(marginPct * 10) / 10,
  };
}

/**
 * 목표 순이익만 만족하는 최대 매입가.
 *   netProfit = S(1−r) − F − B ≥ targetProfit  →  B ≤ S(1−r) − F − targetProfit
 */
export function maxBuyForNetProfit(
  expectedSalePriceKRW: number,
  targetNetProfit: number,
  fees: FeeConfig = DEFAULT_FEES,
): number {
  const S = Math.max(0, expectedSalePriceKRW);
  const b = S * (1 - variableRate(fees)) - fixedCost(fees) - targetNetProfit;
  return Math.max(0, Math.round(b));
}

/**
 * 목표 순이익과 목표 수익률을 모두 만족하는 최대 매입가.
 *   수익률 제약: S(1−r) − F − B ≥ m·B  →  B ≤ (S(1−r) − F) / (1 + m)
 * 두 제약 중 더 낮은 값을 취한다.
 */
export function maxBuyForTargets(
  expectedSalePriceKRW: number,
  targetNetProfit: number,
  targetMarginPct: number,
  fees: FeeConfig = DEFAULT_FEES,
): number {
  const S = Math.max(0, expectedSalePriceKRW);
  const contribution = S * (1 - variableRate(fees)) - fixedCost(fees);
  const m = targetMarginPct / 100;

  const byProfit = contribution - targetNetProfit;
  const byMargin = contribution / (1 + m);

  return Math.max(0, Math.round(Math.min(byProfit, byMargin)));
}

/**
 * 손익분기 매입가 (순이익 = 0). 이 값을 초과해 매입하면 손실.
 *   B_breakeven = S(1−r) − F
 */
export function breakEvenBuyPrice(expectedSalePriceKRW: number, fees: FeeConfig = DEFAULT_FEES): number {
  const S = Math.max(0, expectedSalePriceKRW);
  return Math.max(0, Math.round(S * (1 - variableRate(fees)) - fixedCost(fees)));
}
