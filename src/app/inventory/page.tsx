"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pct, won } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  title: string;
  buy_price_krw: number;
  buy_date: string | null;
  sell_price_krw: number | null;
  sell_date: string | null;
  market: string | null;
  status: "holding" | "sold";
  realized_profit_krw: number | null;
}

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "disabled">("loading");
  const [title, setTitle] = useState("");
  const [buyPrice, setBuyPrice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/inventory");
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const p = Number.parseInt(buyPrice.replace(/[^\d]/g, ""), 10);
    if (!title.trim() || !Number.isFinite(p)) return toast.error("제품명과 매입가를 입력하세요.");
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), buyPriceKRW: p }),
    });
    const data = await res.json();
    if (data.ok) {
      setTitle("");
      setBuyPrice("");
      void load();
    } else toast.error(data.error ?? "추가 실패");
  }

  async function sell(id: string) {
    const input = window.prompt("판매가(원)를 입력하세요");
    if (!input) return;
    const p = Number.parseInt(input.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(p)) return toast.error("숫자를 입력하세요.");
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sellPriceKRW: p }),
    });
    if ((await res.json()).ok) void load();
    else toast.error("갱신 실패");
  }

  const realized = rows.filter((r) => r.status === "sold").reduce((s, r) => s + (r.realized_profit_krw ?? 0), 0);
  const holdingCost = rows.filter((r) => r.status === "holding").reduce((s, r) => s + r.buy_price_krw, 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10">
      <SiteNav />
      <h1 className="mb-4 font-bold text-2xl">매입/판매 기록</h1>

      {state === "disabled" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">저장 기능이 아직 꺼져 있습니다</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Supabase 프로젝트 생성 + <code>supabase/schema.sql</code> 실행 후, Vercel에{" "}
            <span className="font-mono">SUPABASE_URL</span>·<span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>
            를 등록하세요.
          </CardContent>
        </Card>
      )}

      {state === "ready" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-3">
                <p className="text-muted-foreground text-xs">실현 손익</p>
                <p className={cn("font-semibold tabular-nums", realized >= 0 ? "text-success" : "text-destructive")}>
                  {won(realized)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3">
                <p className="text-muted-foreground text-xs">보유 매입원가</p>
                <p className="font-semibold tabular-nums">{won(holdingCost)}</p>
              </CardContent>
            </Card>
          </div>

          <form onSubmit={add} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="t">제품명</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="매입 제품" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p">매입가(원)</Label>
              <Input
                id="p"
                inputMode="numeric"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="45000"
              />
            </div>
            <Button type="submit">추가</Button>
          </form>

          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">{r.title}</p>
                    <p className="text-muted-foreground text-xs">
                      매입 {won(r.buy_price_krw)}
                      {r.status === "sold" && r.sell_price_krw != null && (
                        <>
                          {" · 판매 "}
                          {won(r.sell_price_krw)}
                          {" · "}
                          <span className={cn((r.realized_profit_krw ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                            {won(r.realized_profit_krw ?? 0)} (
                            {pct(r.buy_price_krw > 0 ? ((r.realized_profit_krw ?? 0) / r.buy_price_krw) * 100 : 0)})
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  {r.status === "holding" ? (
                    <Button variant="outline" size="sm" onClick={() => void sell(r.id)}>
                      판매 기록
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">판매완료</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
