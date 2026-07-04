import type { Browser } from "playwright";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** 브라우저처럼 보이는 헤더로 HTML을 가져온다. 실패 시 throw. */
export async function fetchHtml(url: string, timeoutMs = 12_000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.text();
}

/**
 * 단축/추적 URL의 최종 목적지를 해석한다. 리다이렉트를 따라간 뒤 최종 URL을 반환하고,
 * 실패 시 원본 URL을 그대로 반환한다(저하 동작).
 */
export async function resolveFinalUrl(url: string, timeoutMs = 10_000): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": DESKTOP_UA, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

/** JSON API 호출. 실패 시 throw. */
export async function fetchJson<T = unknown>(url: string, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Playwright(Chromium)로 렌더링된 페이지의 HTML을 가져온다.
 * 환경에 사전 설치된 chromium을 사용하며, 브라우저 자체가 없으면 null을 반환한다(저하 동작).
 */
export async function withRenderedHtml<T>(url: string, fn: (html: string) => T, timeoutMs = 20_000): Promise<T | null> {
  let browser: Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      // 환경 변수(PLAYWRIGHT_BROWSERS_PATH)로 사전 설치 경로가 잡히므로 별도 지정 불필요.
    });
    const page = await browser.newPage({ userAgent: DESKTOP_UA, locale: "ko-KR" });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // SPA 렌더 대기 (짧게)
    await page.waitForTimeout(1_500);
    const html = await page.content();
    return fn(html);
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
