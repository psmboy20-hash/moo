import type { ProductIdentity } from "@/lib/types";

/** 지역 신호 → 정규화 키 */
const REGION_SIGNALS: Record<string, RegExp> = {
  JP: /일본|japan|jpn|\bjp\b|ntsc-?j|cero|아시아.*일본/i,
  US: /북미|미국|usa?\b|\bus\b|ntsc-?u|esrb|north america/i,
  EU: /유럽|europe|\beu\b|pal\b|pegi/i,
  ASIA: /아시아|asia|asian|한국|korea|kor\b/i,
};

function detectRegions(text: string): Set<string> {
  const found = new Set<string>();
  for (const [key, re] of Object.entries(REGION_SIGNALS)) {
    if (re.test(text)) found.add(key);
  }
  return found;
}

/** 검색·비교용 토큰화 (2자 이상 영숫자/한글) */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

const STOPWORDS = new Set(["the", "for", "with", "and", "new", "판매", "정품", "택포", "가격", "상품", "개봉"]);

/** 공백·기호 제거한 문자 정규화 (공백 없는 일본어 제목 포함 매칭용) */
function normalizeCore(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * 하나의 후보명(name 또는 alias)이 제목과 동일 제품을 가리키는지 점수화.
 * 1) 토큰 겹침 비율(공백 있는 영문 등) 2) 정규화 포함(공백 없는 CJK·부분표기) 둘 다 시도.
 */
function scoreCandidate(titleTokens: Set<string>, titleCore: string, candidate: string): number {
  const nameTokens = tokenize(candidate).filter((t) => !STOPWORDS.has(t));
  let ratio = 0;
  if (nameTokens.length > 0) {
    ratio = nameTokens.filter((t) => titleTokens.has(t)).length / nameTokens.length;
  }
  // 포함 매칭: 후보 핵심 문자열(6자 이상)이 제목에 통째로 들어있으면 동일 후보로 인정
  const core = normalizeCore(candidate);
  if (core.length >= 6 && titleCore.includes(core)) return 1;
  return ratio;
}

/**
 * 후보 매물 제목이 식별된 제품과 동일한지 검증한다 (순수 함수).
 * 이미지 대조가 불가한 텍스트 소스이므로, 제품명(+다국어 별칭) 겹침 + 지역판 충돌로 판별한다.
 * 시장별 제목 언어가 달라도(예: Yahoo=일본어) name과 별칭 중 하나만 맞으면 매칭된다.
 *
 * @returns matched 여부와 사유
 */
export function verifyMatch(title: string, identity: ProductIdentity): { matched: boolean; reason: string } {
  const titleTokens = new Set(tokenize(title));
  const titleCore = normalizeCore(title);

  // 매칭에 쓸 후보명: 식별명 + 다국어 별칭
  const candidates = [identity.name, ...(identity.aliases ?? [])].filter((c) => c && c.trim().length > 0);
  const hasUsableName = candidates.some((c) => tokenize(c).filter((t) => !STOPWORDS.has(t)).length > 0);
  if (!hasUsableName) {
    // 식별 제품명이 비면 검증 불가 → 통과시키되 신뢰도 낮음
    return { matched: true, reason: "제품명 없음: 검증 생략" };
  }

  const best = Math.max(0, ...candidates.map((c) => scoreCandidate(titleTokens, titleCore, c)));

  // 핵심 키워드의 절반 이상이 제목에 있어야(또는 별칭 포함 매칭) 동일 후보로 인정
  if (best < 0.5) {
    return { matched: false, reason: `제품명 불일치 (최대 겹침 ${Math.round(best * 100)}%)` };
  }

  // 지역판 충돌 제거: 식별 지역과 제목 지역이 모두 명확하고 서로 다르면 제외
  const identityRegions = detectRegions(`${identity.region} ${identity.regionCode}`);
  const titleRegions = detectRegions(title);
  if (identityRegions.size > 0 && titleRegions.size > 0) {
    const intersects = [...identityRegions].some((r) => titleRegions.has(r));
    if (!intersects) {
      return {
        matched: false,
        reason: `지역판 불일치 (식별 ${[...identityRegions].join("/")} vs 제목 ${[...titleRegions].join("/")})`,
      };
    }
  }

  return { matched: true, reason: `제품명 겹침 ${Math.round(best * 100)}%` };
}

/** 매물 목록에 matched 플래그를 채워 반환한다 (원본 불변) */
export function markMatches<T extends { title: string; matched: boolean }>(
  listings: T[],
  identity: ProductIdentity,
): T[] {
  return listings.map((l) => ({ ...l, matched: verifyMatch(l.title, identity).matched }));
}

/**
 * 동일 제품 매칭 신뢰도(0~100)를 산출한다 (순수 함수).
 * 구성: 제품 식별 정확도(이미지) + 매칭 표본 지지도 + 미상 식별명 패널티.
 * 신뢰도가 낮으면 오탐 위험이 커 사용자 확인이 필요하다.
 */
export function computeMatchConfidence(
  identity: ProductIdentity,
  matchedSoldCount: number,
  matchedActiveCount: number,
): number {
  // 식별명이 비었거나 '미상'이면 매칭 근거가 약함
  const nameTokens = tokenize(identity.name).filter((t) => !STOPWORDS.has(t));
  if (nameTokens.length === 0) return 20;

  const support = Math.min(100, (matchedSoldCount + matchedActiveCount) * 15);
  // 이미지 식별 정확도 70% + 표본 지지도 30% 가중
  const raw = identity.accuracy * 0.7 + support * 0.3;
  // 매칭된 근거가 아예 없으면 상한을 낮춘다
  const cap = matchedSoldCount + matchedActiveCount === 0 ? 45 : 100;
  return Math.max(0, Math.min(cap, Math.round(raw)));
}
