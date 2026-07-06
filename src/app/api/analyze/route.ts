import { NextResponse } from "next/server";

import { getFixture } from "@/lib/__fixtures__";
import { extractListing } from "@/lib/extract";
import { analyze } from "@/lib/pipeline/analyze";
import { type AnalyzeResponse, analyzeRequestSchema, manualListingSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request): Promise<NextResponse<AnalyzeResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, needsManualInput: false, error: "잘못된 요청 본문입니다." });
  }

  // 결정적 검증용 fixture 경로
  const fixtureName =
    typeof body === "object" && body !== null && "fixture" in body
      ? String((body as { fixture: unknown }).fixture)
      : null;
  if (fixtureName) {
    const fx = getFixture(fixtureName);
    if (!fx) {
      return NextResponse.json({ ok: false, needsManualInput: false, error: `알 수 없는 fixture: ${fixtureName}` });
    }
    const result = await analyze(fx.listing, { identity: fx.identity, sold: fx.sold, active: fx.active });
    return NextResponse.json({ ok: true, result });
  }

  // 수동 입력 경로
  if (typeof body === "object" && body !== null && "manual" in body) {
    const parsed = manualListingSchema.safeParse((body as { manual: unknown }).manual);
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        needsManualInput: false,
        error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.",
      });
    }
    const m = parsed.data;
    const result = await analyze({
      url: m.url || "",
      platform: m.platform,
      title: m.title,
      priceKRW: m.priceKRW,
      images: m.images,
      description: m.description ?? "",
    });
    return NextResponse.json({ ok: true, result });
  }

  // URL 경로
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success || !("url" in parsed.data)) {
    return NextResponse.json({ ok: false, needsManualInput: false, error: "URL을 입력하세요." });
  }

  const listing = await extractListing(parsed.data.url);
  if (!listing) {
    return NextResponse.json({
      ok: false,
      needsManualInput: true,
      reason: "링크에서 상품 정보를 자동 추출하지 못했습니다. 이미지·제목·가격을 직접 입력해주세요.",
    });
  }

  const result = await analyze(listing);
  return NextResponse.json({ ok: true, result });
}
