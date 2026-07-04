import * as cheerio from "cheerio";

import { fetchHtml } from "@/lib/extract/http";
import { makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { SoldListing } from "@/lib/types";

/**
 * PriceCharting 기준 시세 (USD). 게임/수집품의 loose/CIB/new 기준가를 제공한다.
 * 실제 낙찰 데이터의 요약 지표이므로 판매완료(sold) 기준으로 취급한다.
 */
export async function fetchPriceCharting(query: string, rates: Rates): Promise<SoldListing[]> {
  try {
    const url = `https://www.pricecharting.com/search-products?${new URLSearchParams({ q: query, type: "prices" })}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const out: SoldListing[] = [];
    // 상세 페이지로 리다이렉트된 경우: #price_data 표
    const title = $("#product_name, h1").first().text().trim() || query;

    const priceCells: Array<[string, string]> = [
      ["loose", "#used_price .price, #complete_price .price"],
      ["cib", "#complete_price .price"],
      ["new", "#new_price .price"],
    ];
    for (const [label, sel] of priceCells) {
      const price = parseMoney($(sel).first().text());
      if (price) {
        out.push(
          makeSold(
            {
              source: "pricecharting",
              title: `${title} (${label})`,
              priceOriginal: price,
              currency: "USD",
              url,
            },
            rates,
          ),
        );
      }
    }

    // 검색 결과 표(여러 상품)인 경우: 첫 행들의 CIB 가격
    if (out.length === 0) {
      $("table#games_table tbody tr, table.hoverable tbody tr")
        .slice(0, 5)
        .each((_, el) => {
          const row = $(el);
          const name = row.find("td.title, td:first-child").first().text().trim();
          const price = parseMoney(row.find("td.price, td.numeric").first().text());
          if (name && price) {
            out.push(
              makeSold({ source: "pricecharting", title: name, priceOriginal: price, currency: "USD", url }, rates),
            );
          }
        });
    }

    return out;
  } catch {
    return [];
  }
}
