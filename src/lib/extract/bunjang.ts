import { fetchJson } from "@/lib/extract/http";
import type { DomesticListing } from "@/lib/types";

interface BunjangDetail {
  data?: {
    product?: {
      name?: string;
      price?: number | string;
      description?: string;
      imageCount?: number;
      imageUrl?: string; // 예: https://media.bunjang.co.kr/product/<id>_{cnt}_{res}.jpg
    };
  };
}

function productIdFromUrl(url: string): string | null {
  // https://m.bunjang.co.kr/products/123456789 또는 /products/123456789?...
  const m = url.match(/products\/(\d+)/);
  return m ? m[1] : null;
}

function buildImageUrls(template: string, count: number): string[] {
  const n = Math.min(Math.max(count, 1), 12);
  const urls: string[] = [];
  for (let i = 0; i < n; i++) {
    urls.push(template.replace("{cnt}", String(i)).replace("{res}", "web"));
  }
  return urls;
}

/** 번개장터 상품 상세 JSON API로 추출 */
export async function extractBunjang(url: string): Promise<DomesticListing | null> {
  const id = productIdFromUrl(url);
  if (!id) return null;

  try {
    const data = await fetchJson<BunjangDetail>(`https://api.bunjang.co.kr/api/1/product/${id}/detail?viewerUid=-1`);
    const p = data.data?.product;
    if (!p?.name) return null;

    const price = typeof p.price === "string" ? Number.parseInt(p.price, 10) : (p.price ?? 0);
    const images =
      p.imageUrl && p.imageCount
        ? buildImageUrls(p.imageUrl, p.imageCount)
        : p.imageUrl
          ? [p.imageUrl.replace("{cnt}", "0").replace("{res}", "web")]
          : [];

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
