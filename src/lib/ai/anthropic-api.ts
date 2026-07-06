import { setAiError } from "@/lib/ai/diag";
import { coerceIdentity, coerceQueries, extractJson, identityInstruction, queryInstruction } from "@/lib/ai/shared";
import type { DomesticListing, ProductIdentity, SearchQueries } from "@/lib/types";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_IMAGES = 4;
const TIMEOUT_MS = 60_000;

export function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
type TextBlock = { type: "text"; text: string };
type ContentBlock = ImageBlock | TextBlock;

async function downloadImageBlocks(urls: string[]): Promise<ImageBlock[]> {
  const blocks: ImageBlock[] = [];
  for (const url of urls.slice(0, MAX_IMAGES)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      const media_type = ct.includes("png")
        ? "image/png"
        : ct.includes("webp")
          ? "image/webp"
          : ct.includes("gif")
            ? "image/gif"
            : "image/jpeg";
      const data = Buffer.from(await res.arrayBuffer()).toString("base64");
      blocks.push({ type: "image", source: { type: "base64", media_type, data } });
    } catch {
      // 개별 이미지 실패는 무시
    }
  }
  return blocks;
}

/** Anthropic Messages API 호출 → 응답 텍스트 (실패 시 throw) */
async function callMessages(content: ContentBlock[], maxTokens = 1024): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    // temperature 0: 같은 입력에 최대한 같은 식별 결과가 나오도록(판정 흔들림 방지)
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: "user", content }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

/** Anthropic 비전 API로 이미지 분석. 키 없음/실패 시 null. */
export async function analyzeImagesViaApi(listing: DomesticListing): Promise<ProductIdentity | null> {
  if (!hasAnthropicApiKey()) return null;
  try {
    const images = await downloadImageBlocks(listing.images);
    if (images.length === 0) {
      setAiError("API: 상품 이미지를 내려받지 못함");
      return null;
    }
    const content: ContentBlock[] = [...images, { type: "text", text: identityInstruction(listing) }];
    const text = await callMessages(content);
    const json = extractJson(text);
    if (!json) {
      setAiError(`API: 응답에서 JSON을 못 찾음: ${text.slice(0, 120)}`);
      return null;
    }
    return coerceIdentity(json);
  } catch (e) {
    setAiError(`API 호출 실패: ${e instanceof Error ? e.message : String(e)}`.slice(0, 220));
    return null;
  }
}

/** Anthropic API로 해외 검색어 생성. 키 없음/실패 시 null. */
export async function generateSearchQueriesViaApi(identity: ProductIdentity): Promise<SearchQueries | null> {
  if (!hasAnthropicApiKey()) return null;
  try {
    const text = await callMessages([{ type: "text", text: queryInstruction(identity) }], 512);
    const json = extractJson(text);
    return json ? coerceQueries(json) : null;
  } catch {
    return null;
  }
}
