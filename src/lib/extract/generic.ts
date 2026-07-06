import * as cheerio from "cheerio";

import type { DomesticListing, DomesticPlatform } from "@/lib/types";

export interface ParsedPage {
  title: string | null;
  priceKRW: number | null;
  images: string[];
  description: string | null;
}

/** "123,000원", "₩45000", "USD 12" 등에서 정수 금액을 뽑는다 */
export function parsePrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,]/g, " ");
  const match = cleaned.match(/[\d][\d,]*/);
  if (!match) return null;
  const n = Number.parseInt(match[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function collectJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // 무시
    }
  });
  return blocks;
}

function findProductNode(nodes: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const node of nodes) {
    const type = node["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return node;
    const graph = node["@graph"];
    if (Array.isArray(graph)) {
      const found = findProductNode(graph as Record<string, unknown>[]);
      if (found) return found;
    }
  }
  return null;
}

/** og 메타 + JSON-LD Product를 조합해 범용 파싱한다 */
export function parseGeneric(html: string): ParsedPage {
  const $ = cheerio.load(html);

  const og = (prop: string) => $(`meta[property="${prop}"]`).attr("content") ?? null;
  const meta = (name: string) => $(`meta[name="${name}"]`).attr("content") ?? null;

  const images = new Set<string>();
  for (const el of $('meta[property="og:image"]').toArray()) {
    const c = $(el).attr("content");
    if (c) images.add(c);
  }

  let title = og("og:title") ?? $("title").first().text().trim() ?? null;
  let priceKRW = parsePrice(og("product:price:amount") ?? meta("price"));
  let description = og("og:description") ?? meta("description");

  const product = findProductNode(collectJsonLd($));
  if (product) {
    if (typeof product.name === "string") title = product.name;
    if (typeof product.description === "string") description = product.description;
    const image = product.image;
    if (typeof image === "string") images.add(image);
    else if (Array.isArray(image)) for (const i of image) if (typeof i === "string") images.add(i);
    const offers = product.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && typeof offer.price !== "undefined") {
      priceKRW = parsePrice(String(offer.price)) ?? priceKRW;
    }
  }

  return {
    title: title?.trim() || null,
    priceKRW,
    images: [...images],
    description: description?.trim() || null,
  };
}

/** ParsedPage → DomesticListing (필수값 없으면 null) */
export function toListing(parsed: ParsedPage, url: string, platform: DomesticPlatform): DomesticListing | null {
  if (!parsed.title || parsed.images.length === 0) return null;
  return {
    url,
    platform,
    title: parsed.title,
    priceKRW: parsed.priceKRW ?? 0,
    images: parsed.images,
    description: parsed.description ?? "",
  };
}
