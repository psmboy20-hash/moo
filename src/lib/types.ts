import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

/** 국내 소싱 플랫폼 */
export const DOMESTIC_PLATFORMS = ["joonggonara", "bunjang", "smartstore", "naver-shopping", "other"] as const;
export type DomesticPlatform = (typeof DOMESTIC_PLATFORMS)[number];

/** 해외 판매완료(sold) 시세 소스 */
export const SOLD_SOURCES = ["ebay", "mercari", "yahoo-auction", "pricecharting"] as const;
export type SoldSourceId = (typeof SOLD_SOURCES)[number];

/** 해외 판매중(active) 매물 소스 */
export const ACTIVE_SOURCES = ["ebay", "mercari", "yahoo-auction", "overseas-mall"] as const;
export type ActiveSourceId = (typeof ACTIVE_SOURCES)[number];

export type Currency = "USD" | "JPY" | "KRW";

/** 판매 대상 해외 시장 (멀티마켓 순이익 계산 단위) */
export const MARKETS = ["ebay-us", "mercari-jp", "yahoo-jp"] as const;
export type MarketId = (typeof MARKETS)[number];

/** 시세 소스 → 판매 시장 매핑 (PriceCharting은 USD 기준가라 eBay US에 귀속) */
export function marketOfSource(source: SoldSourceId | ActiveSourceId): MarketId {
  switch (source) {
    case "mercari":
      return "mercari-jp";
    case "yahoo-auction":
      return "yahoo-jp";
    default:
      return "ebay-us"; // ebay, pricecharting, overseas-mall
  }
}

/** 소스별 수집 결과 상태 (수집 실패와 "정상적으로 0건"을 구분해 정직하게 표기) */
export interface SourceStatus {
  /** 소스 식별자 (예: "yahoo-auction", "pricecharting") */
  source: string;
  /** sold(판매완료) / active(판매중) 구분 */
  kind: "sold" | "active";
  /** 반환된 매물 수 (매칭 이전 원시 건수) */
  count: number;
  /** 수집 자체가 성공했는지 (false = 예외/차단으로 실패, count 0과 구분) */
  ok: boolean;
  /** 실패 사유 (짧게, ok=false일 때만) */
  error?: string;
}

/** 소스 식별자 → 사람이 읽는 라벨 */
export const SOURCE_LABEL: Record<string, string> = {
  ebay: "eBay",
  "ebay-image": "eBay(이미지검색)",
  mercari: "Mercari",
  "yahoo-auction": "Yahoo Auction",
  pricecharting: "PriceCharting",
  buyee: "Buyee",
  fromjapan: "FromJapan",
  "overseas-mall": "해외몰",
};

/** 최종 매입 판정 */
export type VerdictStatus = "RECOMMEND" | "CONDITIONAL" | "HOLD" | "AVOID";

/** 판매 난이도 */
export type SellDifficulty = "LOW" | "MEDIUM" | "HIGH";

/** 상품 상태(컨디션) 티어 — 시세를 같은 티어끼리 비교하기 위한 구분 */
export const CONDITION_TIERS = ["SEALED", "CIB", "LOOSE", "UNKNOWN"] as const;
export type ConditionTier = (typeof CONDITION_TIERS)[number];

/* ------------------------------------------------------------------ */
/* Input schemas (Zod)                                                 */
/* ------------------------------------------------------------------ */

export const urlInputSchema = z.object({
  url: z.string().trim().url("올바른 상품 링크(URL)를 입력하세요."),
});
export type UrlInput = z.infer<typeof urlInputSchema>;

export const manualListingSchema = z.object({
  url: z.string().trim().url().optional().or(z.literal("")),
  platform: z.enum(DOMESTIC_PLATFORMS).default("other"),
  title: z.string().trim().min(1, "상품명을 입력하세요."),
  priceKRW: z.coerce.number().int().nonnegative("가격은 0 이상이어야 합니다."),
  images: z.array(z.string().url()).min(1, "이미지 URL을 최소 1개 입력하세요."),
  description: z.string().trim().optional().default(""),
});
export type ManualListing = z.infer<typeof manualListingSchema>;

export const analyzeRequestSchema = z.union([
  z.object({ url: z.string().trim().url() }),
  z.object({ manual: manualListingSchema }),
]);
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

