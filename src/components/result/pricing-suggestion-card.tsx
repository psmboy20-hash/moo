import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { won } from "@/lib/format";
import type { AnalysisResult } from "@/lib/types";
import { cn } from "@/lib/utils";

function Tier({
  label,
  value,
  hint,
  highlighted,
}: {
  label: string;
  value: string;
  hint: string;
  highlighted?: boolean;
}) {
  return (
    <div className={cn("rounded-md border p-3", highlighted ? "border-primary bg-primary/5" : "border-border")}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <p className="mt-0.5 text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

export function PricingSuggestionCard({ result }: { result: AnalysisResult }) {
  const s = result.suggestion;
  return (
    <Card>
      <CardHeader>
        <CardTitle>판매가 제안</CardTitle>
        <CardDescription>해외에 얼마로 올릴지 제안합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <Tier
          label="빠른 판매가"
          value={won(s.quick)}
          hint="경쟁 최저가보다 약간 낮게 — 빠른 회전"
          highlighted={s.finalRecommended === s.quick}
        />
        <Tier
          label="기준 판매가"
          value={won(s.base)}
          hint="판매완료 상단과 경쟁가의 중간"
          highlighted={s.finalRecommended === s.base}
        />
        <Tier
          label="고가 대기 판매가"
          value={won(s.premium)}
          hint="상태 우수/미개봉/희귀 — 상위 매물 근처"
          highlighted={s.finalRecommended === s.premium}
        />

        <div className="mt-3 rounded-md bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">최종 추천 판매가</span>
            <span className="font-bold text-primary tabular-nums">{won(s.finalRecommended)}</span>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">{s.reason}</p>
        </div>
      </CardContent>
    </Card>
  );
}
