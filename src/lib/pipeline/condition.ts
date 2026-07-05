import type { ConditionTier, ProductIdentity } from "@/lib/types";

/**
 * 제목/설명 텍스트에서 상태 티어를 분류한다 (순수 함수).
 * 우선순위: SEALED(미개봉) > LOOSE(알만/소프트만) > CIB(박스완전) > UNKNOWN.
 * 한국어/일본어/영어 키워드를 모두 인식한다.
 */
const SEALED_RE =
  /미개봉|미사용\s*미개봉|새제품|new\s*sealed|factory\s*sealed|brand\s*new|未開封|新品未開封|シュリンク|sealed\b/i;
const LOOSE_RE =
  /소프트만|칩만|알만|본체만|디스크만|loose|cart(ridge)?\s*only|disc\s*only|game\s*only|ソフトのみ|カセットのみ|本体のみ|ディスクのみ|裸/i;
const CIB_RE =
  /박스\s*포함|풀박스|풀셋|완전\s*구성|설명서\s*포함|complete\s*in\s*box|\bcib\b|w\/?\s*box|boxed|with\s*box|箱付き|箱有|説明書付き|完品/i;

export function classifyTierFromText(text: string): ConditionTier {
  if (!text) return "UNKNOWN";
  if (SEALED_RE.test(text)) return "SEALED";
  if (LOOSE_RE.test(text)) return "LOOSE";
  if (CIB_RE.test(text)) return "CIB";
  return "UNKNOWN";
}

/**
 * 국내 상품(식별 정보)의 상태 티어를 판정한다.
 * sealed 플래그가 우선, 없으면 condition/boxState 텍스트로 분류.
 */
export function tierOfIdentity(identity: ProductIdentity): ConditionTier {
  if (identity.sealed === true) return "SEALED";
  const text = `${identity.condition} ${identity.boxState} ${identity.components.join(" ")}`;
  const t = classifyTierFromText(text);
  if (t !== "UNKNOWN") return t;
  // 구성품에 박스/설명서가 있으면 CIB로 근사
  if (identity.components.some((c) => /박스|박스\b|box|설명서|manual|케이스|case/i.test(c))) return "CIB";
  return "UNKNOWN";
}

/** 리스트에 conditionTier를 채워 반환 (원본 불변) */
export function tagConditionTiers<T extends { title: string; conditionTier?: ConditionTier }>(listings: T[]): T[] {
  return listings.map((l) => ({ ...l, conditionTier: classifyTierFromText(l.title) }));
}
