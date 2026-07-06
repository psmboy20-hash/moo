import type { ActiveListing, DomesticListing, ProductIdentity, SoldListing } from "@/lib/types";

export interface Fixture {
  listing: DomesticListing;
  identity: ProductIdentity;
  sold: SoldListing[];
  active: ActiveListing[];
}

function sold(source: SoldListing["source"], title: string, priceKRW: number): SoldListing {
  return { source, title, priceOriginal: priceKRW, currency: "KRW", priceKRW, url: "#", matched: true };
}

function active(source: ActiveListing["source"], title: string, priceKRW: number, shipping = 12_000): ActiveListing {
  return {
    source,
    title,
    priceOriginal: priceKRW,
    currency: "KRW",
    priceKRW,
    shippingKRW: shipping,
    buyerPerceivedKRW: priceKRW + shipping,
    url: "#",
    matched: true,
  };
}

/**
 * 결정적 검증용 fixture. 실제 스크래핑이 차단된 환경에서도
 * 파이프라인 3~17단계와 6카드 렌더를 재현 가능하게 한다.
 */
export const FIXTURES: Record<string, Fixture> = {
  // 수익이 명확히 나는 케이스 → RECOMMEND
  zelda: {
    listing: {
      url: "https://example.com/fixture/zelda",
      platform: "bunjang",
      title: "젤다의 전설 티어스 오브 더 킹덤 닌텐도 스위치 일본판 미개봉",
      priceKRW: 45_000,
      description: "미개봉 새제품, 일본판 CERO. 정품입니다.",
      images: ["https://placehold.co/600x600?text=Zelda+Front", "https://placehold.co/600x600?text=Zelda+Back"],
    },
    identity: {
      name: "Zelda Tears of the Kingdom Nintendo Switch",
      platform: "Nintendo Switch",
      region: "일본판",
      version: "일반판",
      condition: "미개봉",
      sealed: true,
      boxState: "완전 밀봉",
      components: ["게임 카트리지", "케이스"],
      coverDesign: "골드 트라이포스 로고",
      regionCode: "CERO (Japan)",
      accuracy: 92,
      missingPhotos: [],
    },
    sold: [
      sold("ebay", "Zelda Tears of the Kingdom Switch Japan", 150_000),
      sold("ebay", "Zelda TOTK Nintendo Switch JP sealed", 158_000),
      sold("mercari", "ゼルダの伝説 ティアーズ オブ ザ キングダム", 98_000),
      sold("mercari", "Zelda Tears Kingdom Switch Japan", 162_000),
      sold("yahoo-auction", "ゼルダ ティアキン Switch 未開封", 105_000),
      sold("pricecharting", "Zelda Tears of the Kingdom (cib)", 155_000),
      sold("ebay", "Zelda TOTK Switch Japan MISLABELED LOT", 480_000), // 이상치
    ],
    active: [
      active("ebay", "Zelda Tears of the Kingdom Switch Japan New", 185_000),
      active("ebay", "Zelda TOTK Nintendo Switch JP sealed", 195_000),
      active("mercari", "ゼルダ ティアキン Switch 新品", 120_000),
      active("yahoo-auction", "ゼルダ ティアーズ 未開封", 140_000),
      active("overseas-mall", "Zelda TOTK Japan import", 210_000),
    ],
  },

  // 애매한 케이스 → HOLD/CONDITIONAL 경계
  pokemon: {
    listing: {
      url: "https://example.com/fixture/pokemon",
      platform: "joonggonara",
      title: "포켓몬 카드 151 강화확장팩 박스 중고",
      priceKRW: 90_000,
      description: "개봉 후 보관, 상태 양호",
      images: ["https://placehold.co/600x600?text=Pokemon+151"],
    },
    identity: {
      name: "Pokemon Card 151 Enhanced Expansion Pack Box",
      platform: "Pokemon TCG",
      region: "일본판",
      version: "강화확장팩",
      condition: "중고 개봉",
      sealed: false,
      boxState: "약간 눌림",
      components: ["부스터팩", "박스"],
      coverDesign: "뮤 일러스트",
      regionCode: "Japan",
      accuracy: 78,
      missingPhotos: ["박스 하단 바코드"],
    },
    sold: [
      sold("ebay", "Pokemon Card 151 Enhanced Expansion Pack Box Japanese", 118_000),
      sold("mercari", "ポケモンカード 151 BOX", 112_000),
      sold("yahoo-auction", "Pokemon 151 Enhanced Expansion Pack Box", 120_000),
    ],
    active: Array.from({ length: 28 }, (_, i) =>
      active("ebay", `Pokemon Card 151 Enhanced Expansion Pack Box Japanese #${i}`, 125_000 + i * 500),
    ),
  },
};

export function getFixture(name: string): Fixture | null {
  return FIXTURES[name] ?? null;
}
