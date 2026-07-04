import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/extract/http";
import { makeActive, makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { ActiveListing, SoldListing } from "@/lib/types";

const MAX_ITEMS = 30;

function searchUrl(query: string, sold: boolean): string {
  const params = new URLSearchParams({ _nkw: query, _ipg: "60" });
  if (sold) {
    params.set("LH_Sold", "1");
    params.set("LH_Complete", "1");
  }
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

interface RawItem {
  title: string;
  price: number | null;
  shipping: number | null;
  url: string;
  thumbnail?: string;
}

function parseItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  $(".s-item, .su-card-container").each((_, el) => {
    const node = $(el);
    const title = node.find(".s-item__title, .su-card-container__header").first().text().trim();
    if (!title || /shop on ebay/i.test(title)) return;
    const price = parseMoney(node.find(".s-item__price").first().text());
    const shipping = parseMoney(node.find(".s-item__shipping, .s-item__logisticsCost").first().text());
    const url = node.find("a.s-item__link, a").first().attr("href") ?? "";
    const thumbnail = node.find(".s-item__image-wrapper img, img").first().attr("src");
    if (price && url) items.push({ title, price, shipping, url, thumbnail });
  });
  return items.slice(0, MAX_ITEMS);
}

/** eBay 판매완료(Sold) 시세 */
export async function fetchEbaySold(query: string, rates: Rates): Promise<SoldListing[]> {
  try {
    const html = await fetchHtml(searchUrl(query, true));
    return parseItems(html).map((it) =>
      makeSold(
        {
          source: "ebay",
          title: it.title,
          priceOriginal: it.price ?? 0,
          currency: "USD",
          url: it.url,
          thumbnail: it.thumbnail,
        },
        rates,
      ),
    );
  } catch {
    return [];
  }
}

/** eBay 현재 판매중 매물 */
export async function fetchEbayActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  try {
    const html = await fetchHtml(searchUrl(query, false));
    return parseItems(html).map((it) =>
      makeActive(
        {
          source: "ebay",
          title: it.title,
          priceOriginal: it.price ?? 0,
          shippingOriginal: it.shipping ?? 0,
          currency: "USD",
          url: it.url,
          thumbnail: it.thumbnail,
        },
        rates,
      ),
    );
  } catch {
    return [];
  }
}
