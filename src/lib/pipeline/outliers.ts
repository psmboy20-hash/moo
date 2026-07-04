/**
 * 이상치 제거 유틸 (순수 함수).
 * 판매완료 시세는 잘못 매칭된 매물·비정상 낙찰가가 섞이므로 IQR 기반으로 걸러낸다.
 */

/** 정렬된 배열에서 분위수(선형 보간) */
export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const frac = pos - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * IQR(사분위 범위) 기반 이상치 제거.
 * 표본이 4개 미만이면 통계적으로 의미가 없어 원본을 그대로 반환한다.
 *
 * @param k IQR 승수 (기본 1.5 = 표준 튜키 울타리)
 */
export function removeOutliersIQR(values: number[], k = 1.5): number[] {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < 4) return clean;

  const sorted = [...clean].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - k * iqr;
  const upper = q3 + k * iqr;

  const filtered = sorted.filter((v) => v >= lower && v <= upper);
  // 모두 걸러지는 극단 상황 방지
  return filtered.length > 0 ? filtered : sorted;
}
