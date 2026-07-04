import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/extract/http";
import { makeActive, parseMoney, type Rates } from "@/lib/sources/types";
import type { ActiveListing } from "@/lib/types";

const MAX_ITEMS = 20;

/**
 * Buyee/FromJapan 등 해외 대행 쇼핑몰 판매가 (판매중, 참고용).
 * 셀렉터가 자주 바뀌므로 방어적으로 파싱하고 실패 시 []를 반환한다.
 */
async function scrapeMall(url: string, rates: Rates): Promise<ActiveListing[]> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items: ActiveListing[] = [];
    $("[class*=itemCard], [class*=item_card], li[class*=product], .g-item-list__item").each((_, el) => {
      const node = $(el);
      const title =
        node.find("[class*=name], [class*=title], img").first().attr("alt") ??
        node.find("[class*=name], [class*=title]").first().text().trim();
      const price = parseMoney(node.find("[class*=price], [class*=Price]").first().text());
      const href = node.find("a").first().attr("href") ?? "";
      const thumb = node.find("img").first().attr("src");
      if (title && price) {
        items.push(
          makeActive(
            {
              source: "overseas-mall",
              title,
              priceOriginal: price,
              currency: "JPY",
              url: href.startsWith("http") ? href : new URL(href || url, url).toString(),
              thumbnail: thumb,
            },
            rates,
          ),
        );
      }
    });
    return items.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export async function fetchBuyeeActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  return scrapeMall(`https://buyee.jp/item/search/query/${encodeURIComponent(query)}`, rates);
}

export async function fetchFromJapanActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  return scrapeMall(`https://www.fromjapan.co.jp/en/special/search/word/${encodeURIComponent(query)}`, rates);
}
