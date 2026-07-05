import { analyzeImagesViaApi, generateSearchQueriesViaApi, hasAnthropicApiKey } from "@/lib/ai/anthropic-api";
import { analyzeImagesViaCli, generateSearchQueriesViaCli } from "@/lib/ai/claude-cli";
import { getCached, setCached } from "@/lib/sources/cache";
import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

import { createHash } from "node:crypto";

/** 식별 결과 캐시 TTL. 같은 링크를 다시 분석해도 식별이 흔들리지 않게 30분 유지. */
const IDENTITY_TTL_MS = 30 * 60_000;

/** 상품 내용(제목+이미지) 기준의 안정적 캐시 키 — 가격 변동엔 영향받지 않는다. */
function identityKey(listing: DomesticListing): string {
  const sig = `${listing.title}\n${listing.images.join("\n")}`;
  return `identity|${createHash("sha1").update(sig).digest("hex")}`;
}

/**
 * 3단계 폴백으로 상품 이미지를 분석한다:
 *   1) ANTHROPIC_API_KEY 있으면 Anthropic 비전 API (배포/서버리스에서 동작)
 *   2) 없거나 실패하면 로컬 claude CLI (CLI 있는 환경)
 *   3) 둘 다 실패하면 null → 호출부에서 제목 기반 저하 동작
 *
 * 성공한 식별 결과는 상품 내용 기준으로 캐싱한다. AI는 호출마다 미세하게 다른
 * 식별명을 낼 수 있어 재분석·수동 새로고침 때 판정이 뒤집히는데, 캐시로 안정화한다.
 * (실패 결과는 캐싱하지 않아 일시적 오류가 저하 모드를 고정하지 않는다.)
 */
export async function analyzeImages(listing: DomesticListing): Promise<ProductIdentity | null> {
  const key = identityKey(listing);
  const cached = getCached<ProductIdentity>(key);
  if (cached) return cached;

  let identity: ProductIdentity | null = null;
  if (hasAnthropicApiKey()) {
    identity = await analyzeImagesViaApi(listing);
  }
  if (!identity) identity = await analyzeImagesViaCli(listing);

  if (identity) setCached(key, identity, IDENTITY_TTL_MS);
  return identity;
}

/** 해외 검색어 생성: API → CLI → null 폴백 */
export async function generateSearchQueries(identity: ProductIdentity): Promise<SearchQueries | null> {
  if (hasAnthropicApiKey()) {
    const viaApi = await generateSearchQueriesViaApi(identity);
    if (viaApi) return viaApi;
  }
  return generateSearchQueriesViaCli(identity);
}
