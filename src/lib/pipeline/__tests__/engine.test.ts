import { describe, expect, it } from "vitest";

import { DEFAULT_FEES } from "@/lib/config/fees";
import { estimateShippingKRW, estimateWeightGrams } from "@/lib/config/shipping";
import { classifyTierFromText, tierOfIdentity } from "@/lib/pipeline/condition";
import { computeMatchConfidence, verifyMatch } from "@/lib/pipeline/filter";
import { computeMarketProfits, computeSellThrough } from "@/lib/pipeline/markets";
import { mean, median, quantile, removeLowNoise, removeOutliersIQR } from "@/lib/pipeline/outliers";
import { computeActiveStats, computeSoldStats } from "@/lib/pipeline/pricing";
import { breakEvenBuyPrice, computeProfit, maxBuyForTargets } from "@/lib/pipeline/profit";
import { filterRecentSold, parseIsoDateMs } from "@/lib/pipeline/recency";
import { suggestPrices } from "@/lib/pipeline/suggest";
import { classifyVerdict, computeSellDifficulty } from "@/lib/pipeline/verdict";
import type { ActiveListing, ProductIdentity, SoldListing } from "@/lib/types";

const identity: ProductIdentity = {
  name: "Zelda Tears of the Kingdom Switch",
  platform: "Nintendo Switch",
  region: "일본판",
  version: "일반판",
  condition: "미개봉",
  sealed: true,
  boxState: "양호",
  components: ["게임팩", "케이스"],
  coverDesign: "골드 로고",
  regionCode: "CERO",
  accuracy: 90,
  missingPhotos: [],
};

function sold(source: SoldListing["source"], priceKRW: number, matched = true, title = identity.name): SoldListing {
  return { source, title, priceOriginal: priceKRW, currency: "KRW", priceKRW, url: "#", matched };
}

function active(priceKRW: number, shipping = 0, matched = true): ActiveListing {
  return {
    source: "ebay",
    title: identity.name,
    priceOriginal: priceKRW,
    currency: "KRW",
    priceKRW,
    shippingKRW: shipping,
    buyerPerceivedKRW: priceKRW + shipping,
    url: "#",
    matched,
  };
}

describe("outliers", () => {
  it("quantile interpolates", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBeCloseTo(25);
    expect(quantile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5);
  });

  it("median/mean", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("removes IQR outliers when n>=4", () => {
    const out = removeOutliersIQR([100, 105, 110, 115, 1000]);
    expect(out).not.toContain(1000);
    expect(out.length).toBe(4);
  });

  it("keeps data when n<4", () => {
    expect(removeOutliersIQR([100, 5000])).toEqual([100, 5000]);
  });

  it("removeLowNoise drops ~1엔 junk but keeps legit loose prices", () => {
    // 중앙값 ~15000: 9(1엔 낙찰 노이즈)는 제거, 1178(loose 정상가)는 유지
    const out = removeLowNoise([9, 1178, 9200, 15198, 15000, 16000, 253000]);
    expect(out).not.toContain(9);
    expect(out).toContain(1178);
  });

  it("removeLowNoise keeps data when n<4", () => {
    expect(removeLowNoise([1, 100000])).toEqual([1, 100000]);
  });
});

describe("condition tier classification", () => {
  it("classifies sealed/loose/cib/unknown from KR/JP/EN text", () => {
    expect(classifyTierFromText("젤다 미개봉 새제품")).toBe("SEALED");
    expect(classifyTierFromText("スーパーマリオ 未開封")).toBe("SEALED");
    expect(classifyTierFromText("GBA ソフトのみ 動作確認")).toBe("LOOSE");
    expect(classifyTierFromText("cartridge only tested")).toBe("LOOSE");
    expect(classifyTierFromText("箱付き 説明書付き 完品")).toBe("CIB");
    expect(classifyTierFromText("complete in box CIB")).toBe("CIB");
    expect(classifyTierFromText("just a title")).toBe("UNKNOWN");
  });

  it("sealed keyword wins over box", () => {
    expect(classifyTierFromText("미개봉 박스 포함")).toBe("SEALED");
  });

  it("tierOfIdentity uses sealed flag then text", () => {
    expect(tierOfIdentity({ ...identity, sealed: true })).toBe("SEALED");
    expect(tierOfIdentity({ ...identity, sealed: null, condition: "ソフトのみ", boxState: "" })).toBe("LOOSE");
    expect(tierOfIdentity({ ...identity, sealed: false, condition: "박스 포함 완품", boxState: "양호" })).toBe("CIB");
  });
});

