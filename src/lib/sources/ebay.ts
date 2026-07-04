import * as cheerio from "cheerio";

import { fetchHtml, fetchViaJina } from "@/lib/extract/http";
import { makeActive, makeSold, parseMoney, type Rates } from "@/lib/sources/types";
import type { ActiveListing, SoldListing } from "@/lib/types";

const MAX_ITEMS = 30;

/* ------------------------------------------------------------------ */
/* eBay Browse API (공식) — 키가 있으면 스크래핑 대신 이 경로를 쓴다     */
/*                                                                      */
/* developer.ebay.com 앱의 App ID(Client ID) + Cert ID(Client Secret)로  */
/* client_credentials OAuth 토큰을 받아 호출한다.                        */
/* ⚠️ Browse API는 "판매중(active)" 매물만 준다. 실제 sold 가격은        */
/*    Marketplace Insights API(별도 승인 필요)라 sold는 HTML 경로 유지.  */
/* ------------------------------------------------------------------ */

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const IMAGE_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search_by_image";
const OAUTH_SCOPE = "https://api.ebay.com/oauth/api_scope";

function ebayKeys(): { appId: string; certId: string } | null {
  const appId = process.env.EBAY_APP_ID?.trim();
  const certId = process.env.EBAY_CERT_ID?.trim();
  return appId && certId ? { appId, certId } : null;
}

export function hasEbayApi(): boolean {
  return ebayKeys() !== null;
}

function marketplaceId(): string {
  return process.env.EBAY_MARKETPLACE?.trim() || "EBAY_US";
}

/** 토큰 캐시 (만료 1분 전 갱신) */
let cachedToken = { value: "", exp: 0 };

async function getToken(): Promise<string> {
  const keys = ebayKeys();
  if (!keys) throw new Error("ebay keys missing");
  if (cachedToken.value && Date.now() < cachedToken.exp - 60_000) return cachedToken.value;

  const auth = Buffer.from(`${keys.appId}:${keys.certId}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(OAUTH_SCOPE)}`,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error(`ebay token ${res.status}`);
  cachedToken = { value: json.access_token, exp: Date.now() + (Number(json.expires_in) || 7_200) * 1_000 };
  return cachedToken.value;
}

interface BrowseItemSummary {
  title?: string;
  price?: { value?: string; currency?: string };
  currentBidPrice?: { value?: string; currency?: string };
  shippingOptions?: Array<{ shippingCost?: { value?: string; currency?: string } }>;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: Array<{ imageUrl?: string }>;
}

interface RawItem {
  title: string;
  price: number | null;
  shipping: number | null;
  url: string;
  thumbnail?: string;
}

/** Browse API itemSummaries → 표준 RawItem (USD 가격 있는 항목만) */
function mapBrowseItems(summaries: BrowseItemSummary[] = []): RawItem[] {
  return summaries
    .map((it) => {
      const price = Number(it.price?.value) || Number(it.currentBidPrice?.value) || 0;
      const currency = it.price?.currency || it.currentBidPrice?.currency || "USD";
      const shipping = Number(it.shippingOptions?.[0]?.shippingCost?.value) || 0;
      return {
        title: it.title ?? "",
        price,
        shipping,
        url: it.itemWebUrl ?? "",
        thumbnail: it.image?.imageUrl || it.thumbnailImages?.[0]?.imageUrl,
        currency,
      };
    })
    .filter((it) => it.price > 0 && it.url && it.currency === "USD")
    .slice(0, MAX_ITEMS);
}

/** Browse API 텍스트 검색 (판매중). 실패 시 throw → 호출부에서 스크랩 폴백. */
async function browseSearch(query: string): Promise<RawItem[]> {
  const token = await getToken();
  const url = `${BROWSE_URL}?q=${encodeURIComponent(query)}&limit=${MAX_ITEMS}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId(),
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    itemSummaries?: BrowseItemSummary[];
    errors?: Array<{ message?: string }>;
  };
  if (json.errors?.length) throw new Error(json.errors[0]?.message || "ebay browse error");
  return mapBrowseItems(json.itemSummaries);
}

/** 이미지 URL → base64 (search_by_image 요청 본문용) */
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const s = imageUrl.trim();
  if (/^data:image\//i.test(s)) return s.replace(/^data:image\/[^;]+;base64,/i, "");
  const res = await fetch(s, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

/**
 * eBay 이미지 검색(구글렌즈식 시각 매칭) — 사진 한 장으로 같은/비슷한 제품의
 * 해외 판매중 매물을 찾는다. 제목이 부실한 토이/피규어 매칭 정확도를 크게 올린다.
 * 키 없음/실패 시 빈 배열.
 */
export async function fetchEbayActiveByImage(imageUrl: string, rates: Rates): Promise<ActiveListing[]> {
  if (!hasEbayApi() || !imageUrl) return [];
  try {
    const [token, b64] = await Promise.all([getToken(), imageUrlToBase64(imageUrl)]);
    const res = await fetch(`${IMAGE_SEARCH_URL}?limit=${MAX_ITEMS}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image: b64 }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      itemSummaries?: BrowseItemSummary[];
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) return [];
    return mapBrowseItems(json.itemSummaries).map((it) => toActive(it, rates));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* HTML 스크랩 경로 — API 키가 없거나(active) sold 시세용                */
/* 직접 fetch가 403 등으로 차단되면 jina reader 프록시(HTML 모드) 폴백   */
/* ------------------------------------------------------------------ */

function searchUrl(query: string, sold: boolean): string {
  const params = new URLSearchParams({ _nkw: query, _ipg: "60" });
  if (sold) {
    params.set("LH_Sold", "1");
    params.set("LH_Complete", "1");
  }
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
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

/** 직접 fetch → 차단/빈 결과면 jina 프록시로 재시도 */
async function scrapeSearch(url: string): Promise<RawItem[]> {
  try {
    const items = parseItems(await fetchHtml(url));
    if (items.length > 0) return items;
  } catch {
    // 차단(403 등) → 프록시 폴백
  }
  return parseItems(await fetchViaJina(url, { format: "html" }));
}

function toActive(it: RawItem, rates: Rates): ActiveListing {
  return makeActive(
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
  );
}

/** eBay 판매완료(Sold) 시세 — HTML 스크랩 + jina 폴백 (Browse API는 sold 미지원) */
export async function fetchEbaySold(query: string, rates: Rates): Promise<SoldListing[]> {
  try {
    const items = await scrapeSearch(searchUrl(query, true));
    return items.map((it) =>
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

/** eBay 현재 판매중 매물 — 키 있으면 Browse API(공식), 실패/키 없음이면 스크랩+jina */
export async function fetchEbayActive(query: string, rates: Rates): Promise<ActiveListing[]> {
  if (hasEbayApi()) {
    try {
      const items = await browseSearch(query);
      if (items.length > 0) return items.map((it) => toActive(it, rates));
    } catch {
      // API 실패(권한/쿼터 등) → 스크랩 폴백
    }
  }
  try {
    const items = await scrapeSearch(searchUrl(query, false));
    return items.map((it) => toActive(it, rates));
  } catch {
    return [];
  }
}
