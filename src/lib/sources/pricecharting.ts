import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/extract/http";
import { makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { SoldListing } from "@/lib/types";

const MAX_PRODUCTS = 4;

/**
 * PriceCharting 기준 시세 (USD). 게임/카드/수집품의 loose/CIB/new 기준가를 제공한다.
 * 실제 낙찰 데이터의 요약 지표이므로 판매완료(sold) 기준으로 취급한다.
 *
 * 검색 결과 표(#games_table)의 각 행에서 상품별 loose/CIB/new 가격을 뽑아
 * 각각을 SoldListing으로 만든다(보수=loose, 기준=CIB, 공격=new 성격).
 */
export async function fetchPriceCharting(query: string, rates: Rates): Promise<SoldListing[]> {
  try {
    const url = `https://www.pricecharting.com/search-products?${new URLSearchParams({ q: query, type: "prices" })}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const out: SoldListing[] = [];

    const rows = $("#games_table tr[id^='product-'], table#games_table tbody tr").toArray().slice(0, MAX_PRODUCTS);
    for (const el of rows) {
      const row = $(el);
      const link = row.find("td.title a").first();
      const name = link.text().trim() || row.find("td.title").first().text().trim();
      if (!name) continue;
      const console = row.find("td.console").first().text().trim();
      const href = link.attr("href") || url;
      const label = console ? `${name} [${console}]` : name;

      const conditions: Array<[string, string]> = [
        ["loose", "td.used_price"],
        ["CIB", "td.cib_price"],
        ["new", "td.new_price"],
      ];
      for (const [cond, sel] of conditions) {
        const price = parseMoney(row.find(sel).first().text());
        if (price) {
          out.push(
            makeSold(
              {
                source: "pricecharting",
                title: `${label} (${cond})`,
                priceOriginal: price,
                currency: "USD",
                url: href,
              },
              rates,
            ),
          );
        }
      }
    }

    // 상세 페이지로 바로 리다이렉트된 경우 폴백 (#game_page 가격 블록)
    if (out.length === 0) {
      const title = $("#product_name, h1").first().text().trim() || query;
      const cells: Array<[string, string]> = [
        ["loose", "#used_price .price"],
        ["CIB", "#complete_price .price"],
        ["new", "#new_price .price"],
      ];
      for (const [cond, sel] of cells) {
        const price = parseMoney($(sel).first().text());
        if (price) {
          out.push(
            makeSold(
              { source: "pricecharting", title: `${title} (${cond})`, priceOriginal: price, currency: "USD", url },
              rates,
            ),
          );
        }
      }
    }

    return out;
  } catch {
    return [];
  }
}
