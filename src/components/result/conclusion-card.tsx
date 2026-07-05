import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MARKET_LABEL } from "@/lib/config/fees";
import { pct, won } from "@/lib/format";
import type { AnalysisResult, VerdictStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const VERDICT_META: Record<VerdictStatus, { label: string; className: string; desc: string }> = {
  RECOMMEND: {
    label: "매입 추천",
    className: "bg-success text-success-foreground",
    desc: "지금 조건에서 수익이 충분합니다.",
  },
  CONDITIONAL: {
    label: "조건부 매입",
    className: "bg-warning text-warning-foreground",
    desc: "가격 협상 시 매입 가치가 있습니다.",
  },
  HOLD: { label: "보류", className: "bg-muted text-foreground", desc: "수익이 얇아 신중해야 합니다." },
  AVOID: { label: "비추천", className: "bg-destructive text-white", desc: "손실 위험이 있습니다." },
};

const DIFFICULTY_LABEL = { LOW: "낮음", MEDIUM: "보통", HIGH: "높음" } as const;

function Metric({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          accent === "pos" && "text-success",
          accent === "neg" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ConclusionCard({ result }: { result: AnalysisResult }) {
  const meta = VERDICT_META[result.verdict.status];
  const { profit, decision, listing, markets, bestMarket, sellThrough } = result;
  const profitPositive = profit.netProfit >= 0;

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">결론</CardTitle>
          <div className="flex items-center gap-2">
            {bestMarket && <Badge variant="outline">최적 판매처: {MARKET_LABEL[bestMarket]}</Badge>}
            <Badge className={cn("px-3 py-1 text-sm", meta.className)}>{meta.label}</Badge>
          </div>
        </div>
        <CardDescription>{meta.desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Metric label="국내 판매가" value={won(listing.priceKRW)} />
          <Metric label="추천 해외 판매가" value={won(profit.expectedSalePriceKRW)} />
          <Metric label="예상 순이익" value={won(profit.netProfit)} accent={profitPositive ? "pos" : "neg"} />
          <Metric label="예상 수익률" value={pct(profit.marginPct)} accent={profitPositive ? "pos" : "neg"} />
          <Metric label="추천 최대 매입가" value={won(decision.recommendedMaxBuyPrice)} />
          <Metric
            label="판매 난이도"
            value={`${DIFFICULTY_LABEL[decision.sellDifficulty]}${sellThrough.estTurnoverDays ? ` · ~${sellThrough.estTurnoverDays}일` : ""}`}
          />
        </div>

        {markets.length > 1 && (
          <div className="space-y-1.5">
            <p className="font-medium text-muted-foreground text-xs">시장별 예상 순이익</p>
            <div className="space-y-1">
              {markets.map((m) => (
                <div key={m.market} className="flex items-center justify-between text-sm">
                  <span
                    className={cn("text-muted-foreground", m.market === bestMarket && "font-semibold text-foreground")}
                  >
                    {MARKET_LABEL[m.market]}
                    {m.market === bestMarket && " ★"}
                  </span>
                  <span className={cn("tabular-nums", m.profit.netProfit >= 0 ? "text-success" : "text-destructive")}>
                    {won(m.profit.netProfit)} ({pct(m.profit.marginPct)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.verdict.riskFlags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
                <AlertTriangle className="size-3.5" /> 주요 리스크
              </p>
              <ul className="space-y-1 text-sm">
                {result.verdict.riskFlags.map((f) => (
                  <li key={f.code} className="text-muted-foreground">
                    · {f.message}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