describe("shipping (weight-based)", () => {
  it("estimateWeightGrams: category + AI override", () => {
    expect(estimateWeightGrams("game-cart")).toBe(120);
    expect(estimateWeightGrams("console")).toBe(2500);
    expect(estimateWeightGrams(undefined)).toBe(400); // default
    expect(estimateWeightGrams("game-cart", 90)).toBe(90); // AI override wins
  });

  it("estimateShippingKRW: heavier costs more, JP cheaper than US at same tier", () => {
    expect(estimateShippingKRW("ebay-us", 90)).toBeLessThan(estimateShippingKRW("ebay-us", 2500));
    expect(estimateShippingKRW("mercari-jp", 300)).toBeLessThan(estimateShippingKRW("ebay-us", 300));
  });
});

describe("multi-market profit", () => {
  const sold = (source: SoldListing["source"], krw: number): SoldListing => ({
    source,
    title: "x",
    priceOriginal: krw,
    currency: "KRW",
    priceKRW: krw,
    url: "#",
    matched: true,
  });

  it("computes per-market profit sorted desc, bestMarket first", () => {
    const listings = [
      sold("ebay", 200_000),
      sold("ebay", 210_000),
      sold("mercari", 150_000),
      sold("yahoo-auction", 140_000),
    ];
    const markets = computeMarketProfits(listings, 45_000, 300);
    expect(markets.length).toBe(3);
    // 내림차순 정렬
    for (let i = 1; i < markets.length; i++) {
      expect(markets[i - 1].profit.netProfit).toBeGreaterThanOrEqual(markets[i].profit.netProfit);
    }
    // eBay 표본가가 가장 높아 최적일 가능성 높음 (수수료 반영 후에도)
    expect(markets[0].profit.netProfit).toBeGreaterThan(0);
  });

  it("returns empty when no matched sold", () => {
    expect(computeMarketProfits([], 45_000, 300)).toEqual([]);
  });

  it("computeSellThrough ratio", () => {
    const s = computeSellThrough(
      [sold("ebay", 100), sold("ebay", 100), sold("ebay", 100)],
      [
        {
          source: "ebay",
          title: "x",
          priceOriginal: 1,
          currency: "KRW",
          priceKRW: 1,
          shippingKRW: 0,
          buyerPerceivedKRW: 1,
          url: "#",
          matched: true,
        },
      ],
    );
    expect(s.soldCount).toBe(3);
    expect(s.activeCount).toBe(1);
    expect(s.ratio).toBe(0.75);
  });
});

describe("sold/active stats", () => {
  it("computes conservative<base<aggressive and drops outliers", () => {
    const listings = [
      sold("ebay", 100_000),
      sold("mercari", 110_000),
      sold("yahoo-auction", 120_000),
      sold("pricecharting", 130_000),
      sold("ebay", 900_000), // outlier
    ];
    const stats = computeSoldStats(listings);
    expect(stats.rawN).toBe(5);
    expect(stats.sampleN).toBe(4);
    expect(stats.conservative).toBeLessThanOrEqual(stats.base);
    expect(stats.base).toBeLessThanOrEqual(stats.aggressive);
    expect(stats.aggressive).toBeLessThan(900_000);
  });

  it("ignores unmatched listings", () => {
    const stats = computeSoldStats([sold("ebay", 100_000), sold("ebay", 500_000, false)]);
    expect(stats.base).toBe(100_000);
  });

  it("active stats include buyer-perceived shipping", () => {
    const stats = computeActiveStats([active(100_000, 15_000), active(120_000, 15_000)]);
    expect(stats.minCompetitor).toBe(100_000);
    expect(stats.buyerPerceivedAvg).toBe(125_000);
    expect(stats.listingCount).toBe(2);
  });
});

