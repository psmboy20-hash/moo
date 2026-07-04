import { describe, expect, it } from "vitest";

import { FIXTURES } from "@/lib/__fixtures__";
import { FALLBACK_RATES } from "@/lib/config/fx";
import { analyze } from "@/lib/pipeline/analyze";

describe("analyze() end-to-end with fixtures", () => {
  it("zelda fixture → RECOMMEND, outlier & mismatch filtered", async () => {
    const fx = FIXTURES.zelda;
    const r = await analyze(fx.listing, {
      identity: fx.identity,
      sold: fx.sold,
      active: fx.active,
      rates: FALLBACK_RATES,
    });

    // 480k 이상치와 일본어/불일치 제목은 matched=false 로 제외
    const matchedSold = r.sold.listings.filter((l) => l.matched).map((l) => l.priceKRW);
    expect(matchedSold).not.toContain(480_000);
    expect(r.sold.stats.aggressive).toBeLessThan(480_000);

    // 판매완료 기준 시세가 계산되고 순이익이 충분
    expect(r.sold.stats.base).toBeGreaterThan(100_000);
    expect(r.profit.netProfit).toBeGreaterThanOrEqual(50_000);
    expect(r.profit.marginPct).toBeGreaterThanOrEqual(30);
    expect(r.verdict.status).toBe("RECOMMEND");

    // 추천 최대 매입가 > 현재 국내가 (여유 있음)
    expect(r.decision.recommendedMaxBuyPrice).toBeGreaterThan(fx.listing.priceKRW);
  });

  it("pokemon fixture → 판매중 매물 과다 → 판매 난이도 HIGH", async () => {
    const fx = FIXTURES.pokemon;
    const r = await analyze(fx.listing, {
      identity: fx.identity,
      sold: fx.sold,
      active: fx.active,
      rates: FALLBACK_RATES,
    });
    expect(r.decision.sellDifficulty).toBe("HIGH");
    expect(r.verdict.riskFlags.some((f) => f.code === "HIGH_COMPETITION")).toBe(true);
    // 추가 확인 사진이 있어 식별 불확실 리스크
    expect(r.verdict.riskFlags.some((f) => f.code === "IDENTITY_UNCERTAIN")).toBe(true);
  });
});
