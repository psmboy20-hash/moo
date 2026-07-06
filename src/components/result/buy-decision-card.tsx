import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { pct, won } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const DIFFICULTY_LABEL = { LOW: "낮음", MEDIUM: "보통", HIGH: "높음" } as const;

function Line({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "warn" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          tone === "pos" && "text-success",
          tone === "neg" && "text-destructive",
          tone === "warn" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function BuyDecisionCard({ result }: { result: AnalysisResult }) {
  const d = result.decision;
  const profitPositive = d.netProfit >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>매입 판단</CardTitle>
        <CardDescription>얼마까지 매입해도 되는지 판단합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <Line label="현재 국내 판매가" value={won(d.currentDomesticPrice)} />
        <Line label="안전 매입가" value={won(d.safeBuyPrice)} tone="pos" />
        <Line label="추천 최대 매입가" value={won(d.recommendedMaxBuyPrice)} />
        <Line label="절대 비추천 매입가" value={`${won(d.absoluteNoBuyPrice)} 이상`} tone="neg" />

        <Separator />

        <Line label="예상 순이익" value={won(d.netProfit)} tone={profitPositive ? "pos" : "neg"} />
        <Line label="수익률" value={pct(d.marginPct)} tone={profitPositive ? "pos" : "neg"} />
        <Line
          label="판매 난이도"
          value={DIFFICULTY_LABEL[d.sellDifficulty]}
          tone={d.sellDifficulty === "HIGH" ? "warn" : undefined}
        />

        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">{d.finalStatement}</div>
      </CardContent>
    </Card>
  );
}
