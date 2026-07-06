/**
 * AI 식별 실패 진단 채널.
 * 이미지 식별(API/CLI)이 실패하면 사유를 여기 기록해, 저하 모드일 때 결과 notes와
 * 서버 로그로 노출한다. (원인을 조용히 삼키지 않기 위한 최소 장치)
 */

let lastError = "";

/** 실패 사유 기록 (+ 서버 로그로도 출력 → Render/Railway Logs에서 확인 가능) */
export function setAiError(reason: string): void {
  lastError = reason.slice(0, 240);
  // 서버 로그에도 남긴다 (배포 환경 로그 확인용)
  console.error(`[ai] identify failed: ${lastError}`);
}

/** 마지막 실패 사유를 읽고 비운다 */
export function takeAiError(): string {
  const e = lastError;
  lastError = "";
  return e;
}
