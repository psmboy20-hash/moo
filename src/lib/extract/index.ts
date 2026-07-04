import { extractBunjang } from "@/lib/extract/bunjang";
import { parseGeneric, toListing } from "@/lib/extract/generic";
import { fetchHtml, withRenderedHtml } from "@/lib/extract/http";
import { extractJoonggonara } from "@/lib/extract/joonggonara";
import { extractNaver } from "@/lib/extract/naver";
import type { DomesticListing, DomesticPlatform } from "@/lib/types";

/** URL 호스트로 국내 플랫폼을 식별한다 */
export function detectPlatform(url: string): DomesticPlatform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.includes("bunjang") || host.includes("bunjangapp")) return "bunjang";
  if (host.includes("cafe.naver")) return "joonggonara";
  if (host.includes("smartstore.naver") || host.includes("shopping.naver")) {
    return host.includes("smartstore") ? "smartstore" : "naver-shopping";
  }
  if (host.includes("brand.naver") || host.includes("naver.com")) return "naver-shopping";
  return "other";
}

/** 범용 폴백: 정적 fetch → 렌더링 순으로 og/JSON-LD 파싱 */
async function extractGenericAny(url: string): Promise<DomesticListing | null> {
  try {
    const html = await fetchHtml(url);
    const listing = toListing(parseGeneric(html), url, "other");
    if (listing) return listing;
  } catch {
    // 무시
  }
  return withRenderedHtml(url, (html) => toListing(parseGeneric(html), url, "other"));
}

/**
 * 국내 상품 링크에서 이미지·제목·가격·설명을 추출한다.
 * 어떤 경우에도 throw하지 않으며, 실패 시 null을 반환한다(→ 수동 입력 폴백).
 */
export async function extractListing(url: string): Promise<DomesticListing | null> {
  const platform = detectPlatform(url);
  try {
    switch (platform) {
      case "bunjang":
        return (await extractBunjang(url)) ?? (await extractGenericAny(url));
      case "joonggonara":
        return await extractJoonggonara(url);
      case "smartstore":
      case "naver-shopping":
        return (await extractNaver(url, platform)) ?? (await extractGenericAny(url));
      default:
        return await extractGenericAny(url);
    }
  } catch {
    return null;
  }
}
