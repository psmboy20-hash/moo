"use client";

import { useState } from "react";

import { toast } from "sonner";

import { ManualInputForm } from "@/components/manual-input-form";
import { Results } from "@/components/result/results";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalysisResult, AnalyzeResponse, ManualListing } from "@/lib/types";

type Status = "idle" | "loading" | "done" | "manual";

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

async function postAnalyze(payload: object): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as AnalyzeResponse;
}

export function Analyzer() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [manualReason, setManualReason] = useState<string | null>(null);

  async function run(payload: object) {
    setStatus("loading");
    setResult(null);
    try {
      const data = await postAnalyze(payload);
      if (data.ok) {
        setResult(data.result);
        setStatus("done");
        if (data.result.degraded) toast.warning("AI 이미지 분석 없이 제목 기반으로 분석했습니다.");
      } else if (data.needsManualInput) {
        setManualReason(data.reason);
        setStatus("manual");
        toast.info("자동 추출에 실패해 수동 입력이 필요합니다.");
      } else {
        setStatus("idle");
        toast.error(data.error);
      }
    } catch {
      setStatus("idle");
      toast.error("분석 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
    }
  }

  function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("상품 링크를 입력하세요.");
      return;
    }
    void run({ url: url.trim() });
  }

  function handleManualSubmit(listing: ManualListing) {
    void run({ manual: listing });
  }

  const [saving, setSaving] = useState(false);
  async function saveResult() {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      const data = await res.json();
      if (data.ok) toast.success("분석을 저장했습니다.");
      else if (data.disabled) toast.info("저장 기능이 꺼져 있습니다(관리자: SUPABASE 키 등록 필요).");
      else toast.error(data.error ?? "저장 실패");
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function addToWatchlist() {
    if (!result) return;
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: result.identity.name || result.listing.title, url: result.listing.url }),
      });
      const data = await res.json();
      if (data.ok) toast.success("관심목록에 담았습니다.");
      else if (data.disabled) toast.info("관심목록 기능이 꺼져 있습니다(관리자: SUPABASE 키 등록 필요).");
      else toast.error(data.error ?? "추가 실패");
    } catch {
      toast.error("추가 중 오류가 발생했습니다.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>상품 링크 분석</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="중고나라·번개장터·스마트스토어·네이버쇼핑 상품 링크"
              className="flex-1"
            />
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "분석 중…" : "수익 분석"}
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">예시로 보기:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === "loading"}
              onClick={() => run({ fixture: "zelda" })}
            >
              젤다 (수익 케이스)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={status === "loading"}
              onClick={() => run({ fixture: "pokemon" })}
            >
              포켓몬 (경쟁 과다)
            </Button>
          </div>
        </CardContent>
      </Card>

      {status === "manual" && (
        <Card>
          <CardHeader>
            <CardTitle>수동 입력</CardTitle>
          </CardHeader>
          <CardContent>
            {manualReason && <p className="mb-4 text-muted-foreground text-sm">{manualReason}</p>}
            <ManualInputForm defaultUrl={url} onSubmit={handleManualSubmit} loading={false} />
          </CardContent>
        </Card>
      )}

      {status === "loading" && <LoadingSkeleton />}
      {status === "done" && result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => void saveResult()}>
              {saving ? "저장 중…" : "분석 저장"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void addToWatchlist()}>
              관심목록 담기
            </Button>
          </div>
          <Results result={result} />
        </div>
      )}
    </div>
  );
}
