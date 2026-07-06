import Link from "next/link";

import { APP_CONFIG } from "@/config/app-config";

/** 상단 네비게이션 (분석 / 관심목록 / 기록) */
export function SiteNav() {
  return (
    <nav className="mb-6 flex items-center gap-4 border-b pb-3 text-sm">
      <Link href="/" className="font-semibold">
        {APP_CONFIG.shortName}
      </Link>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          분석
        </Link>
        <Link href="/watchlist" className="hover:text-foreground">
          관심목록
        </Link>
        <Link href="/inventory" className="hover:text-foreground">
          기록
        </Link>
      </div>
    </nav>
  );
}
