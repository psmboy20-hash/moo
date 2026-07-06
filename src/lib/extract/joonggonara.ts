import { parseGeneric, toListing } from "@/lib/extract/generic";
import { fetchHtml, withRenderedHtml } from "@/lib/extract/http";
import type { DomesticListing } from "@/lib/types";

/**
 * 중고나라(cafe.naver.com) 추출.
 * 카페 글은 로그인/동적 렌더가 많아 성공률이 낮다. 실패 시 null → 수동 입력 폴백.
 */
export async function extractJoonggonara(url: string): Promise<DomesticListing | null> {
  try {
    const html = await fetchHtml(url);
    const listing = toListing(parseGeneric(html), url, "joonggonara");
    if (listing) return listing;
  } catch {
    // 무시
  }

  const rendered = await withRenderedHtml(url, (html) => toListing(parseGeneric(html), url, "joonggonara"));
  return rendered ?? null;
}
