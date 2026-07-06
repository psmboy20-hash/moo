import { describe, expect, it } from "vitest";

import { feesForMarket, MARKET_FEES, THRESHOLDS } from "@/lib/config/fees";
import { CATEGORY_WEIGHT_G, estimateShippingKRW, estimateWeightGrams } from "@/lib/config/shipping";
import type { MarketId } from "@/lib/types";

const MARKETS: MarketId[] = ["ebay-us", "mercari-jp", "yahoo-jp"];

describe("config/shipping — estimateWeightGrams", () => {
  it("prefers a valid AI weight over the category default", () => {
    expect(estimateWeightGrams("game-cart", 175)).toBe(175);
  });

  it("rounds a fractional AI weight", () => {
    expect(estimateWeightGrams("game-cart", 174.6)).toBe(175);
  });

  it("falls back to the category weight when AI weight is missing or invalid", () => {
    expect(estimateWeightGrams("console")).toBe(CATEGORY_WEIGHT_G.console);
    expect(estimateWeightGrams("console", 0)).toBe(CATEGORY_WEIGHT_G.console);
    expect(estimateWeightGrams("console", Number.NaN)).toBe(CATEGORY_WEIGHT_G.console);
    expect(estimateWeightGrams("console", -50)).toBe(CATEGORY_WEIGHT_G.console);
  });

  it("falls back to default for unknown or missing category", () => {
    expect(estimateWeightGrams("nonsense-key")).toBe(CATEGORY_WEIGHT_G.default);
    expect(estimateWeightGrams()).toBe(CATEGORY_WEIGHT_G.default);
  });
});

describe("config/shipping — estimateShippingKRW", () => {
  it("picks the correct weight tier by upper bound (inclusive)", () => {
    // US: [100→9000, 250→13000, 500→18000, ...]
    expect(estimateShippingKRW("ebay-us", 100)).toBe(9_000);
    expect(estimateShippingKRW("ebay-us", 101)).toBe(13_000);
    expect(estimateShippingKRW("ebay-us", 250)).toBe(13_000);
    expect(estimateShippingKRW("ebay-us", 251)).toBe(18_000);
  });

  it("routes JP markets to the JP table", () => {
    expect(estimateShippingKRW("mercari-jp", 100)).toBe(7_000);
    expect(estimateShippingKRW("yahoo-jp", 100)).toBe(7_000);
  });

  it("uses the top tier for very heavy items", () => {
    expect(estimateShippingKRW("ebay-us", 99_999)).toBe(75_000);
    expect(estimateShippingKRW("mercari-jp", 99_999)).toBe(58_000);
  });

  it("clamps non-positive weight to the lightest tier", () => {
    expect(estimateShippingKRW("ebay-us", 0)).toBe(9_000);
    expect(estimateShippingKRW("ebay-us", -10)).toBe(9_000);
  });

  it("is monotonic non-decreasing in weight for every market", () => {
    for (const market of MARKETS) {
      let prev = 0;
      for (const w of [50, 100, 250, 500, 1_000, 2_000, 3_000, 5_000]) {
        const cost = estimateShippingKRW(market, w);
        expect(cost).toBeGreaterThanOrEqual(prev);
        prev = cost;
      }
    }
  });
});

describe("config/fees — feesForMarket", () => {
  it("carries market fee/currency spec into the FeeConfig", () => {
    const ebay = feesForMarket("ebay-us", 120);
    expect(ebay.sellingFeeRate).toBe(MARKET_FEES["ebay-us"].sellingFeeRate);
    expect(ebay.paymentFeeRate).toBe(MARKET_FEES["ebay-us"].paymentFeeRate);
    expect(ebay.fxRiskRate).toBe(MARKET_FEES["ebay-us"].fxRiskRate);
  });

  it("derives intlShipping from the weight table", () => {
    expect(feesForMarket("ebay-us", 120).intlShipping).toBe(estimateShippingKRW("ebay-us", 120));
    expect(feesForMarket("mercari-jp", 120).intlShipping).toBe(estimateShippingKRW("mercari-jp", 120));
  });

  it("produces sane bounded rates for every market", () => {
    for (const market of MARKETS) {
      const f = feesForMarket(market, 300);
      for (const rate of [f.sellingFeeRate, f.paymentFeeRate, f.fxRiskRate, f.claimRiskRate]) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThan(1);
      }
      expect(f.intlShipping).toBeGreaterThan(0);
      expect(f.packing).toBeGreaterThanOrEqual(0);
      expect(f.domesticShipping).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("config/fees — THRESHOLDS ordering", () => {
  it("keeps verdict thresholds internally consistent", () => {
    expect(THRESHOLDS.recommendNetProfit).toBeGreaterThan(THRESHOLDS.conditionalNetProfitMin);
    expect(THRESHOLDS.recommendMarginPct).toBeGreaterThan(THRESHOLDS.conditionalMarginPct);
    expect(THRESHOLDS.highCompetitionListingCount).toBeGreaterThan(THRESHOLDS.mediumCompetitionListingCount);
  });
});
