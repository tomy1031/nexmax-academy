import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

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

  /*
   * **同じ 値に なるのは、中身が 同じ ときだけ**。
   *
   * ここは もともと「9割より 多くが ちがう 値」で 見て いたが、それは
   * *たまたま* 成り立って いた だけだった。朝礼・夕礼の こえは
   * **同じ 文・同じ 声を 5日ぶん 別の URL に 置く**（`asakaiLineSchema` の 決まり）ので、
   * 中身が 同じ ファイルが 数十 できる——中身の ハッシュなら 同じ 値に なるのが 正しい。
   * 割合で 見て いると、正しい 増やし方で 赤に なる（2026-09-11 に 実発生。
   * 夕礼の 音づくりが ここで 落ちて、20分ぶんの こえが 消えた）。
   *
   * 見張りたいのは「中身を 見て いない」こと なので、**同じ 値の ファイルは
   * 大きさも 同じ**かを 見る。定数を 入れて いたら、大きさの ちがう ファイルが
   * 同じ 値で 並ぶので すぐ 分かる。読み込まずに 大きさだけ 見る（30MiB あるので）。
   */
  it("版番号が 同じなのは 中身が 同じ ファイルだけ", () => {
    const all = Object.values(ASSET_VERSIONS);
    expect(all.length).toBeGreaterThan(100);
    // ぜんぶ 同じ 値なら「中身を 見て いない」ので 事故に 気づけない
    expect(new Set(all).size).toBeGreaterThan(100);

    const byVersion = new Map<string, string[]>();
    for (const [src, version] of Object.entries(ASSET_VERSIONS)) {
      byVersion.set(version, [...(byVersion.get(version) ?? []), src]);
    }
    const mixed: string[][] = [];
    for (const sources of byVersion.values()) {
      if (sources.length < 2) continue;
      const sizes = new Set(
        sources.map((src) => {
          const path = join("public", src);
          return existsSync(path) ? statSync(path).size : -1;
        }),
      );
      if (sizes.size > 1) mixed.push(sources);
    }
    expect(mixed).toEqual([]);
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
