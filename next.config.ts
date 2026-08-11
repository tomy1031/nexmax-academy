import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // ホームディレクトリ側の package-lock.json をワークスペース root と誤認させない。
  // 誤認すると standalone 出力の依存トレースがずれて Workers 上で壊れる。
  turbopack: { root: import.meta.dirname },

  /**
   * 古いURLを いまのURLへ送る。
   *
   * ステージは `/stage/<id>` から `/<id>` へ、教材は `/<ステージ>/<種別>` へ移した
   *（URLを見ただけで「どのステージの何か」が分かるようにするため）。
   * 消さずに送り返すのは、配ったリンクとブックマークを 404 にしないため。
   *
   * 教材の古いURL（`/manga/<id>` など）はここでは書けない。行き先が
   * 「その教材が入っているステージ」で、データを読まないと決まらないので、
   * ページ側で調べて redirect する（src/lib/stage-lookup.ts）。
   */
  async redirects() {
    return [
      { source: "/stage/:id", destination: "/:id", permanent: true },
      // ログインの画面は無くなり、タイトル画面（＝最初の画面）がログインを兼ねる（願い #13）。
      // 配ったリンクとブックマークを 404 にしないため、消さずに送る。
      { source: "/login", destination: "/", permanent: false },
    ];
  },
};

// `next dev` から Cloudflare のバインディングを参照できるようにする（OpenNext 要件）。
initOpenNextCloudflareForDev();

export default nextConfig;
