import { toKRW } from "@/lib/config/fx";
import type { ActiveListing, Currency, SoldListing } from "@/lib/types";

export type Rates = Record<Currency, number>;

/** 판매완료 소스 공통 인터페이스 */
export interface SoldSource {
  id: string;
  fetchSold(query: string, rates: Rates): Promise<SoldListing[]>;
}

/** 판매중 소스 공통 인터페이스 */
export interface ActiveSource {
  id: string;
  fetchActive(query: string, rates: Rates): Promise<ActiveListing[]>;
}

/** 원본가+통화로 SoldListing 생성 (matched는 파이프라인에서 재판정) */
export function makeSold(
  input: Omit<SoldListing, "priceKRW" | "matched"> & { matched?: boolean },
  rates: Rates,
): SoldListing {
  return {
    ...input,
    priceKRW: toKRW(input.priceOriginal, input.currency, rates),
    matched: input.matched ?? false,
  };
}

/** 원본가+통화로 ActiveListing 생성 (배송비 포함 체감가 계산) */
export function makeActive(
  input: Omit<ActiveListing, "priceKRW" | "shippingKRW" | "buyerPerceivedKRW" | "matched"> & {
    shippingOriginal?: number;
    matched?: boolean;
  },
  rates: Rates,
): ActiveListing {
  const priceKRW = toKRW(input.priceOriginal, input.currency, rates);
  const shippingKRW = toKRW(input.shippingOriginal ?? 0, input.currency, rates);
  return {
    source: input.source,
    title: input.title,
    priceOriginal: input.priceOriginal,
    currency: input.currency,
    priceKRW,
    shippingKRW,
    buyerPerceivedKRW: priceKRW + shippingKRW,
    url: input.url,
    thumbnail: input.thumbnail,
    matched: input.matched ?? false,
  };
}

/** "$1,234.56", "￥12,300", "12300円" 등에서 숫자 추출 */
export function parseMoney(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[^\d.,]/g, " ").match(/[\d][\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
