import type { SoldListing } from "@/lib/types";

/**
 * 판매완료 시세 최신성 필터 (순수 함수).
 *
 * 데이터 한계: 소스별로 판매일 신뢰도가 다르다.
 * - Yahoo: "MM/DD"만 있어 연도 불명 → 파싱 불가로 간주(유지)
 * - eBay(jina)/Mercari: 판매일 대부분 없음 → 유지
 * - PriceCharting: 요약 기준가라 날짜 없음 → 유지
 * 따라서 ISO(YYYY-MM-DD) 형태로 날짜가 명확한 항목만 컷오프보다 오래되면 제외하고,
 * 날짜가 없거나 파싱 불가한 항목은 그대로 유지한다(과도한 삭제 방지).
 *
 * @param nowMs 기준 시각(ms). Date.now() 대신 주입받아 순수성 유지.
 */
export function parseIsoDateMs(soldDate?: string): number | null {
  if (!soldDate) return null;
  // YYYY-MM-DD 또는 YYYY/MM/DD (연도 4자리가 있어야 신뢰)
  const m = soldDate.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  return Number.isFinite(t) ? t : null;
}

/** 컷오프(개월)보다 오래된 '날짜가 명확한' 판매완료만 제외. 날짜 없는 건 유지. */
export function filterRecentSold(sold: SoldListing[], months: number, nowMs: number): SoldListing[] {
  const cutoff = nowMs - months * 30 * 24 * 60 * 60 * 1000;
  return sold.filter((l) => {
    const t = parseIsoDateMs(l.soldDate);
    if (t === null) return true; // 날짜 불명 → 유지
    return t >= cutoff;
  });
}

/** 제외된(오래된) 항목 수 — 안내 문구용 */
export function countDroppedByRecency(sold: SoldListing[], months: number, nowMs: number): number {
  return sold.length - filterRecentSold(sold, months, nowMs).length;
}
