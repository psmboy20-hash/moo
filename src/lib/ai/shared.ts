import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

/** 텍스트에서 첫 번째 JSON 객체를 추출해 파싱한다 */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(v: unknown, fallback = "미상"): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

/** JSON 응답 → ProductIdentity (방어적 coercion). name이 비면 null. */
export function coerceIdentity(json: Record<string, unknown>): ProductIdentity | null {
  const acc = Number(json.accuracy);
  const name = str(json.name, "");
  if (!name) return null;
  return {
    name,
    platform: str(json.platform),
    region: str(json.region),
    version: str(json.version),
    condition: str(json.condition),
    sealed: json.sealed === true ? true : json.sealed === false ? false : null,
    boxState: str(json.boxState),
    components: strArray(json.components),
    coverDesign: str(json.coverDesign),
    regionCode: str(json.regionCode),
    accuracy: Number.isFinite(acc) ? Math.max(0, Math.min(100, acc)) : 50,
    missingPhotos: strArray(json.missingPhotos),
  };
}

/** JSON 응답 → SearchQueries. 비면 null. */
export function coerceQueries(json: Record<string, unknown>): SearchQueries | null {
  const out: SearchQueries = {};
  for (const [k, v] of Object.entries(json)) {
    const arr = strArray(v);
    if (arr.length > 0) out[k] = arr;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const IDENTITY_JSON_SHAPE =
  '{"name":string,"platform":string,"region":string,"version":string,"condition":string,"sealed":boolean|null,"boxState":string,"components":string[],"coverDesign":string,"regionCode":string,"accuracy":number(0-100),"missingPhotos":string[]}';

/** 이미지 분석 지시문 (이미지는 별도로 첨부/참조됨). 판매자 제목·설명은 힌트로만. */
export function identityInstruction(listing: DomesticListing): string {
  return `You are a reselling product identification expert. Identify the product PRIMARILY from the product images (the seller's title can be wrong; use it only as a hint).

Seller title (hint only): ${listing.title}
Seller description (hint only): ${listing.description?.slice(0, 500) ?? ""}

MOST IMPORTANT: READ the exact individual title/subtitle printed on the box/package/label (OCR, including Japanese text). The series name alone is NOT enough — e.g. not just "Dragon Ball Z" but the specific title like "Dragon Ball Z Super Gokuden Kakusei-hen". Same-series games/toys with different subtitles are DIFFERENT products.
Numbers in the seller's title may be the seller's own catalog numbers — IGNORE them unless clearly a product model number printed on the item.
If you cannot read the individual subtitle from the images, lower the accuracy score.

Analyze: product name (prefer the international/original-language name used on eBay/Mercari, including the individual subtitle), platform/category, region edition (일본판/북미판/아시아판/유럽판), version/edition, condition, whether factory-sealed, box state, included components, cover/artwork design, region code (CERO/ESRB/PEGI/barcode country), and which additional photos are needed to be sure.

Respond with ONLY a JSON object, no prose, matching exactly:
${IDENTITY_JSON_SHAPE}`;
}

export function queryInstruction(identity: ProductIdentity): string {
  return `You generate overseas marketplace search queries for reselling a Korean second-hand item abroad.

Identified product:
${JSON.stringify(identity)}

Rules per source:
- "ebay" / "pricecharting": ENGLISH queries — brand + series + INDIVIDUAL title/subtitle + platform. Japanese games use the commonly-used romanized title. Never include Korean words or seller catalog numbers.
- "mercari" / "yahoo-auction": JAPANESE queries (일본어 표기 필수 — these are Japanese marketplaces and Japanese buyers search in Japanese). Use the original Japanese product title when known.
Include region/edition keywords when relevant. Keep each query concise (what a buyer would actually type).

Respond with ONLY a JSON object:
{"ebay":string[],"mercari":string[],"yahoo-auction":string[],"pricecharting":string[]}`;
}
