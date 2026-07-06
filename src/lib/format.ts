/** 원화 포맷 (예: 45000 → "45,000원"). 0/음수도 그대로 표기 */
export function won(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "-";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

/** 수익률(%) 포맷 */
export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}
