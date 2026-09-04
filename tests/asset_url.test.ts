import { describe, expect, it } from "vitest";
import { assetUrl } from "@/lib/asset-url";
import { ASSET_VERSIONS } from "@/content/asset-versions.generated";

/*
 * 2026-09-04 に 実発生した 事故の 見張り。
 * リスニングの 音を 作り直して 出したのに **古い 音が 鳴った**——
 * `_headers` の `stale-while-revalidate=86400` が 最大 24時間 古い ものを 返す ため。
 * URL に 中身の 版番号が 付いて いれば、差しかえは 別の URL に なって 必ず 届く。
 */
describe("資産の URL に 版番号を 付ける", () => {
  it("教材が 指す 音に 版番号が 付く", () => {
    const src = "/audio/listening/kaisha_shugyo_keitai_listening.wav";
    expect(ASSET_VERSIONS[src]).toBeTruthy();
    expect(assetUrl(src)).toBe(`${src}?v=${ASSET_VERSIONS[src]}`);
  });

  it("絵にも 付く", () => {
    const src = "/img/listening/kaisha_shugyo_keitai/cover.webp";
    expect(assetUrl(src)).toBe(`${src}?v=${ASSET_VERSIONS[src]}`);
  });

  it("版番号は ファイルごとに ちがう（中身の ハッシュだから）", () => {
    const all = Object.values(ASSET_VERSIONS);
    expect(all.length).toBeGreaterThan(100);
    // ぜんぶ 同じ 値なら「中身を 見て いない」ので 事故に 気づけない
    expect(new Set(all).size).toBeGreaterThan(all.length * 0.9);
  });

  it("外の URL・data:・すでに 問い合わせの ある URL は 触らない", () => {
    expect(assetUrl("https://example.com/a.wav")).toBe("https://example.com/a.wav");
    expect(assetUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(assetUrl("/img/a.webp?x=1")).toBe("/img/a.webp?x=1");
  });

  it("一覧に 無い URL は そのまま 返す（R2 などの 配信先）", () => {
    expect(assetUrl("/audio/not-in-repo.wav")).toBe("/audio/not-in-repo.wav");
  });

  it("空・未設定は そのまま", () => {
    expect(assetUrl(undefined)).toBeUndefined();
    expect(assetUrl("")).toBe("");
  });
});
