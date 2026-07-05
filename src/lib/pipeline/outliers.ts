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

/**
 * 중앙값 대비 극단적으로 낮은 노이즈를 제거한다 (순수 함수).
 * 야후옥션 "1円 시작 → 낙찰 1엔" 정크 매물처럼 실제 시세가 아닌 값이
 * 보수 시세를 왜곡하는 것을 막는다. 정상적인 저가(예: 소프트only/loose)는
 * 남기도록 비율을 낮게(기본 5%) 잡는다.
 *
 * @param minRatioOfMedian 중앙값 대비 이 비율 미만이면 제거 (기본 0.05)
 */
export function removeLowNoise(values: number[], minRatioOfMedian = 0.05): number[] {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0);
  if (clean.length < 4) return clean;
  const med = median(clean);
  if (med <= 0) return clean;
  const floor = med * minRatioOfMedian;
  const kept = clean.filter((v) => v >= floor);
  return kept.length > 0 ? kept : clean;
}
