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

/** 최종 매입 판정 */
export type VerdictStatus = "RECOMMEND" | "CONDITIONAL" | "HOLD" | "AVOID";

/** 판매 난이도 */
export type SellDifficulty = "LOW" | "MEDIUM" | "HIGH";

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
  /** AI 분석이 저하 모드(제목 기반)로 동작했는지 */
  degraded: boolean;
  /** 진단/경고 메시지 */
  notes: string[];
}

/** API 응답: 성공 또는 수동 입력 요청 */
export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; needsManualInput: true; reason: string }
  | { ok: false; needsManualInput: false; error: string };
