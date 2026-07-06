import { Analyzer } from "@/components/analyzer";
import { SiteNav } from "@/components/site-nav";
import { APP_CONFIG } from "@/config/app-config";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-10 sm:py-16">
      <SiteNav />
      <header className="mb-8 space-y-2">
        <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">{APP_CONFIG.name}</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          국내 상품 링크 하나로 이미지 기반 제품 식별 → 해외 판매완료 시세·현재 경쟁가 분석 → 실순이익과 매입 여부를
          즉시 판단합니다.
        </p>
      </header>

      <Analyzer />

      <footer className="mt-12 text-center text-muted-foreground text-xs">
        판매완료 시세를 실제 시세 기준으로, 현재 판매중 가격은 판매가 제안·경쟁 분석에만 사용합니다.
      </footer>
    </main>
  );
}
