import { tokenize } from "@/lib/pipeline/filter";
import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

/**
 * AI 분석 실패 시 제목/설명 기반의 저하(degraded) 제품 식별.
 * 이미지 우선 원칙을 만족하지 못하므로 정확도를 낮게 잡고 추가 사진을 요청한다.
 */
export function fallbackIdentity(listing: DomesticListing): ProductIdentity {
  return {
    name: listing.title,
    platform: "미상",
    region: "미상",
    version: "미상",
    condition: /미개봉|새제품|new|sealed/i.test(listing.title) ? "미개봉(추정)" : "미상",
    sealed: null,
    boxState: "미상",
    components: [],
    coverDesign: "미상",
    regionCode: "미상",
    accuracy: 40,
    missingPhotos: ["대표 이미지 정면", "라벨/바코드 근접", "실링(밀봉) 상태", "구성품 전체"],
  };
}

const REGION_HINTS: Array<[RegExp, string]> = [
  [/일본|japan|jpn/i, "Japan"],
  [/북미|미국|usa?/i, "US"],
  [/유럽|europe|eu\b/i, "EU"],
  [/아시아|asia/i, "Asia"],
];

/** 식별 정보/제목으로 소스별 해외 검색어를 생성한다 (저하 및 정상 공통 유틸) */
export function fallbackQueries(identity: ProductIdentity, listing: DomesticListing): SearchQueries {
  const nameTokens = tokenize(identity.name.length > 1 ? identity.name : listing.title);
  const core = nameTokens.slice(0, 8).join(" ");

  const regionWords = new Set<string>();
  for (const [re, word] of REGION_HINTS) {
    if (re.test(`${identity.region} ${identity.regionCode} ${listing.title}`)) regionWords.add(word);
  }
  const regioned = regionWords.size > 0 ? `${core} ${[...regionWords].join(" ")}` : core;

  const platform = identity.platform !== "미상" ? identity.platform : "";

  return {
    ebay: [regioned, `${core} ${platform}`.trim()].filter(Boolean),
    mercari: [core, regioned].filter(Boolean),
    "yahoo-auction": [core, regioned].filter(Boolean),
    pricecharting: [`${core} ${platform}`.trim() || core],
  };
}
