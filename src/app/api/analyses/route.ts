import { NextResponse } from "next/server";

import { listAnalyses, saveAnalysis } from "@/lib/supabase/repo";
import { hasSupabase } from "@/lib/supabase/server";
import type { AnalysisResult } from "@/lib/types";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    error: "저장 기능이 비활성화되어 있습니다(SUPABASE 키 미설정).",
  });
}

export async function GET() {
  if (!hasSupabase()) return disabled();
  try {
    return NextResponse.json({ ok: true, rows: await listAnalyses() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!hasSupabase()) return disabled();
  try {
    const body = (await req.json()) as { result?: AnalysisResult };
    if (!body?.result) return NextResponse.json({ ok: false, error: "result가 없습니다." }, { status: 400 });
    return NextResponse.json({ ok: true, row: await saveAnalysis(body.result) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "저장 실패" }, { status: 500 });
  }
}
