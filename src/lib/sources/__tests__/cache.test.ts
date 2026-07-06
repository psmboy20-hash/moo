import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCache, getCached, setCached, withTtlCache } from "@/lib/sources/cache";

describe("sources/cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearCache();
  });

  it("returns a stored value before it expires", () => {
    setCached("k", "v", 1_000);
    expect(getCached<string>("k")).toBe("v");
  });

  it("expires values after the TTL elapses", () => {
    setCached("k", "v", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(getCached<string>("k")).toBeUndefined();
  });

  it("does not cache when ttl is zero or negative", () => {
    setCached("k", "v", 0);
    expect(getCached("k")).toBeUndefined();
    setCached("k2", "v", -5);
    expect(getCached("k2")).toBeUndefined();
  });

  it("runs fn only on a cache miss", async () => {
    const fn = vi.fn().mockResolvedValue("computed");
    const first = await withTtlCache("k", 1_000, fn);
    const second = await withTtlCache("k", 1_000, fn);
    expect(first).toBe("computed");
    expect(second).toBe("computed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-runs fn after the cached value expires", async () => {
    const fn = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    expect(await withTtlCache("k", 1_000, fn)).toBe("a");
    vi.advanceTimersByTime(1_001);
    expect(await withTtlCache("k", 1_000, fn)).toBe("b");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejected fn (retries next call)", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(withTtlCache("k", 1_000, fn)).rejects.toThrow("boom");
    expect(await withTtlCache("k", 1_000, fn)).toBe("ok");
  });

  it("clears a single key or the whole store", () => {
    setCached("a", 1, 1_000);
    setCached("b", 2, 1_000);
    clearCache("a");
    expect(getCached("a")).toBeUndefined();
    expect(getCached("b")).toBe(2);
    clearCache();
    expect(getCached("b")).toBeUndefined();
  });
});
