import type { Browser } from "playwright";

import { withTtlCache } from "@/lib/sources/cache";

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

export interface RenderOptions {
  timeoutMs?: number;
  /** 사이트 통화/언어에 영향을 주므로 소스별로 지정 (예: Mercari JP는 ja-JP여야 JPY 표시) */
  locale?: string;
  /** 초기 렌더 대기 (SPA 하이드레이션) */
  waitMs?: number;
  /** 지연 로딩 카드를 트리거하기 위한 스크롤 거리 (0이면 스크롤 없음) */
  scrollY?: number;
}

/** 기본 launch 실패 시(버전 불일치 등) 사전 설치된 chromium 바이너리로 재시도 */
async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("playwright");
  // 아웃바운드가 프록시 강제인 환경(샌드박스/사내망)에서는 브라우저에도 프록시를 물려준다
  const proxyServer = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const options: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  };
  try {
    // 환경 변수(PLAYWRIGHT_BROWSERS_PATH)로 사전 설치 경로가 잡히면 그대로 동작.
    return await chromium.launch(options);
  } catch (err) {
    const execPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
    const { existsSync } = await import("node:fs");
    if (!existsSync(execPath)) throw err;
    return chromium.launch({ ...options, executablePath: execPath });
  }
}

/**
 * Playwright(Chromium)로 렌더링된 페이지의 HTML을 가져온다.
 * 환경에 사전 설치된 chromium을 사용하며, 브라우저 자체가 없으면 null을 반환한다(저하 동작).
 */
export async function withRenderedHtml<T>(
  url: string,
  fn: (html: string) => T,
  { timeoutMs = 20_000, locale = "ko-KR", waitMs = 1_500, scrollY = 0 }: RenderOptions = {},
): Promise<T | null> {
  let browser: Browser | null = null;
  try {
    browser = await launchChromium();
    const page = await browser.newPage({ userAgent: DESKTOP_UA, locale });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(waitMs);
    if (scrollY > 0) {
      // 지연 로딩(이미지/카드)을 깨우고 잠깐 더 기다린다
      await page.evaluate((y) => window.scrollBy(0, y), scrollY).catch(() => undefined);
      await page.waitForTimeout(1_200);
    }
    const html = await page.content();
    return fn(html);
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* jina reader 프록시 — 봇 차단(eBay 403, Yahoo 등) 우회용             */
/* ------------------------------------------------------------------ */

const JINA_PREFIX = "https://r.jina.ai/";
const JINA_TIMEOUT_MS = 24_000;
/** 성공 응답 캐시 TTL. 분석→저장→수동 새로고침 주기 내 중복 프록시 호출을 흡수. */
const JINA_CACHE_TTL_MS = 5 * 60_000;

/**
 * r.jina.ai 리더 프록시로 페이지를 가져온다. 직접 fetch가 차단되는 사이트
 * (eBay/Yahoo Auction 등)의 우회 경로. 무료 티어는 레이트리밋/순간 빈응답이 잦아
 * 3회까지 백오프 재시도하고, 짧은 응답(<300자)은 실패로 간주한다.
 * 성공 응답은 짧게 캐싱해 레이트리밋 압박을 줄인다(실패는 캐싱하지 않음).
 *
 * @param format "markdown"(기본) 또는 "html"(원본 HTML → cheerio 파서 재사용 가능)
 */
export async function fetchViaJina(
  url: string,
  { format = "markdown", tries = 3 }: { format?: "markdown" | "html"; tries?: number } = {},
): Promise<string> {
  return withTtlCache(`jina|${format}|${url}`, JINA_CACHE_TTL_MS, () => fetchViaJinaUncached(url, format, tries));
}

async function fetchViaJinaUncached(url: string, format: "markdown" | "html", tries: number): Promise<string> {
  const headers: Record<string, string> = {
    "User-Agent": DESKTOP_UA,
    "Accept-Language": "ja,en;q=0.9,ko;q=0.8",
  };
  if (format === "html") headers["X-Return-Format"] = "html";
  // 키가 있으면 레이트리밋 완화 (없어도 무료 티어로 동작)
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;

  let lastErr = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const res = await fetch(JINA_PREFIX + url, { headers, signal: AbortSignal.timeout(JINA_TIMEOUT_MS) });
      const text = await res.text();
      if (res.ok && text.length >= 300) return text;
      lastErr = `status ${res.status} len ${text.length}`;
    } catch (e) {
      lastErr = String(e instanceof Error ? e.message : e).slice(0, 80);
    }
    if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
  }
  throw new Error(`jina fetch failed (${tries}x): ${lastErr}`);
}
