import { NextResponse } from "next/server";

import { addInventory, listInventory, markInventorySold } from "@/lib/supabase/repo";
import { hasSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    error: "기록 기능이 비활성화되어 있습니다(SUPABASE 키 미설정).",
  });
}

export async function GET() {
  if (!hasSupabase()) return disabled();
  try {
    return NextResponse.json({ ok: true, rows: await listInventory() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!hasSupabase()) return disabled();
  try {
    const body = (await req.json()) as {
      title?: string;
      buyPriceKRW?: number;
      buyDate?: string;
      market?: string;
      analysisId?: string;
    };
    if (!body?.title || typeof body.buyPriceKRW !== "number") {
      return NextResponse.json({ ok: false, error: "title, buyPriceKRW가 필요합니다." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, row: await addInventory(body as { title: string; buyPriceKRW: number }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "추가 실패" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!hasSupabase()) return disabled();
  try {
    const body = (await req.json()) as { id?: string; sellPriceKRW?: number; sellDate?: string };
    if (!body?.id || typeof body.sellPriceKRW !== "number") {
      return NextResponse.json({ ok: false, error: "id, sellPriceKRW가 필요합니다." }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      row: await markInventorySold(body.id, { sellPriceKRW: body.sellPriceKRW, sellDate: body.sellDate }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "갱신 실패" }, { status: 500 });
  }
}