describe("profit", () => {
  it("subtracts all costs from sale price", () => {
    const p = computeProfit(300_000, 150_000, DEFAULT_FEES);
    // gross contribution = 300000*(1-0.21) - 23000 = 237000 - 23000 = 214000; net = 214000-150000=64000
    expect(p.netProfit).toBe(64_000);
    expect(p.marginPct).toBeCloseTo(42.7, 0);
  });

  it("break-even buy price yields ~0 net profit", () => {
    const S = 300_000;
    const be = breakEvenBuyPrice(S, DEFAULT_FEES);
    const p = computeProfit(S, be, DEFAULT_FEES);
    expect(Math.abs(p.netProfit)).toBeLessThanOrEqual(1);
  });

  it("maxBuyForTargets respects both profit and margin constraints", () => {
    const S = 300_000;
    const maxBuy = maxBuyForTargets(S, 20_000, 20, DEFAULT_FEES);
    const p = computeProfit(S, maxBuy, DEFAULT_FEES);
    expect(p.netProfit).toBeGreaterThanOrEqual(19_999);
    expect(p.marginPct).toBeGreaterThanOrEqual(19.9);
  });
});

describe("verdict classification (threshold boundaries)", () => {
  const mk = (netProfit: number, marginPct: number) =>
    ({
      expectedSalePriceKRW: 0,
      sellingFee: 0,
      paymentFee: 0,
      intlShipping: 0,
      packing: 0,
      domesticShipping: 0,
      fxRisk: 0,
      claimRisk: 0,
      domesticBuyPrice: 0,
      netProfit,
      marginPct,
    }) as const;

  it("RECOMMEND at 5만/30%", () => {
    expect(classifyVerdict(mk(50_000, 30))).toBe("RECOMMEND");
  });
  it("CONDITIONAL at 2만/20%", () => {
    expect(classifyVerdict(mk(20_000, 20))).toBe("CONDITIONAL");
  });
  it("HOLD just under conditional", () => {
    expect(classifyVerdict(mk(19_999, 50))).toBe("HOLD");
    expect(classifyVerdict(mk(40_000, 15))).toBe("HOLD");
  });
  it("AVOID on loss", () => {
    expect(classifyVerdict(mk(-1, 100))).toBe("AVOID");
  });
});

describe("sell difficulty", () => {
  const as = (listingCount: number) => ({
    minCompetitor: 0,
    avgCompetitor: 0,
    topTier: 0,
    buyerPerceivedAvg: 0,
    listingCount,
  });

  it("scales with listing count when no sell-through", () => {
    expect(computeSellDifficulty(as(2))).toBe("LOW");
    expect(computeSellDifficulty(as(12))).toBe("MEDIUM");
    expect(computeSellDifficulty(as(30))).toBe("HIGH");
  });

  it("sell-through overrides raw count", () => {
    // 판매율 높고 매물 적음 → 잘 팔림 → LOW
    expect(computeSellDifficulty(as(10), { soldCount: 20, activeCount: 10, ratio: 0.67, estTurnoverDays: 15 })).toBe(
      "LOW",
    );
    // 판매율 높지만 매물 30개(고경쟁) → MEDIUM
    expect(computeSellDifficulty(as(30), { soldCount: 45, activeCount: 30, ratio: 0.6, estTurnoverDays: 20 })).toBe(
      "MEDIUM",
    );
    // 판매율 낮음(재고 쌓임) → HIGH
    expect(computeSellDifficulty(as(8), { soldCount: 1, activeCount: 20, ratio: 0.05, estTurnoverDays: 600 })).toBe(
      "HIGH",
    );
  });
});

