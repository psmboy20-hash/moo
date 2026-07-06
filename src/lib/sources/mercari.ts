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

/**
 * Mercari JP 검색 결과 파싱. SPA지만 Cloudflare가 없어 headless 렌더링으로 충분하다.
 * - 제목은 카드 텍스트가 아니라 img alt에서 얻는 게 안정적 ("...のサムネイル" 접미사 제거)
 * - 아이템 ID(/item/mXXXX)로 중복 카드를 제거
 * - ja-JP 로케일로 렌더해야 가격이 JPY(円)로 표시된다 (ko 로케일이면 KRW 환산가가 섞임)
 */
function parseItems(html: string): RawItem[] {
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  const seen = new Set<string>();
  $('li[data-testid="item-cell"], [data-testid="item-cell"], .merItemThumbnail').each((_, el) => {
    const node = $(el);
    const anchor = node.find('a[href*="/item/"]').length
      ? node.find('a[href*="/item/"]').first()
      : node.find("a").first();
    const href = (anchor.attr("href") ?? "").split("?")[0];
    const id = href.match(/\/item\/([a-zA-Z0-9]+)/)?.[1];
    if (!id || seen.has(id)) return;
    const thumb = node.find("img").first();
    const title = (
      (thumb.attr("alt") ?? "").replace(/のサムネイル$|のサムネ$/, "").trim() ||
      node.find("[class*=itemName]").first().text()
    ).trim();
    // 円 표기 우선, 없으면 가격 클래스에서 추출
    const yenMatch = node.text().match(/(?:¥|￥)\s*([0-9,]+)|([0-9,]+)\s*円/);
    const price = yenMatch
      ? Number((yenMatch[1] || yenMatch[2]).replace(/,/g, "")) || null
      : parseMoney(node.find('[class*=merPrice], [class*=price], .number, [data-testid="price"]').first().text());
    if (title && price) {
      seen.add(id);
      items.push({
        title,
        price,
        url: href.startsWith("http") ? href : `https://jp.mercari.com${href}`,
        thumbnail: thumb.attr("src"),
      });
    }
  });
  return items.slice(0, MAX_ITEMS);
}

function searchUrl(query: string, status: "sold_out" | "on_sale"): string {
  return `https://jp.mercari.com/search?${new URLSearchParams({ keyword: query, status })}`;
}

/** 하이드레이션 대기 + 스크롤로 지연 로딩 카드까지 확보 */
function render(url: string): Promise<RawItem[] | null> {
  return withRenderedHtml(url, parseItems, { locale: "ja-JP", waitMs: 3_500, scrollY: 1_600, timeoutMs: 45_000 });
}

/** Mercari 판매완료(sold) — SPA라 렌더링 필요 */
export async function fetchMercariSold(query: string, rates: Rates): Promise<SoldListing[]> {
  const items = await render(searchUrl(query, "sold_out"));
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
  const items = await render(searchUrl(query, "on_sale"));
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
