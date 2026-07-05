import { coerceIdentity, coerceQueries, extractJson, queryInstruction } from "@/lib/ai/shared";
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

/** claude CLI 사용 가능 여부(환경 변수로 비활성화 가능) */
export function isClaudeCliEnabled(): boolean {
  return process.env.DISABLE_CLAUDE_CLI !== "1";
}

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

const identityPromptWithPaths = (
  paths: string[],
  listing: DomesticListing,
) => `You are a reselling product identification expert. Read the product images with the Read tool at these absolute paths and identify the product PRIMARILY from the images (the seller's title can be wrong; use it only as a hint).

Images:
${paths.map((p) => `- ${p}`).join("\n")}

Seller title (hint only): ${listing.title}
Seller description (hint only): ${listing.description?.slice(0, 500) ?? ""}

Analyze: product name (prefer the international/original-language name used on eBay/Mercari), platform/category, region edition (일본판/북미판/아시아판/유럽판), version/edition, condition, whether factory-sealed, box state, included components, cover/artwork design, region code (CERO/ESRB/PEGI/barcode country), and which additional photos are needed to be sure.

CRITICAL for price matching — "aliases": the SAME product's title in overseas marketplace languages so cross-language listings can be matched. Include the exact Japanese title (日本語, for Yahoo/Mercari), the romanized/English title (for eBay), and common variant spellings. Full individual title with subtitle, not just the series.

Also estimate categoryKey (one of ["game-cart","game-boxed","game-big-box","console","console-boxed","card","card-box","figure","figure-large","disc","book","default"]) and weightGramsEst (shipping weight in grams incl. packaging).

Respond with ONLY a JSON object, no prose, matching exactly:
{"name":string,"aliases":string[],"platform":string,"region":string,"version":string,"condition":string,"sealed":boolean|null,"boxState":string,"components":string[],"coverDesign":string,"regionCode":string,"accuracy":number(0-100),"missingPhotos":string[],"categoryKey":string,"weightGramsEst":number}`;

/**
 * Claude CLI로 상품 이미지를 분석해 제품을 식별한다.
 * CLI 미설치/미인증/타임아웃/파싱 실패 시 null을 반환한다(→ 저하 동작).
 */
export async function analyzeImagesViaCli(listing: DomesticListing): Promise<ProductIdentity | null> {
  if (!isClaudeCliEnabled()) return null;
  const downloaded = await downloadImages(listing.images);
  if (!downloaded) return null;
  try {
    const text = await runClaude(identityPromptWithPaths(downloaded.paths, listing));
    const json = extractJson(text);
    return json ? coerceIdentity(json) : null;
  } catch {
    return null;
  } finally {
    await rm(downloaded.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Claude CLI로 소스별 해외 검색어를 생성한다. 실패 시 null(→ 저하 동작). */
export async function generateSearchQueriesViaCli(identity: ProductIdentity): Promise<SearchQueries | null> {
  if (!isClaudeCliEnabled()) return null;
  try {
    const text = await runClaude(queryInstruction(identity));
    const json = extractJson(text);
    return json ? coerceQueries(json) : null;
  } catch {
    return null;
  }
}
