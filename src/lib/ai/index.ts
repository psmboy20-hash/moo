import { analyzeImagesViaApi, generateSearchQueriesViaApi, hasAnthropicApiKey } from "@/lib/ai/anthropic-api";
import { analyzeImagesViaCli, generateSearchQueriesViaCli } from "@/lib/ai/claude-cli";
import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

/**
 * 3단계 폴백으로 상품 이미지를 분석한다:
 *   1) ANTHROPIC_API_KEY 있으면 Anthropic 비전 API (배포/서버리스에서 동작)
 *   2) 없거나 실패하면 로컬 claude CLI (CLI 있는 환경)
 *   3) 둘 다 실패하면 null → 호출부에서 제목 기반 저하 동작
 */
export async function analyzeImages(listing: DomesticListing): Promise<ProductIdentity | null> {
  if (hasAnthropicApiKey()) {
    const viaApi = await analyzeImagesViaApi(listing);
    if (viaApi) return viaApi;
  }
  return analyzeImagesViaCli(listing);
}

/** 해외 검색어 생성: API → CLI → null 폴백 */
export async function generateSearchQueries(identity: ProductIdentity): Promise<SearchQueries | null> {
  if (hasAnthropicApiKey()) {
    const viaApi = await generateSearchQueriesViaApi(identity);
    if (viaApi) return viaApi;
  }
  return generateSearchQueriesViaCli(identity);
}
