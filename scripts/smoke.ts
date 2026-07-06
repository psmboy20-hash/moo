/**
 * 실사용 스모크 진단 — 각 단계가 서버 환경에서 실제로 동작하는지 격리 측정.
 * 실행: npx tsx scripts/smoke.ts <국내링크>
 * 키(ANTHROPIC/EBAY/JINA) 유무와 무관하게 "어디서 막히는지"를 드러낸다.
 */

import { extractListing } from "@/lib/extract";
import { fetchViaJina, resolveFinalUrl } from "@/lib/extract/http";
import { analyze } from "@/lib/pipeline/analyze";

const url = process.argv[2] ?? "https://go.bgzt.link/s5889z";

function line(label: string, value: unknown) {
  console.log(`  ${label.padEnd(22)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function main() {
  console.log("환경 키:");
  for (const k of ["ANTHROPIC_API_KEY", "EBAY_APP_ID", "JINA_API_KEY"]) {
    line(k, process.env[k] ? "SET" : "(unset)");
  }

  console.log("\n[1] 단축 URL 해석");
  const finalUrl = await resolveFinalUrl(url);
  line("입력", url);
  line("최종", finalUrl);

  console.log("\n[2] 국내 상품 추출");
  let listing: Awaited<ReturnType<typeof extractListing>> = null;
  try {
    listing = await extractListing(url);
  } catch (e) {
    line("추출 예외", String(e instanceof Error ? e.message : e).slice(0, 120));
  }
  if (!listing) {
    line("결과", "null → 수동 입력 폴백 필요");
  } else {
    line("제목", listing.title.slice(0, 60));
    line("가격KRW", listing.priceKRW);
    line("이미지 수", listing.images.length);
    line("첫 이미지", listing.images[0]?.slice(0, 70) ?? "(없음)");
  }

  console.log("\n[3] jina 프록시 도달성 (eBay sold 검색 샘플)");
  const probe = "https://www.ebay.com/sch/i.html?_nkw=pokemon&LH_Sold=1&LH_Complete=1";
  try {
    const html = await fetchViaJina(probe, { format: "html" });
    line("응답 길이", html.length);
    line("차단 흔적", /robot|captcha|access denied/i.test(html.slice(0, 2000)) ? "의심됨" : "없음");
  } catch (e) {
    line("jina 실패", String(e instanceof Error ? e.message : e).slice(0, 120));
  }

  if (listing) {
    console.log("\n[4] 전체 파이프라인 (실 AI 키 없으면 저하 동작)");
    try {
      const result = await analyze(listing);
      line("식별명", result.identity.name || "(비어있음)");
      line("식별정확도", result.identity.accuracy);
      line("저하모드(degraded)", result.degraded);
      const bySrc: Record<string, number> = {};
      for (const s of result.sold.listings) bySrc[s.source] = (bySrc[s.source] ?? 0) + 1;
      line("sold 소스별", bySrc);
      line("sold 총건수", result.sold.listings.length);
      line("active 총건수", result.active.listings.length);
      line("매칭 신뢰도", result.matchConfidence);
      line("최적시장", result.bestMarket ?? "(없음)");
      line("판정", result.verdict.status);
      line("순이익", result.profit.netProfit);
      for (const s of result.sourceStatus) {
        line(`[${s.kind}] ${s.source}`, s.ok ? `${s.count}건` : `실패(${s.error ?? ""})`);
      }
      for (const n of result.notes) line("note", n);
    } catch (e) {
      line("분석 예외", String(e instanceof Error ? e.message : e).slice(0, 160));
    }
  }
  console.log("\n완료.");
}

main().catch((e) => {
  console.error("치명적:", e);
  process.exit(1);
});
