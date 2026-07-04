import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import { ActivePriceCard } from "@/components/result/active-price-card";
import { BuyDecisionCard } from "@/components/result/buy-decision-card";
import { ConclusionCard } from "@/components/result/conclusion-card";
import { IdentificationCard } from "@/components/result/identification-card";
import { PricingSuggestionCard } from "@/components/result/pricing-suggestion-card";
import { SoldPriceCard } from "@/components/result/sold-price-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { AnalysisResult } from "@/lib/types";

/** 저하 동작·데이터 부족 상황을 사용자에게 명확히 안내한다 */
function SetupBanner({ result }: { result: AnalysisResult }) {
  const noSold = result.sold.stats.sampleN === 0;

  if (result.degraded) {
    return (
      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>이미지 AI 식별이 꺼져 있어 정확도가 낮습니다</AlertTitle>
        <AlertDescription>
          제목 기반으로만 분석했습니다. 이미지 우선 식별과 해외 시세 매칭을 켜려면 배포 환경(Vercel)에 환경 변수
          <span className="font-mono"> ANTHROPIC_API_KEY </span>를 설정한 뒤 다시 시도하세요.
        </AlertDescription>
      </Alert>
    );
  }

  if (noSold) {
    return (
      <Alert>
        <InfoIcon />
        <AlertTitle>동일 제품으로 검증된 해외 판매완료 시세가 없습니다</AlertTitle>
        <AlertDescription>
          PriceCharting은 게임·카드·수집품 위주로 시세를 제공합니다. eBay/Mercari/Yahoo 실시세는 서버 봇 차단으로 별도
          연동(스크래핑 API 또는 공식 API)이 필요합니다. 그 전까지는 매칭된 소스 기준으로만 판정합니다.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

export function Results({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-4">
      <SetupBanner result={result} />
      <ConclusionCard result={result} />
      <div className="grid gap-4 md:grid-cols-2">
        <IdentificationCard result={result} />
        <BuyDecisionCard result={result} />
        <SoldPriceCard result={result} />
        <ActivePriceCard result={result} />
        <div className="md:col-span-2">
          <PricingSuggestionCard result={result} />
        </div>
      </div>

      {result.notes.length > 0 && (
        <div className="space-y-1 text-muted-foreground text-xs">
          {result.notes.map((n) => (
            <p key={n}>ⓘ {n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
