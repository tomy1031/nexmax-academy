/**
 * 資産（音・絵）の URL に 版番号を 付ける。
 *
 * ## 何を 直すための ものか（2026-09-04 に 実発生）
 * リスニングの 音を 作り直して 出したのに **古い 音が 鳴った**。
 * `public/_headers` の `/audio/*` `/img/*` に `stale-while-revalidate=86400` が
 * 付いて いて、**最大 24時間 古い ファイルを そのまま 返す**ため。
 * URL が 同じ かぎり、差しかえても 学習者には 届かない。
 *
 * ## なぜ 「?v=中身のハッシュ」なのか
 * - **変わった ファイルだけ** URL が 変わる。教室の 細い 回線で 全部を
 *   取り直させない（`_headers` を 一律で 短くする 案を 採らない 理由）
 * - ファイル名を 変えない ので、**教材データも 台帳も 書き換えなくて よい**
 * - 版番号は `npm run gen:content` が 中身から 作る（人が 更新を 忘れられない）
 *
 * 一覧に 無い URL（外部・R2・data:）は **そのまま 返す**。
 */
import { ASSET_VERSIONS } from "@/content/asset-versions.generated";

export function assetUrl(src: string | undefined): string | undefined {
  if (!src) return src;
  // 外部・data: は 触らない。すでに 問い合わせが 付いて いる ものも そのまま
  if (!src.startsWith("/") || src.includes("?")) return src;
  const version = ASSET_VERSIONS[src];
  return version ? `${src}?v=${version}` : src;
}
