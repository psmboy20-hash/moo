"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOMESTIC_PLATFORMS, type DomesticPlatform, type ManualListing } from "@/lib/types";

const PLATFORM_LABEL: Record<DomesticPlatform, string> = {
  joonggonara: "중고나라",
  bunjang: "번개장터",
  smartstore: "스마트스토어",
  "naver-shopping": "네이버쇼핑",
  other: "기타",
};

export function ManualInputForm({
  defaultUrl,
  onSubmit,
  loading,
}: {
  defaultUrl?: string;
  onSubmit: (listing: ManualListing) => void;
  loading: boolean;
}) {
  const [platform, setPlatform] = useState<DomesticPlatform>("other");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [imagesText, setImagesText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const images = imagesText
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!title.trim()) return setError("상품명을 입력하세요.");
    if (images.length === 0) return setError("이미지 URL을 최소 1개 입력하세요.");
    const priceNum = Number.parseInt(price.replace(/[^\d]/g, ""), 10);
    onSubmit({
      url: defaultUrl ?? "",
      platform,
      title: title.trim(),
      priceKRW: Number.isFinite(priceNum) ? priceNum : 0,
      images,
      description: description.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="platform">플랫폼</Label>
        <select
          id="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as DomesticPlatform)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {DOMESTIC_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="title">상품명</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 젤다의 전설 티어스 오브 더 킹덤 일본판 미개봉"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="price">국내 판매가 (원)</Label>
        <Input
          id="price"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="예: 45000"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="images">이미지 URL (줄바꿈/쉼표로 여러 개)</Label>
        <Textarea
          id="images"
          value={imagesText}
          onChange={(e) => setImagesText(e.target.value)}
          placeholder="https://..."
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">설명 (선택)</Label>
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "분석 중…" : "이 정보로 분석"}
      </Button>
    </form>
  );
}
