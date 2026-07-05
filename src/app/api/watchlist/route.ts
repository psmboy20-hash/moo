import { NextResponse } from "next/server";

import { addWatchlist, listWatchlist, removeWatchlist } from "@/lib/supabase/repo";
import { hasSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    error: "관심목록 기능이 비활성화되어 있습니다(SUPABASE 키 미설정).",
  });
}

export async function GET() {
  if (!hasSupabase()) return disabled();
  try {
    return NextResponse.json({ ok: true, rows: await listWatchlist() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!hasSupabase()) return disabled();
  try {
    const body = (await req.json()) as { title?: string; url?: string; note?: string; analysisId?: string };
    if (!body?.title) return NextResponse.json({ ok: false, error: "title이 필요합니다." }, { status: 400 });
    return NextResponse.json({ ok: true, row: await addWatchlist(body as { title: string }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "추가 실패" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!hasSupabase()) return disabled();
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });
    await removeWatchlist(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "삭제 실패" }, { status: 500 });
  }
}
