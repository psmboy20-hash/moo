import type { Currency } from "@/lib/types";

/** 라이브 조회 실패 시 사용하는 폴백 환율 (KRW 기준) */
export const FALLBACK_RATES: Record<Currency, number> = {
  KRW: 1,
  USD: 1_380,
  JPY: 9.2,
};

interface RateCache {
  rates: Record<Currency, number>;
  fetchedAt: number;
}

let cache: RateCache | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

/**
 * KRW 기준 환율을 조회한다. 공개 API 조회 실패 시 폴백 상수를 사용한다.
 * exchangerate.host(무료, 키 불필요)를 사용하되, 프록시/차단 환경에서는 폴백으로 저하 동작.
 */
export async function getRates(): Promise<Record<Currency, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rates;
  }

  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=KRW&symbols=USD,JPY", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`fx http ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number; JPY?: number } };
    const usdPerKrw = data.rates?.USD;
    const jpyPerKrw = data.rates?.JPY;
    if (!usdPerKrw || !jpyPerKrw) throw new Error("fx missing symbols");

    const rates: Record<Currency, number> = {
      KRW: 1,
      USD: 1 / usdPerKrw,
      JPY: 1 / jpyPerKrw,
    };
    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}

/** 단일 금액을 KRW로 환산 (라운딩) */
export function toKRW(amount: number, currency: Currency, rates: Record<Currency, number>): number {
  return Math.round(amount * (rates[currency] ?? FALLBACK_RATES[currency]));
}
