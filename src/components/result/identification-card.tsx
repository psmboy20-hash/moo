import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AnalysisResult } from "@/lib/types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "미상"}</span>
    </div>
  );
}

export function IdentificationCard({ result }: { result: AnalysisResult }) {
  const id = result.identity;
  const sealedLabel = id.sealed === true ? "미개봉" : id.sealed === false ? "개봉" : "불확실";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>제품 식별</CardTitle>
          {result.degraded && <Badge variant="outline">제목 기반(저하)</Badge>}
        </div>
        <CardDescription>이미지 우선으로 추정한 제품 정보입니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Row label="추정 제품명" value={id.name} />
        <Row label="플랫폼" value={id.platform} />
        <Row label="지역판" value={id.region} />
        <Row label="버전" value={id.version} />
        <Row label="상태" value={id.condition} />
        <Row label="미개봉 여부" value={sealedLabel} />
        <Row label="구성품" value={id.components.length > 0 ? id.components.join(", ") : "미상"} />
        <Row label="지역 코드" value={id.regionCode} />

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">식별 정확도</span>
            <span className="font-semibold tabular-nums">{id.accuracy}%</span>
          </div>
          <Progress value={id.accuracy} />
        </div>

        {id.missingPhotos.length > 0 && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="mb-1 font-medium">추가 확인이 필요한 사진</p>
            <ul className="space-y-0.5 text-muted-foreground">
              {id.missingPhotos.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
