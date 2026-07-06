import { bunjangProductId, extractBunjang } from "@/lib/extract/bunjang";
import { parseGeneric, toListing } from "@/lib/extract/generic";
import { fetchHtml, resolveFinalUrl, withRenderedHtml } from "@/lib/extract/http";
import { extractJoonggonara } from "@/lib/extract/joonggonara";
import { extractNaver } from "@/lib/extract/naver";
import type { DomesticListing, DomesticPlatform } from "@/lib/types";

/** 단축/공유 링크 호스트: 최종 URL 해석이 필요하다 (번개장터 bgzt.link 등) */
const SHORTENER_HOSTS = ["bgzt.link", "bit.ly", "naver.me", "link.coupang", "vo.la", "abr.ge"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** URL 호스트로 국내 플랫폼을 식별한다 */
export function detectPlatform(url: string): DomesticPlatform {
  const host = hostOf(url);
  if (!host) return "other";
  if (host.includes("bunjang") || host.includes("bunjangapp") || host.includes("bgzt")) return "bunjang";
  if (host.includes("cafe.naver")) return "joonggonara";
  if (host.includes("smartstore.naver") || host.includes("shopping.naver")) {
    return host.includes("smartstore") ? "smartstore" : "naver-shopping";
  }
  if (host.includes("brand.naver") || host.includes("naver.com")) return "naver-shopping";
  return "other";
}

function needsResolve(url: string): boolean {
  const host = hostOf(url);
  // 단축 도메인이거나, 번개장터 도메인인데 상품 ID를 URL에서 찾을 수 없으면 리다이렉트 해석.
  if (SHORTENER_HOSTS.some((h) => host.includes(h))) return true;
  if (host.includes("bgzt")) return true;
  return false;
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
export async function extractListing(inputUrl: string): Promise<DomesticListing | null> {
  // 단축/공유 링크는 최종 상품 URL로 해석한다 (예: go.bgzt.link → m.bunjang.co.kr/products/<id>).
  const url = needsResolve(inputUrl) ? await resolveFinalUrl(inputUrl) : inputUrl;
  const platform = detectPlatform(url);
  try {
    switch (platform) {
      case "bunjang":
        // 상품 ID를 못 찾으면(예: 미해석 단축 링크) 범용 폴백으로 넘어간다.
        return bunjangProductId(url)
          ? ((await extractBunjang(url)) ?? (await extractGenericAny(url)))
          : await extractGenericAny(url);
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
