/**
 * 아주 작은 인메모리 TTL 캐시.
 *
 * 목적: 봇 차단 우회용 프록시(r.jina.ai)는 무료 티어 레이트리밋이 빡빡하다.
 * 한 번의 분석에서 여러 소스가 같은 프록시를 두드리고, 저장·수동 새로고침으로
 * 짧은 시간에 같은 쿼리가 반복되면 429가 나기 쉽다. 성공 응답을 짧게 캐싱해
 * 중복 fetch를 흡수한다. 서버리스(웜 인스턴스)에서도 재사용된다.
 *
 * 의도적으로 단순하게: 만료는 접근 시 지연 정리, 총량은 상한으로 캡(가장 오래된 것부터 축출).
 * 서버 프로세스 메모리에만 존재하며 영속화하지 않는다(콜드스타트 시 자연 초기화).
 */

interface Entry<T> {
  value: T;
  /** 만료 시각 (epoch ms) */
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** 캐시 항목 수 상한. 초과 시 삽입 순서상 가장 오래된 항목부터 축출. */
const MAX_ENTRIES = 500;

/** 캐시된 값을 반환. 없거나 만료됐으면 undefined. */
export function getCached<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

/** 값을 TTL과 함께 저장. ttlMs가 0 이하면 캐싱하지 않는다. */
export function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (ttlMs <= 0) return;
  // 상한 초과 시 Map 삽입 순서(가장 오래된 키)부터 제거
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * 캐시 히트면 즉시 반환, 미스면 fn을 실행해 결과를 캐싱 후 반환.
 * fn이 throw하면 캐싱하지 않고 그대로 전파한다(실패는 다음 호출에서 재시도).
 */
export async function withTtlCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  setCached(key, value, ttlMs);
  return value;
}

/** 테스트/수동 무효화용. 키를 주면 해당 항목만, 없으면 전체 비운다. */
export function clearCache(key?: string): void {
  if (key === undefined) store.clear();
  else store.delete(key);
}
