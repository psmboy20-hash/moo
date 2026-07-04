import * as cheerio from "cheerio";

import { withRenderedHtml } from "@/lib/extract/http";
import { makeActive, makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { ActiveListing, SoldListing } from "@/lib/types";

const MAX_ITEMS = 30;

interface RawItem {
  title: string;
  price: number | null;
  url: string;
  thumbnail?: string;
}

function parseItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  $('li[data-testid="item-cell"], [data-testid="item-cell"], .merItemThumbnail').each((_, el) => {
    const node = $(el);
    const anchor = node.find("a").first();
    const url = anchor.attr("href") ?? "";
    const thumb = node.find("img").first();
    const title = (thumb.attr("alt") || node.find("[class*=itemName]").first().text() || "").trim();
    const price = parseMoney(
      node.find('[class*=merPrice], [class*=price], .number, [data-testid="price"]').first().text(),
    );
    if (title && price) {
      items.push({
        title,
        price,
        url: url.startsWith("http") ? url : `https://jp.mercari.com${url}`,
        thumbnail: thumb.attr("src"),
      });
    }
  });
  return items.slice(0, MAX_ITEMS);
}

function searchUrl(query: string, status: "sold_out" | "on_sale"): string {
  return `https://jp.mercari.com/search?${new URLSearchParams({ keyword: query, status })}`;
}

/** Mercari 판매완료(sold) — SPA라 렌더링 필요 */
export async function fetchMercariSold(query: string, rates: Rates): Promise<SoldListing[]> {
  const items = await withRenderedHtml(searchUrl(query, "sold_out"), parseItems);
  if (!items) return [];
  return items.map((it) =>
    makeSold(
      {
        source: "mercari",
        title: it.title,
        priceOriginal: it.price ?? 0,
        currency: "JPY",
        url: it.url,
        thumbnail: it.thumbnail,
      },
      rates,
    ),
  );
}

/** Mercari 현재 판매중(active) */
export async function fetchMercariActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  const items = await withRenderedHtml(searchUrl(query, "on_sale"), parseItems);
  if (!items) return [];
  return items.map((it) =>
    makeActive(
      {
        source: "mercari",
        title: it.title,
        priceOriginal: it.price ?? 0,
        currency: "JPY",
        url: it.url,
        thumbnail: it.thumbnail,
      },
      rates,
    ),
  );
}