/* ------------------------------------------------------------------ */
/* Domain model                                                        */
/* ------------------------------------------------------------------ */

/** 국내 상품 페이지에서 추출한 원본 정보 */
export interface DomesticListing {
  url: string;
  platform: DomesticPlatform;
  images: string[];
  title: string;
  priceKRW: number;
  description: string;
}

/** AI 이미지 분석으로 추정한 제품 식별 정보 */
export interface ProductIdentity {
  /** 추정 제품명 (해외 검색용 영문/원어 우선) */
  name: string;
  /** 게임/음반/피규어 등 플랫폼·카테고리 (예: "Nintendo Switch", "PS5", "Vinyl") */
  platform: string;
  /** 지역판 (예: "일본판", "북미판", "아시아판", "유럽판") */
  region: string;
  /** 버전/에디션 (예: "일반판", "한정판", "스틸북") */
  version: string;
  /** 상태 (예: "미개봉", "중고A급", "박스 손상") */
  condition: string;
  /** 미개봉(실링) 여부 — 불확실하면 null */
  sealed: boolean | null;
  /** 박스 상태 설명 */
  boxState: string;
  /** 구성품 목록 */
  components: string[];
  /** 표지/커버 디자인 설명 (동일 제품 판별에 중요) */
  coverDesign: string;
  /** 지역 코드 (예: "CERO", "ESRB", "PEGI", 바코드 국가코드 등) */
  regionCode: string;
  /** 식별 정확도 0~100 */
  accuracy: number;
  /** 추가 확인이 필요한 사진 항목 */
  missingPhotos: string[];
  /** 배송비 추정용 카테고리 키 (shipping.CATEGORY_WEIGHT_G 참조) */
  categoryKey?: string;
  /** AI가 추정한 무게(g) — 없으면 categoryKey로 폴백 */
  weightGramsEst?: number;
}

/** 소스별 해외 검색어 */
export type SearchQueries = Record<string, string[]>;

/** 판매완료(sold) 거래 1건 */
export interface SoldListing {
  source: SoldSourceId;
  title: string;
  priceOriginal: number;
  currency: Currency;
  priceKRW: number;
  soldDate?: string;
  url: string;
  thumbnail?: string;
  /** 동일 제품 검증 통과 여부 */
  matched: boolean;
  /** 제목에서 분류한 상태 티어 (파이프라인에서 채움) */
  conditionTier?: ConditionTier;
}

/** 현재 판매중(active) 매물 1건 */
export interface ActiveListing {
  source: ActiveSourceId;
  title: string;
  priceOriginal: number;
  currency: Currency;
  priceKRW: number;
  /** 배송비 (KRW 환산) */
  shippingKRW: number;
  /** 배송비 포함 구매자 체감가 (KRW) */
  buyerPerceivedKRW: number;
  url: string;
  thumbnail?: string;
  matched: boolean;
  /** 제목에서 분류한 상태 티어 (파이프라인에서 채움) */
  conditionTier?: ConditionTier;
}

/** 티어별 시세 요약 */
export interface TierStat {
  conservative: number;
  base: number;
  aggressive: number;
  sampleN: number;
}

/** 판매완료 기준 시세 통계 */
export interface SoldStats {
  /** 보수 시세 (하위 구간) */
  conservative: number;
  /** 기준 시세 (중앙값) */
  base: number;
  /** 공격 시세 (상위 구간) */
  aggressive: number;
  /** 이상치 제거 후 표본 수 */
  sampleN: number;
  /** 이상치 제거 전 표본 수 */
  rawN: number;
  /** 소스별 대표가 (KRW) */
  bySource: Partial<Record<SoldSourceId, number>>;
  /** 상태 티어별 시세 (같은 티어끼리 비교용) */
  byTier: Partial<Record<ConditionTier, TierStat>>;
  /** 국내 상품 상태에 해당하는 대상 티어 */
  targetTier: ConditionTier;
}

/** 현재 판매중 경쟁가 통계 */
export interface ActiveStats {
  /** 최저 경쟁가 (KRW) */
  minCompetitor: number;
  /** 평균 경쟁가 (KRW) */
  avgCompetitor: number;
  /** 상위 가격대 (상위 25% 평균, KRW) */
  topTier: number;
  /** 배송 포함 구매자 체감가 평균 (KRW) */
  buyerPerceivedAvg: number;
  /** 현재 판매중 매물 수 */
  listingCount: number;
}

