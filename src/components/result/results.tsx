import { ActivePriceCard } from "@/components/result/active-price-card";
import { BuyDecisionCard } from "@/components/result/buy-decision-card";
import { ConclusionCard } from "@/components/result/conclusion-card";
import { IdentificationCard } from "@/components/result/identification-card";
import { PricingSuggestionCard } from "@/components/result/pricing-suggestion-card";
import { SoldPriceCard } from "@/components/result/sold-price-card";
import type { AnalysisResult } from "@/lib/types";

export function Results({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-4">
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
