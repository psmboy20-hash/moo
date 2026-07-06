# 리셀 수익 분석기 (Reselling Profit Analyzer)

국내 중고/쇼핑 링크 **하나**를 넣으면 → 이미지로 제품을 식별하고 → 해외(eBay/Merc/Yahoo/PriceCharting)
**판매완료 시세**와 **판매중 가격**을 모아 → 수수료·배송·환율·리스크·매입가를 모두 뺀 **실순이익**으로
"사면 돈이 되는지, 얼마까지 매입해도 되는지, 해외에 얼마로 올릴지"를 판단해 주는 개인용 스카우팅 도구.

## 핵심 원칙

- **이미지 우선**: 판매자 제목은 틀릴 수 있으므로 상품 이미지를 1차 기준으로 식별한다.
- **판매완료 vs 판매중 분리**: 판매완료(sold) = 실제 시세 판정의 근거. 판매중(active) = 경쟁가·내 판매가 제안용. 절대 섞지 않는다.
- **실순이익 기준**: 단순 가격차익이 아니라 수수료·배송·환율·리스크·매입가를 모두 차감한 순이익/수익률로 판정.

## 무엇을 보여주나 (6카드)

결론(매입추천/조건부/보류/비추천) · 제품 식별 · 판매완료 시세(티어별) · 현재 판매중 가격 · 판매가 제안 · 매입 판단.
최적 판매처(eBay US / Mercari JP / Yahoo JP) 배지와 시장별 순이익 비교, 판매 회전기간(sell-through), 매칭 신뢰도까지.

저장·관심목록·매입/판매 기록 대시보드(`/watchlist`, `/inventory`)는 Supabase 키가 있을 때 켜진다.

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Zod · Biome · Vitest.
데이터 소스는 실패 시 빈 결과를 반환하는 플러그블 구조라, 봇 차단이 있어도 앱은 남은 소스로 계속 동작한다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 필요한 키만 채우면 됨 (전부 선택)
npm run dev                  # http://localhost:3000
```

검증:

```bash
npm run check       # Biome 린트/포맷
npx tsc --noEmit    # 타입 체크
npm run test        # Vitest (순수 계산 + fixture)
npm run build       # 프로덕션 빌드
```

진단(각 단계가 실제로 동작하는지 격리 측정):

```bash
npx tsx scripts/smoke.ts "<국내상품링크>"
```

## 환경 변수 (전부 선택 — 없으면 저하 동작)

키가 하나도 없어도 앱은 동작한다. 아래는 각 키가 **무엇을 켜는지**와 우선순위다.
`.env.example`에 상세 주석이 있다.

| 변수 | 켜지는 기능 | 없을 때 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 이미지 우선 제품 식별(비전 API) — 배포 환경 필수 | 로컬 `claude` CLI → 제목 기반 저하 |
| `JINA_API_KEY` | eBay/Yahoo 봇차단 우회 프록시 안정화(레이트리밋 완화) | 무료 티어(간헐 실패, 새로고침 필요) |
| `EBAY_APP_ID` / `EBAY_CERT_ID` | eBay 판매중 공식 Browse API + 이미지 시각 매칭 | HTML 스크랩(차단되면 빈 결과) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | 저장·관심목록·매입/판매 기록 대시보드 | 분석기만 동작(대시보드는 "꺼짐" 안내) |

> **영향도 순**: `ANTHROPIC_API_KEY`(식별 정확도) > `JINA_API_KEY`(시세 수집 안정성) > `EBAY_*`(eBay 데이터) > `SUPABASE_*`(저장).

## 배포

배포 경로는 두 가지다. **컨테이너(Railway/Render)** 는 Playwright(Mercari/Yahoo 렌더링)까지 돌아가고
미리보기 SSO 벽이 없어 실사용에 유리하다. **Vercel**은 설정이 가장 간단하지만 서버리스라 Playwright가 없다.

### 컨테이너 배포 — Railway / Render (권장)

저장소에 `Dockerfile`(Chromium 포함)과 `render.yaml`(Render Blueprint)이 있다.

- **Render**: 대시보드 → **New → Blueprint** → 이 저장소 연결 → `render.yaml` 그대로 서비스 생성.
  이후 Environment 탭에서 표의 키 값을 입력(모두 `sync: false`라 코드에 노출되지 않음).
  `render.yaml`의 `plan: free`(512MB)는 Chromium에 빠듯 → 수집이 자주 비면 `starter`(2GB)로 상향.
- **Railway**: **New Project → Deploy from Repo** → Dockerfile 자동 감지 → Variables에 키 입력.
  포트는 주입되는 `PORT`를 `next start`가 자동으로 따른다.
- Dockerfile은 `playwright install --with-deps chromium`으로 브라우저와 시스템 라이브러리를 함께 설치한다.

### Vercel 배포

1. **환경 변수 등록** — Vercel 프로젝트 → Settings → Environment Variables 에 위 표의 값을 추가.
   `SUPABASE_SERVICE_ROLE_KEY`는 **서버 전용**이므로 클라이언트(NEXT_PUBLIC_)로 노출 금지.
2. **미리보기 접근** — 프리뷰 배포에 Vercel Authentication(SSO)이 켜져 있으면 로그인 없이는 열리지 않는다.
   직접 테스트하려면 Settings → Deployment Protection에서 보호를 조정하거나 프로덕션 도메인을 사용.
3. 서버리스라 **Playwright(Mercari/Yahoo 렌더링 소스)는 동작하지 않는다.** PriceCharting·Yahoo(jina)·eBay(키)로 동작.

### 공통 — Supabase 대시보드 활성화

저장·관심목록·기록 기능을 쓰려면 배포처와 무관하게: supabase.com에서 프로젝트 생성 →
SQL Editor에서 `supabase/schema.sql` 실행 → `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 등록 → 재배포.
값이 없으면 대시보드는 "꺼짐"으로 안내되고 분석기는 그대로 동작한다.

## 데이터 소스 현실 (알아둘 제약)

- **PriceCharting**: 직접 fetch 가능(게임·카드·수집품 위주). 가장 안정적인 판매완료 시세 근거.
- **Yahoo Auction**: jina 프록시로 낙찰가 조회 가능. 무료 티어라 간헐 실패 → `JINA_API_KEY` 권장.
- **eBay**: 판매완료(sold) 검색은 서버에서 봇 차단됨(로봇 페이지 반환). 판매중은 `EBAY_*` 키로 공식 API 사용 시 안정적.
- **Mercari**: Playwright(ja-JP) 필요. 서버리스 환경에 따라 제약.
- 결과 화면의 **"해외 소스 수집 현황"** 스트립에서 소스별 수집/실패를 직접 확인할 수 있다. 얇거나 실패하면 잠시 후 새로고침.

## 프로젝트 구조

```
src/
  app/            분석 페이지(/) · 대시보드(/watchlist,/inventory) · API 라우트
  components/     결과 6카드 · 입력 폼 · 네비
  lib/
    extract/      국내 링크 추출(번개장터/스마트스토어/네이버 등) + fetch 유틸
    ai/           3단계 폴백 이미지 식별(API→CLI→제목) + 검색어 생성
    sources/      해외 시세 스크래퍼(ebay/mercari/yahoo/pricecharting) + 응답 캐시
    pipeline/     순수 계산(매칭·이상치·티어별 시세·멀티마켓 순이익·판정)
    config/       수수료·배송(무게)·환율·임계값 상수
    supabase/     저장 계층(키 가드)
supabase/schema.sql   analyses · watchlist · inventory 테이블
scripts/smoke.ts      단계별 실사용 진단 도구
```
