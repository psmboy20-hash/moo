import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { won } from "@/lib/format";
import type { AnalysisResult, SoldSourceId } from "@/lib/types";

const SOURCE_LABEL: Record<SoldSourceId, string> = {
  ebay: "eBay Sold",
  mercari: "Mercari Sold",
  "yahoo-auction": "Yahoo 낙찰가",
  pricecharting: "PriceCharting",
};

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>판매완료 시세</CardTitle>
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

        <div className="grid grid-cols-3 gap-2">
          <Stat label="보수 시세" value={won(stats.conservative)} hint="확실히 팔림" />
          <Stat label="기준 시세" value={won(stats.base)} hint="실질 시장가" />
          <Stat label="공격 시세" value={won(stats.aggressive)} hint="잘 받으면" />
        </div>
      </CardContent>
    </Card>
  );
}
