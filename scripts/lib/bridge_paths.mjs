/**
 * ブリッジが読み書きしてよいファイル名の判定（`scripts/codex_bridge.mjs` から使う）
 *
 * ここだけ別ファイルにしてあるのは**テストしたいから**である。
 * ブリッジ本体は起動と同時にフォルダを作り Codex を spawn するので、
 * テストから import できない。
 *
 * ここが破れると何が起きるか: ブリッジは公開中のアプリから叩ける口であり
 *（`ws://127.0.0.1` は https のページからも開ける。2026-08-06 実測）、
 * ファイル名に `..` を書けると **先生のPCの任意のファイルが読まれる**。
 * 合言葉で入口は守っているが、守りは1枚では足りない。
 */
import path from "node:path";

/**
 * 受け取ってよい名前。
 * 拡張子まで固定するのは、`.mjs` や `.env` のような名前を最初から作らせないため。
 */
export const SAFE_NAME = /^[a-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$/;

/**
 * 作業フォルダの中の1ファイルへ解決する。外へ出る名前は null。
 *
 * 名前を絞ってあるので `..` は書けないが、**結合したあとに親フォルダを
 * 確かめる**のは残しておく。将来 SAFE_NAME をゆるめた人が、ここの検査に守られる。
 */
export function resolveInWorkdir(workdir, name) {
  if (typeof name !== "string" || !SAFE_NAME.test(name)) return null;
  const full = path.join(workdir, name);
  return path.dirname(full) === workdir ? full : null;
}
