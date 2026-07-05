"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";

interface Row {
  id: string;
  created_at: string;
  title: string;
  url: string | null;
  note: string | null;
}

export default function WatchlistPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "disabled">("loading");

  const load = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    const data = await res.json();
    if (data.disabled) {
      setState("disabled");
      return;
    }
    setRows(data.rows ?? []);
    setState("ready");
  }, []);

  useEffect(() => {
    load().catch(() => setState("disabled"));
  }, [load]);

  async function remove(id: string) {
    const res = await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    if ((await res.json()).ok) {
      setRows((r) => r.filter((x) => x.id !== id));
    } else {
      toast.error("삭제 실패");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <SiteNav />
      <h1 className="mb-4 font-bold text-2xl">관심목록</h1>

      {state === "disabled" && <DisabledNotice />}

      {state === "ready" && rows.length === 0 && (
        <Empty className="border">
          <p className="text-muted-foreground text-sm">
            아직 관심목록이 비어 있습니다. 분석 결과에서 "관심목록"으로 담아보세요.
          </p>
        </Empty>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{r.title}</p>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground text-xs hover:underline"
                  >
                    링크
                  </a>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => void remove(r.id)}>
                삭제
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

function DisabledNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">저장 기능이 아직 꺼져 있습니다</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        <p>
          관심목록·기록을 쓰려면 Supabase 프로젝트를 만들고 <code>supabase/schema.sql</code>을 실행한 뒤, Vercel
          환경변수에
          <span className="font-mono"> SUPABASE_URL </span>과{" "}
          <span className="font-mono"> SUPABASE_SERVICE_ROLE_KEY </span>를 등록하세요. (자세한 안내는 저장소의{" "}
          <code>.env.example</code> 참고)
        </p>
      </CardContent>
    </Card>
  );
}