describe("match confidence", () => {
  it("high accuracy + support → high, no name → low, no matches → capped", () => {
    // 정확도 90 + 매칭 다수 → 높음
    expect(computeMatchConfidence({ ...identity, accuracy: 90 }, 6, 4)).toBeGreaterThanOrEqual(70);
    // 식별명 없음 → 20
    expect(computeMatchConfidence({ ...identity, name: "" }, 6, 4)).toBe(20);
    // 매칭 0건 → 상한 45로 캡
    expect(computeMatchConfidence({ ...identity, accuracy: 95 }, 0, 0)).toBeLessThanOrEqual(45);
  });
});

describe("recency filter", () => {
  const NOW = Date.UTC(2026, 6, 5); // 2026-07-05
  const s = (soldDate: string | undefined): SoldListing => ({
    source: "yahoo-auction",
    title: "x",
    priceOriginal: 100,
    currency: "KRW",
    priceKRW: 100,
    soldDate,
    url: "#",
    matched: true,
  });

  it("parseIsoDateMs parses YYYY-MM-DD, rejects yearless", () => {
    expect(parseIsoDateMs("2026-01-15")).toBe(Date.UTC(2026, 0, 15));
    expect(parseIsoDateMs("07/05")).toBeNull();
    expect(parseIsoDateMs(undefined)).toBeNull();
  });

  it("drops dated-old, keeps recent and undated", () => {
    const out = filterRecentSold([s("2026-06-01"), s("2024-01-01"), s("07/05"), s(undefined)], 6, NOW);
    expect(out.length).toBe(3); // 2024만 제외
    expect(out.some((l) => l.soldDate === "2024-01-01")).toBe(false);
  });
});

describe("same-product filter", () => {
  it("matches on name overlap", () => {
    expect(verifyMatch("Zelda Tears of the Kingdom Nintendo Switch JP", identity).matched).toBe(true);
  });
  it("rejects unrelated title", () => {
    expect(verifyMatch("Sony PlayStation 5 Console", identity).matched).toBe(false);
  });
  it("rejects region mismatch", () => {
    const r = verifyMatch("Zelda Tears of the Kingdom Switch USA ESRB North America", identity);
    expect(r.matched).toBe(false);
  });

  it("matches a Japanese-title listing via a Japanese alias (cross-language)", () => {
    const jp: ProductIdentity = {
      ...identity,
      name: "Mega Man Battle Network 4 Blue Moon",
      region: "일본판",
      regionCode: "CERO",
      aliases: ["ロックマンエグゼ4 トーナメント ブルームーン", "Rockman EXE 4"],
    };
    // 영문 name과는 전혀 안 겹치지만 일본어 별칭이 제목에 통째로 포함됨
    const title = "ロックマンエグゼ4 トーナメント ブルームーン GBA 動作確認済";
    expect(verifyMatch(title, jp).matched).toBe(true);
  });

  it("still rejects a different Japanese product despite same series alias", () => {
    const jp: ProductIdentity = {
      ...identity,
      name: "Mega Man Battle Network 4 Blue Moon",
      region: "미상",
      regionCode: "미상",
      aliases: ["ロックマンエグゼ4 トーナメント ブルームーン"],
    };
    // 다른 부제(레드선) → 별칭 문자열이 통째로 포함되지 않음
    expect(verifyMatch("ロックマンエグゼ4.5 リアルオペレーション", jp).matched).toBe(false);
  });
});

describe("price suggestion", () => {
  it("quick <= base and premium bumped when eligible", () => {
    const soldStats = computeSoldStats([
      sold("ebay", 100_000),
      sold("mercari", 110_000),
      sold("yahoo-auction", 120_000),
      sold("pricecharting", 130_000),
    ]);
    const activeStats = computeActiveStats([active(115_000), active(140_000), active(160_000)]);
    const s = suggestPrices(soldStats, activeStats, identity, "LOW");
    expect(s.quick).toBeLessThanOrEqual(s.base);
    expect(s.finalRecommended).toBeGreaterThan(0);
  });
});
