import { parseGeneric, toListing } from "@/lib/extract/generic";
import { fetchHtml, withRenderedHtml } from "@/lib/extract/http";
import type { DomesticListing, DomesticPlatform } from "@/lib/types";

/**
 * 스마트스토어 / 네이버쇼핑 추출.
 * 1차: 정적 HTML의 og 메타 + JSON-LD 시도.
 * 2차(SPA): Playwright 렌더링 후 재파싱.
 */
export async function extractNaver(url: string, platform: DomesticPlatform): Promise<DomesticListing | null> {
  // 1) 정적 fetch
  try {
    const html = await fetchHtml(url);
    const listing = toListing(parseGeneric(html), url, platform);
    if (listing) return listing;
  } catch {
    // 무시하고 렌더 폴백
  }

  // 2) 렌더링 폴백
  const rendered = await withRenderedHtml(url, (html) => toListing(parseGeneric(html), url, platform));
  return rendered ?? null;
}
