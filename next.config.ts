import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// ビルド時のコミットSHAを /api/version に焼き込む（handoff が本番/STG=main かを照合する。願い #5）。
// git が無い環境でもビルドは止めない。
function buildGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  env: {
    BUILD_GIT_SHA: buildGitSha(),
    BUILD_TIME: new Date().toISOString(),
  },

  /**
   * 画像は `/_next/image` を通さず、静的アセットのまま配る。
   *
   * Cloudflare Workers では画像変換の紐づけ（IMAGES バインディング＝有料）が無いため、
   * `/_next/image` は**縮小も圧縮もせず元ファイルを素通し**する。つまり Worker の
   * 呼び出し1回（無料枠 10万/日にカウント）を画像1枚ごとに消費するだけで、得る物が無い。
   * 静的アセット直配信はカウント外・無制限（2026-08-25 授業20人同時プレイでの
   * 上限超過の対策。docs/deploy.md §0.7）。画像は作成時に WebP へ圧縮済み。
   */
  images: { unoptimized: true },

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
      // 名前が「ことばアーケード」から「単語テスト」に変わり、URLも移した（願い #280）。
      // 先生が授業で配ったリンクとブックマークを 404 にしないため、消さずに送る。
      { source: "/arcade", destination: "/wordtest", permanent: true },
      { source: "/arcade/:id", destination: "/wordtest/:id", permanent: true },
    ];
  },
};

// `next dev` から Cloudflare のバインディングを参照できるようにする（OpenNext 要件）。
initOpenNextCloudflareForDev();

export default nextConfig;
