import * as cheerio from "cheerio";

import { fetchHtml, fetchViaJina, withRenderedHtml } from "@/lib/extract/http";
import { makeActive, makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { ActiveListing, SoldListing } from "@/lib/types";

const MAX_ITEMS = 30;

interface RawItem {
  title: string;
  price: number | null;
  url: string;
  thumbnail?: string;
  soldDate?: string;
}

/* ------------------------------------------------------------------ */
/* 판매완료(낙찰) — closedsearch를 jina reader 마크다운으로 파싱          */
/*                                                                      */
/* 야후옥션 落札(낙찰)가는 일본 빈티지 완구/게임의 가장 정확한 "실제 팔린 */
/* 가격" 소스다. closedsearch 페이지는 직접 fetch가 자주 차단/난독화되어  */
/* jina reader(r.jina.ai) 마크다운에서 落札가/타이틀/이미지/종료일을      */
/* 파싱하는 방식이 안정적이다.                                           */
/* ------------------------------------------------------------------ */

/** jina 마크다운 1페이지 → 낙찰 아이템 배열 */
function parseClosedMarkdown(md: string): RawItem[] {
  const lines = md.split("\n");
  const items: RawItem[] = [];
  let lastImage = "";
  for (let i = 0; i < lines.length; i += 1) {
    // 이미지 라인: [![Image N: title](imgUrl)
    const im = lines[i].match(/!\[Image\s*\d+:[^\]]*\]\((https:\/\/[^\s)]+)\)/);
    if (im) {
      lastImage = im[1];
      continue;
    }
    // 타이틀 링크: [TITLE](https://auctions.yahoo.co.jp/jp/auction/ID ...)
    const tm = lines[i].match(/^\[([^\]]{4,})\]\((https:\/\/auctions\.yahoo\.co\.jp\/jp\/auction\/[^\s)"]+)/);
    if (!tm) continue;
    const title = tm[1].replace(/\s+/g, " ").trim();
    const url = tm[2];
    let priceYen = 0;
    let soldDate = "";
    // 타이틀 다음 몇 줄 안에서 落札가(=실제 낙찰가)와 종료일을 찾는다
    for (let j = i + 1; j < Math.min(i + 7, lines.length); j += 1) {
      const pm = lines[j].match(/落札\s*([\d,]+)\s*円/);
      if (pm && !priceYen) priceYen = Number(pm[1].replace(/,/g, ""));
      const dm = lines[j].match(/(\d{1,2}\/\d{1,2})\s+\d{1,2}:\d{2}\s*終了/);
      if (dm) soldDate = dm[1];
    }
    if (priceYen > 0) {
      items.push({ title, url, thumbnail: lastImage || undefined, price: priceYen, soldDate });
      lastImage = "";
    }
  }
  return items.slice(0, MAX_ITEMS);
}

/* ------------------------------------------------------------------ */
/* HTML 파서 — 클래스 기반(li.Product) + 구조 기반(auction 링크) 폴백    */
/* ------------------------------------------------------------------ */

function parseHtmlItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];

  // 1차: 종전 클래스 기반 셀렉터
  $("li.Product, .Product").each((_, el) => {
    const node = $(el);
    const title = node.find(".Product__title, .Product__titleLink").first().text().trim();
    const price = parseMoney(node.find(".Product__priceValue, .Product__price").first().text());
    const url = node.find("a.Product__titleLink, a").first().attr("href") ?? "";
    const thumbnail = node.find("img").first().attr("src");
    if (title && price && url) items.push({ title, price, url, thumbnail });
  });
  if (items.length > 0) return items.slice(0, MAX_ITEMS);

  // 2차: 클래스가 바뀌어도 살아남는 구조 기반 — /jp/auction/ 링크를 경매 ID로 묶는다
  const byId = new Map<string, RawItem>();
  $('a[href*="/jp/auction/"]').each((_, el) => {
    const a = $(el);
    const href = a.attr("href") ?? "";
    const id = href.match(/auction\/([a-zA-Z]\d+)/)?.[1];
    if (!id) return;
    const rec = byId.get(id) ?? { title: "", price: null, url: href.split("?")[0], thumbnail: undefined };
    const text = a.text().replace(/\s+/g, " ").trim();
    if (text.length > rec.title.length) rec.title = text;
    const container = a.closest("li").length ? a.closest("li") : a.parent();
    if (!rec.thumbnail) {
      const src = container.find("img").first().attr("src");
      if (src && /^https?:/.test(src)) rec.thumbnail = src;
    }
    if (!rec.price) {
      const pm = container.text().match(/([0-9,]+)\s*円/);
      if (pm) rec.price = Number(pm[1].replace(/,/g, "")) || null;
    }
    byId.set(id, rec);
  });
  return [...byId.values()].filter((it) => it.title && it.price).slice(0, MAX_ITEMS);
}

/** Yahoo Auction 낙찰가 (판매완료) — jina 마크다운 우선, 직접 HTML 폴백 */
export async function fetchYahooSold(query: string, rates: Rates): Promise<SoldListing[]> {
  const url = `https://auctions.yahoo.co.jp/closedsearch/closedsearch?${new URLSearchParams({ p: query, n: String(MAX_ITEMS) })}`;
  let items: RawItem[] = [];
  try {
    items = parseClosedMarkdown(await fetchViaJina(url));
  } catch {
    // jina 실패 → 직접 fetch 시도 (차단될 수 있음)
    try {
      items = parseHtmlItems(await fetchHtml(url));
    } catch {
      return [];
    }
  }
  return items.map((it) =>
    makeSold(
      {
        source: "yahoo-auction",
        title: it.title,
        priceOriginal: it.price ?? 0,
        currency: "JPY",
        url: it.url,
        thumbnail: it.thumbnail,
        soldDate: it.soldDate || undefined,
      },
      rates,
    ),
  );
}

/** Yahoo Auction 진행 중 매물 (판매중) — 렌더링 파싱 우선, 직접 HTML 폴백 */
export async function fetchYahooActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  const url = `https://auctions.yahoo.co.jp/search/search?${new URLSearchParams({ p: query })}`;
  let items = await withRenderedHtml(url, parseHtmlItems, { locale: "ja-JP", waitMs: 2_000 });
  if (!items || items.length === 0) {
    try {
      items = parseHtmlItems(await fetchHtml(url));
    } catch {
      return [];
    }
  }
  return items.map((it) =>
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
}
