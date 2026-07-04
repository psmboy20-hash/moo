import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CLI = process.env.CLAUDE_CLI_PATH || "claude";
const CLI_TIMEOUT_MS = 90_000;
const MAX_BUFFER = 8 * 1024 * 1024;
const MAX_IMAGES = 4;

/** Claude CLI를 print 모드로 호출하고 결과 텍스트를 반환한다 */
async function runClaude(prompt: string): Promise<string> {
  const { stdout } = await execFileAsync(CLI, ["-p", prompt, "--output-format", "json", "--allowedTools", "Read"], {
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  // --output-format json 은 {type:"result", result:"<text>", ...} 형태
  try {
    const env = JSON.parse(stdout) as { result?: string };
    return typeof env.result === "string" ? env.result : stdout;
  } catch {
    return stdout;
  }
}

/** 텍스트에서 첫 번째 JSON 객체를 추출해 파싱한다 */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function downloadImages(urls: string[]): Promise<{ dir: string; paths: string[] } | null> {
  const chosen = urls.slice(0, MAX_IMAGES);
  if (chosen.length === 0) return null;
  const dir = await mkdtemp(join(tmpdir(), "resell-img-"));
  const paths: string[] = [];
  for (let i = 0; i < chosen.length; i++) {
    try {
      const res = await fetch(chosen[i], { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = res.headers.get("content-type")?.includes("png") ? "png" : "jpg";
      const p = join(dir, `img_${i}.${ext}`);
      await writeFile(p, buf);
      paths.push(p);
    } catch {
      // 개별 이미지 실패는 무시
    }
  }
  if (paths.length === 0) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    return null;
  }
  return { dir, paths };
}

function str(v: unknown, fallback = "미상"): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}

function coerceIdentity(json: Record<string, unknown>): ProductIdentity {
  const acc = Number(json.accuracy);
  return {
    name: str(json.name, ""),
    platform: str(json.platform),
    region: str(json.region),
    version: str(json.version),
    condition: str(json.condition),
    sealed: json.sealed === true ? true : json.sealed === false ? false : null,
    boxState: str(json.boxState),
    components: strArray(json.components),
    coverDesign: str(json.coverDesign),
    regionCode: str(json.regionCode),
    accuracy: Number.isFinite(acc) ? Math.max(0, Math.min(100, acc)) : 50,
    missingPhotos: strArray(json.missingPhotos),
  };
}

const IDENTITY_PROMPT = (
  paths: string[],
  listing: DomesticListing,
) => `You are a reselling product identification expert. Read the product images with the Read tool at these absolute paths and identify the product PRIMARILY from the images (the seller's title can be wrong; use it only as a hint).

Images:
${paths.map((p) => `- ${p}`).join("\n")}

Seller title (hint only): ${listing.title}
Seller description (hint only): ${listing.description?.slice(0, 500) ?? ""}

Analyze: product name (prefer the international/original-language name used on eBay/Mercari), platform/category, region edition (일본판/북미판/아시아판/유럽판), version/edition, condition, whether factory-sealed, box state, included components, cover/artwork design, region code (CERO/ESRB/PEGI/barcode country), and which additional photos are needed to be sure.

Respond with ONLY a JSON object, no prose, matching exactly:
{"name":string,"platform":string,"region":string,"version":string,"condition":string,"sealed":boolean|null,"boxState":string,"components":string[],"coverDesign":string,"regionCode":string,"accuracy":number(0-100),"missingPhotos":string[]}`;

/**
 * Claude CLI로 상품 이미지를 분석해 제품을 식별한다.
 * CLI 미설치/미인증/타임아웃/파싱 실패 시 null을 반환한다(→ 저하 동작).
 */
export async function analyzeImages(listing: DomesticListing): Promise<ProductIdentity | null> {
  const downloaded = await downloadImages(listing.images);
  if (!downloaded) return null;
  try {
    const text = await runClaude(IDENTITY_PROMPT(downloaded.paths, listing));
    const json = extractJson(text);
    if (!json) return null;
    const identity = coerceIdentity(json);
    return identity.name ? identity : null;
  } catch {
    return null;
  } finally {
    await rm(downloaded.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const QUERY_PROMPT = (
  identity: ProductIdentity,
) => `You generate overseas marketplace search queries for reselling a Korean second-hand item abroad.

Identified product:
${JSON.stringify(identity)}

Produce concise search queries (English or original language, as buyers would search) for each source. Include region/edition keywords when relevant.

Respond with ONLY a JSON object:
{"ebay":string[],"mercari":string[],"yahoo-auction":string[],"pricecharting":string[]}`;

/**
 * Claude CLI로 소스별 해외 검색어를 생성한다. 실패 시 null(→ 저하 동작).
 */
export async function generateSearchQueries(identity: ProductIdentity): Promise<SearchQueries | null> {
  try {
    const text = await runClaude(QUERY_PROMPT(identity));
    const json = extractJson(text);
    if (!json) return null;
    const out: SearchQueries = {};
    for (const [k, v] of Object.entries(json)) {
      const arr = strArray(v);
      if (arr.length > 0) out[k] = arr;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
