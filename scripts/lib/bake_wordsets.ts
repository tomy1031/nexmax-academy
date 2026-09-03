/**
 * 単語テストの セットを **ブラウザが 取りに 来る 1枚の JSON** として 書き出す。
 *
 * 辞書（bake_dictionary.ts）と 同じ 病気の 直し。`/wordtest` は セット 10本を
 * まるごと props で `ArcadeGame`（クライアント部品）に 渡して いた。
 * サーバ部品から クライアント部品への 受け渡しは **HTML と RSC の 両方に 積まれる**
 * ので、213KB の データが **作りおき 1.1MB** に なる。
 *
 * 実測（2026-09-03・`.open-next/cache/`）:
 *   - `wordtest.cache`                  … 1101 KB
 *   - `wordtest/stage11_haizoku.cache`  … 1103 KB
 *   （どちらの ページも「ぜんぶ 見せる」入口なので セットを 全部 渡して いた）
 *
 * `public/` に 置くと `.open-next/assets` に 入り、Cloudflare が **Worker を
 * 起こさずに** 返す。213KB・gzip 37KB を ブラウザが 1回 取る。
 *
 * 一覧の 行（`heads`）は 13KB しか ないので **サーバで 描いたまま**にする——
 * 押す ものが すぐ 出る ほうが 学習者には よい。重い セットの 中身だけ 遅らせる。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { learnerWordGroups } from "../../src/lib/wordstage-merge";
import { gitWordData } from "./git-word-data";

const ROOT = join(import.meta.dirname, "..", "..");
export const WORDSETS_GENERATED_PATH = join(ROOT, "public", "wordtest", "sets.json");

/** ブラウザが 取りに 行く 場所。`src/lib/wordset-store.ts` と そろえる。 */
export const WORDSETS_URL = "/wordtest/sets.json";

/** 書き出す 中身（比較にも 使うので 純関数）。並びは `learnerWordGroups` に まかせる。 */
export function buildWordSetsJson(): string {
  const { stages, lessons } = gitWordData();
  return `${JSON.stringify(learnerWordGroups(lessons, stages).sets)}\n`;
}

export function writeWordSets(): number {
  const json = buildWordSetsJson();
  mkdirSync(join(ROOT, "public", "wordtest"), { recursive: true });
  writeFileSync(WORDSETS_GENERATED_PATH, json);
  return (JSON.parse(json) as unknown[]).length;
}

if (process.argv[1] && process.argv[1].endsWith("bake_wordsets.ts")) {
  const count = writeWordSets();
  console.log(`${relative(ROOT, WORDSETS_GENERATED_PATH)} を書き出しました（${count} セット）`);
}
