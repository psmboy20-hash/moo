import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/extract/http";
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
  $("li.Product, .Product").each((_, el) => {
    const node = $(el);
    const title = node.find(".Product__title, .Product__titleLink").first().text().trim();
    const price = parseMoney(node.find(".Product__priceValue, .Product__price").first().text());
    const url = node.find("a.Product__titleLink, a").first().attr("href") ?? "";
    const thumbnail = node.find("img").first().attr("src");
    if (title && price && url) items.push({ title, price, url, thumbnail });
  });
  return items.slice(0, MAX_ITEMS);
}

/** Yahoo Auction 낙찰가 (판매완료) */
export async function fetchYahooSold(query: string, rates: Rates): Promise<SoldListing[]> {
  try {
    const url = `https://auctions.yahoo.co.jp/closedsearch/closedsearch?${new URLSearchParams({ p: query })}`;
    const html = await fetchHtml(url);
    return parseItems(html).map((it) =>
      makeSold(
        {
          source: "yahoo-auction",
          title: it.title,
          priceOriginal: it.price ?? 0,
          currency: "JPY",
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

/** Yahoo Auction 진행 중 매물 (판매중) */
export async function fetchYahooActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  try {
    const url = `https://auctions.yahoo.co.jp/search/search?${new URLSearchParams({ p: query })}`;
    const html = await fetchHtml(url);
    return parseItems(html).map((it) =>
      makeActive(
        {
          source: "yahoo-auction",
          title: it.title,
          priceOriginal: it.price ?? 0,
          currency: "JPY",
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
