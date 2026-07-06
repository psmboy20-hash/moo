import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { won } from "@/lib/format";
import type { ActiveSourceId, AnalysisResult } from "@/lib/types";

const SOURCE_LABEL: Record<ActiveSourceId, string> = {
  ebay: "eBay 판매중",
  mercari: "Mercari 판매중",
  "yahoo-auction": "Yahoo 진행가",
  "overseas-mall": "해외 쇼핑몰",
};

function minBySource(result: AnalysisResult, source: ActiveSourceId): number | null {
  const prices = result.active.listings
    .filter((l) => l.matched && l.source === source && l.priceKRW > 0)
    .map((l) => l.priceKRW);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-3 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ActivePriceCard({ result }: { result: AnalysisResult }) {
  const { stats } = result.active;
  const sources: ActiveSourceId[] = ["ebay", "mercari", "yahoo-auction", "overseas-mall"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>현재 판매중 가격</CardTitle>
        <CardDescription>
          경쟁 매물 가격입니다. 실제 시세가 아니라 내 판매가 제안·경쟁 분석용입니다. (현재 {stats.listingCount}개 매물)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {sources.map((s) => {
            const v = minBySource(result, s);
            return (
              <div key={s} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{SOURCE_LABEL[s]} (최저)</span>
                <span className="font-medium tabular-nums">{v ? won(v) : "데이터 없음"}</span>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-2">
          <Stat label="최저 경쟁가" value={won(stats.minCompetitor)} />
          <Stat label="평균 경쟁가" value={won(stats.avgCompetitor)} />
          <Stat label="상위 가격대" value={won(stats.topTier)} />
          <Stat label="배송 포함 체감가" value={won(stats.buyerPerceivedAvg)} />
        </div>
      </CardContent>
    </Card>
  );
}
