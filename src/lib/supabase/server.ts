import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 서버 클라이언트 (개인용 단일 사용자).
 * 키가 없으면 저장 기능은 비활성화되고, 앱의 분석 기능은 그대로 동작한다.
 * 서비스 롤 키는 서버(API 라우트)에서만 사용한다.
 */

const URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 저장/대시보드 기능 사용 가능 여부 */
export function hasSupabase(): boolean {
  return Boolean(URL && SERVICE_ROLE);
}

let cached: SupabaseClient | null = null;

/** 서버 클라이언트. 미설정이면 null. */
export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!cached) {
    cached = createClient(URL as string, SERVICE_ROLE as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