/** 판매가 제안 */
export interface PriceSuggestion {
  /** 빠른 판매가 */
  quick: number;
  /** 기준 판매가 */
  base: number;
  /** 고가 대기 판매가 */
  premium: number;
  /** 최종 추천 판매가 */
  finalRecommended: number;
  /** 추천 이유 */
  reason: string;
}

/** 실순이익 계산 내역 (모든 값 KRW) */
export interface ProfitBreakdown {
  expectedSalePriceKRW: number;
  sellingFee: number;
  paymentFee: number;
  intlShipping: number;
  packing: number;
  domesticShipping: number;
  fxRisk: number;
  claimRisk: number;
  domesticBuyPrice: number;
  netProfit: number;
  /** 수익률 (%) — netProfit / domesticBuyPrice */
  marginPct: number;
}

/** 시장별 순이익 (멀티마켓 비교용) */
export interface MarketProfit {
  market: MarketId;
  /** 이 시장의 판매완료 기준 예상 판매가 (KRW) */
  expectedSalePriceKRW: number;
  /** 이 시장 매칭 판매완료 표본 수 */
  sampleN: number;
  profit: ProfitBreakdown;
}

/** 판매 회전성(sell-through) */
export interface SellThrough {
  soldCount: number;
  activeCount: number;
  /** soldCount / (soldCount + activeCount) — 높을수록 잘 팔림 */
  ratio: number;
  /** 예상 회전 기간(일) — 추정, 데이터 부족 시 null */
  estTurnoverDays: number | null;
}

/** 매입 판단 */
export interface BuyDecision {
  currentDomesticPrice: number;
  /** 안전 매입가 (여유 있는 순이익 확보) */
  safeBuyPrice: number;
  /** 추천 최대 매입가 (목표 순이익/수익률 만족 상한) */
  recommendedMaxBuyPrice: number;
  /** 절대 비추천 매입가 (이 이상이면 손실 위험) */
  absoluteNoBuyPrice: number;
  netProfit: number;
  marginPct: number;
  sellDifficulty: SellDifficulty;
  finalStatement: string;
}

export interface RiskFlag {
  code: "IDENTITY_UNCERTAIN" | "SEALING_UNCERTAIN" | "HIGH_COMPETITION" | "LOSS_RISK" | "THIN_DATA";
  message: string;
}

/** 결론 (매입 판정 요약) */
export interface Verdict {
  status: VerdictStatus;
  riskFlags: RiskFlag[];
}

/** 파이프라인 최종 결과 — 6개 카드에 매핑 */
export interface AnalysisResult {
  listing: DomesticListing;
  identity: ProductIdentity;
  queries: SearchQueries;
  sold: {
    listings: SoldListing[];
    stats: SoldStats;
  };
  active: {
    listings: ActiveListing[];
    stats: ActiveStats;
  };
  suggestion: PriceSuggestion;
  profit: ProfitBreakdown;
  decision: BuyDecision;
  verdict: Verdict;
  /** 시장별 순이익 비교 (내림차순) + 최적 판매처 */
  markets: MarketProfit[];
  bestMarket: MarketId | null;
  /** 판매 회전성 */
  sellThrough: SellThrough;
  /** 추정 무게(g) */
  weightGrams: number;
  /** 동일 제품 매칭 신뢰도 0~100 (제품 식별 정확도 + 매칭 표본 지지도) */
  matchConfidence: number;
  /** 신뢰도가 낮아 사용자 확인이 필요한지 */
  needsUserConfirm: boolean;
  /** AI 분석이 저하 모드(제목 기반)로 동작했는지 */
  degraded: boolean;
  /** 소스별 수집 현황 (실데이터 경로에서만 채워짐; fixture/수동 경로는 빈 배열) */
  sourceStatus: SourceStatus[];
  /** 진단/경고 메시지 */
  notes: string[];
}

/** API 응답: 성공 또는 수동 입력 요청 */
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; needsManualInput: true; reason: string }
  | { ok: false; needsManualInput: false; error: string };
