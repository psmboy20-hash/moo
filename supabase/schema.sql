-- 리셀 수익 분석기 — 개인용 대시보드 스키마 (단일 사용자)
-- Supabase 프로젝트의 SQL Editor에서 실행하세요.
-- owner 컬럼은 향후 멀티유저 확장을 위한 자리이며, 단일 사용자는 'me'를 사용합니다.

create extension if not exists "pgcrypto";

-- 분석 결과 스냅샷
create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner text not null default 'me',
  url text,
  title text,
  price_krw integer,
  verdict text,
  best_market text,
  net_profit integer,
  margin_pct numeric,
  match_confidence integer,
  result jsonb not null
);
create index if not exists analyses_owner_created_idx on analyses (owner, created_at desc);

-- 관심목록
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner text not null default 'me',
  title text not null,
  url text,
  note text,
  analysis_id uuid references analyses(id) on delete set null
);
create index if not exists watchlist_owner_created_idx on watchlist (owner, created_at desc);

-- 매입/판매 기록 (재고·실현손익)
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner text not null default 'me',
  title text not null,
  buy_price_krw integer not null,
  buy_date date,
  sell_price_krw integer,
  sell_date date,
  market text,
  status text not null default 'holding', -- holding | sold
  realized_profit_krw integer,
  analysis_id uuid references analyses(id) on delete set null
);
create index if not exists inventory_owner_created_idx on inventory (owner, created_at desc);

-- 주의: 개인용이라 RLS를 켜지 않았습니다. 공개 배포 시에는 접근 제어(비밀번호/Auth)를
-- 반드시 추가하세요. 서비스 롤 키는 서버에서만 사용합니다.
