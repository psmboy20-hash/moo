import { BUY_TARGETS, DEFAULT_FEES, type FeeConfig, THRESHOLDS } from "@/lib/config/fees";
import { breakEvenBuyPrice, maxBuyForTargets } from "@/lib/pipeline/profit";
import type {
  ActiveStats,
  BuyDecision,
  ProductIdentity,
  ProfitBreakdown,
  RiskFlag,
  SellDifficulty,
  SoldStats,
  Verdict,
  VerdictStatus,
} from "@/lib/types";

/** 현재 판매중 매물 수로 판매 난이도를 판정한다 */
export function computeSellDifficulty(active: ActiveStats): SellDifficulty {
  if (active.listingCount >= THRESHOLDS.highCompetitionListingCount) return "HIGH";
  if (active.listingCount >= THRESHOLDS.mediumCompetitionListingCount) return "MEDIUM";
  return "LOW";
}

const DIFFICULTY_LABEL: Record<SellDifficulty, string> = {
  LOW: "낮음",
  MEDIUM: "보통",
  HIGH: "높음",
};

/** 순이익·수익률 임계값으로 매입 판정 상태를 결정한다 (순수 함수) */
export function classifyVerdict(profit: ProfitBreakdown): VerdictStatus {
  const { netProfit, marginPct } = profit;
  if (netProfit < 0) return "AVOID";
  if (netProfit >= THRESHOLDS.recommendNetProfit && marginPct >= THRESHOLDS.recommendMarginPct) {
    return "RECOMMEND";
  }
  if (netProfit >= THRESHOLDS.conditionalNetProfitMin && marginPct >= THRESHOLDS.conditionalMarginPct) {
    return "CONDITIONAL";
  }
  return "HOLD";
}

/** 리스크 플래그를 모은다 */
export function collectRiskFlags(
  profit: ProfitBreakdown,
  identity: ProductIdentity,
  sold: SoldStats,
  difficulty: SellDifficulty,
): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (profit.netProfit < 0) {
    flags.push({ code: "LOSS_RISK", message: "수수료·배송비 반영 후 손실이 예상됩니다. 매입을 추천하지 않습니다." });
  }
  if (identity.accuracy < THRESHOLDS.identityAccuracyMin || identity.missingPhotos.length > 0) {
    const need = identity.missingPhotos.length > 0 ? ` (필요: ${identity.missingPhotos.join(", ")})` : "";
    flags.push({ code: "IDENTITY_UNCERTAIN", message: `제품 식별이 불확실합니다. 추가 사진을 확인하세요.${need}` });
  }
  if (identity.sealed === null) {
    flags.push({ code: "SEALING_UNCERTAIN", message: "미개봉 여부가 불확실합니다. 실링(밀봉) 사진을 요청하세요." });
  }
  if (difficulty === "HIGH") {
    flags.push({ code: "HIGH_COMPETITION", message: "현재 판매중 매물이 많아 판매 난이도가 높습니다." });
  }
  if (sold.sampleN < THRESHOLDS.thinDataSampleCount) {
    flags.push({ code: "THIN_DATA", message: "판매완료 표본이 적어 시세 신뢰도가 낮습니다." });
  }

  return flags;
}

export function buildVerdict(
  profit: ProfitBreakdown,
  identity: ProductIdentity,
  sold: SoldStats,
  difficulty: SellDifficulty,
): Verdict {
  return {
    status: classifyVerdict(profit),
    riskFlags: collectRiskFlags(profit, identity, sold, difficulty),
  };
}

const STATUS_STATEMENT: Record<VerdictStatus, string> = {
  RECOMMEND: "지금 국내 판매가로 매입해도 목표 순이익과 수익률을 만족합니다. 매입을 추천합니다.",
  CONDITIONAL: "수익은 나지만 여유가 크지 않습니다. 추천 최대 매입가 이하로 협상되면 매입하세요.",
  HOLD: "순이익이 얇습니다. 더 낮은 매입가가 아니면 보류를 권합니다.",
  AVOID: "수수료·배송비를 반영하면 손실 위험이 있습니다. 매입을 추천하지 않습니다.",
};

/**
 * 매입 판단 카드 데이터를 구성한다.
 * 추천 최대 매입가는 목표 순이익/수익률을 만족하는 상한을 역산해 계산한다.
 */
export function buildBuyDecision(
  currentDomesticPrice: number,
  expectedSalePriceKRW: number,
  profit: ProfitBreakdown,
  verdict: Verdict,
  difficulty: SellDifficulty,
  fees: FeeConfig = DEFAULT_FEES,
): BuyDecision {
  const safeBuyPrice = maxBuyForTargets(
    expectedSalePriceKRW,
    BUY_TARGETS.safeNetProfit,
    THRESHOLDS.recommendMarginPct,
    fees,
  );
  const recommendedMaxBuyPrice = maxBuyForTargets(
    expectedSalePriceKRW,
    BUY_TARGETS.maxNetProfit,
    BUY_TARGETS.maxMarginPct,
    fees,
  );
  const absoluteNoBuyPrice = breakEvenBuyPrice(expectedSalePriceKRW, fees);

  const statement = `${STATUS_STATEMENT[verdict.status]} (판매 난이도: ${DIFFICULTY_LABEL[difficulty]})`;

  return {
    currentDomesticPrice,
    safeBuyPrice,
    recommendedMaxBuyPrice,
    absoluteNoBuyPrice,
    netProfit: profit.netProfit,
    marginPct: profit.marginPct,
    sellDifficulty: difficulty,
    finalStatement: statement,
  };
}
