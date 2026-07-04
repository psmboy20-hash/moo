import { fetchJson } from "@/lib/extract/http";
import type { DomesticListing } from "@/lib/types";

interface BunjangDetail {
  data?: {
    product?: {
      name?: string;
      price?: number | string;
      description?: string;
      imageCount?: number;
      // 예: https://media.bunjang.co.kr/product/<id>_{cnt}_<ts>_w{res}.jpg
      imageUrl?: string;
    };
  };
}

/** 이미지 해상도 (번개장터 CDN이 지원하는 폭) */
const IMAGE_RES = "640";

export function bunjangProductId(url: string): string | null {
  // https://m.bunjang.co.kr/products/123456789 또는 /products/123456789?...
  const m = url.match(/products?\/(\d+)/);
  return m ? m[1] : null;
}

function buildImageUrls(template: string, count: number): string[] {
  // 번개장터 이미지 인덱스는 1부터 시작한다 (1..imageCount).
  const n = Math.min(Math.max(count, 1), 12);
  const urls: string[] = [];
  for (let i = 1; i <= n; i++) {
    urls.push(template.replaceAll("{cnt}", String(i)).replaceAll("{res}", IMAGE_RES));
  }
  return urls;
}

/** 번개장터 상품 상세 JSON API(pms v3)로 추출 */
export async function extractBunjang(url: string): Promise<DomesticListing | null> {
  const id = bunjangProductId(url);
  if (!id) return null;

  try {
    const data = await fetchJson<BunjangDetail>(
      `https://api.bunjang.co.kr/api/pms/v3/products-detail/${id}?viewerUid=-1`,
    );
    const p = data.data?.product;
    if (!p?.name) return null;

    const price = typeof p.price === "string" ? Number.parseInt(p.price, 10) : (p.price ?? 0);
    const images = p.imageUrl ? buildImageUrls(p.imageUrl, p.imageCount ?? 1) : [];
    if (images.length === 0) return null;

    return {
      url,
      platform: "bunjang",
      title: p.name,
      priceKRW: Number.isFinite(price) ? price : 0,
      images,
      description: p.description ?? "",
    };
  } catch {
    return null;
  }
}
