import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { won } from "@/lib/format";
import type { AnalysisResult, ConditionTier, SoldSourceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<SoldSourceId, string> = {
  ebay: "eBay Sold",
  mercari: "Mercari Sold",
  "yahoo-auction": "Yahoo 낙찰가",
  pricecharting: "PriceCharting",
};

const TIER_LABEL: Record<ConditionTier, string> = {
  SEALED: "미개봉",
  CIB: "박스완전(CIB)",
  LOOSE: "알만(loose)",
  UNKNOWN: "상태미상",
};
const TIER_ORDER: ConditionTier[] = ["SEALED", "CIB", "LOOSE", "UNKNOWN"];

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SoldPriceCard({ result }: { result: AnalysisResult }) {
  const { stats } = result.sold;
  const sources: SoldSourceId[] = ["ebay", "mercari", "yahoo-auction", "pricecharting"];
  const tiers = TIER_ORDER.filter((t) => stats.byTier[t]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>판매완료 시세</CardTitle>
          {stats.targetTier !== "UNKNOWN" && <Badge variant="outline">내 상품: {TIER_LABEL[stats.targetTier]}</Badge>}
        </div>
        <CardDescription>
          실제 거래된 가격입니다. 시세 판단의 기준으로 사용합니다. (유효 표본 {stats.sampleN}건 / 수집 {stats.rawN}건,
          이상치 제거)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{SOURCE_LABEL[s]}</span>
              <span className="font-medium tabular-nums">
                {stats.bySource[s] ? won(stats.bySource[s]) : "데이터 없음"}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div>
          <p className="mb-1.5 text-muted-foreground text-xs">전체 (보수/기준/공격)</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="보수 시세" value={won(stats.conservative)} hint="확실히 팔림" />
            <Stat label="기준 시세" value={won(stats.base)} hint="실질 시장가" />
            <Stat label="공격 시세" value={won(stats.aggressive)} hint="잘 받으면" />
          </div>
        </div>

        {tiers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs">상태별 기준 시세 (같은 티어끼리 비교)</p>
            {tiers.map((t) => {
              const ts = stats.byTier[t];
              if (!ts) return null;
              const isTarget = t === stats.targetTier;
              return (
                <div
                  key={t}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2 py-1 text-sm",
                    isTarget && "bg-primary/5 font-semibold",
                  )}
                >
                  <span className={isTarget ? "text-foreground" : "text-muted-foreground"}>
                    {TIER_LABEL[t]}
                    {isTarget && " ★"} <span className="text-[10px] text-muted-foreground">({ts.sampleN})</span>
                  </span>
                  <span className="tabular-nums">
                    {won(ts.conservative)} ~ {won(ts.aggressive)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
