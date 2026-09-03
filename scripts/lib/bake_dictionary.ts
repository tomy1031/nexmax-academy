/**
 * ポップアップ辞書を **ブラウザが 取りに来る 1枚の JSON** として 書き出す。
 *
 * ## なぜ ページに 埋めるのを やめたか（2026-09-03）
 *
 * 前は `learnerDictionary()` を サーバで 呼び、701語を **ページの props** として
 * 渡して いた。読みもの・もんだい・ミーティングの どのページにも 同じ 辞書が
 * 丸ごと 入る。RSC の 積み荷に 直すと 字が ふくらむので、**作りおき 1件が 1.5MB**に なった。
 *
 * 実測（2026-09-02・`.open-next/cache/`）:
 *   - `kaisha/article-kaisha_shirabekata.cache` … **1636 KB**（辞書を 渡す 経路）
 *   - `article/houkoku_lecture.cache`           … **32 KB**（渡さない 経路・同じ 読みもの）
 *
 * 作りおきに **当たって いても**、Worker は その 1.5MB を 毎回 JSON から 起こし直し、
 * 指紋（etag）を 取り直す。だから「キャッシュに 当たって いるのに 50〜137ms」に なる。
 * 無料枠の CPU 上限は 10ms なので、20人が 同時に 開くと そこで 落ちる（docs/deploy.md §0.13）。
 *
 * ## 置き場は `public/`（Worker を 通らない）
 *
 * `public/` の ファイルは `.open-next/assets` に 入り、Cloudflare が **Worker を
 * 起こさずに** そのまま 返す（`run_worker_first` は 既定の false）。だから 辞書を
 * ここへ 移すと、**その ぶんの CPU は 0 に なる**。ブラウザは 1回 取れば 使い回す。
 *
 * 250KB（gzip 49KB）。1度きりの 取得なので 回線にも 重くない。
 *
 * ## 生成物は コミットする
 *
 * bake_content.ts と 同じ 理由（ビルド順に 依存させない）。ずれていたら
 * `npm run lint:content` が error で 落とす。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { buildDictionary } from "../../src/lib/dictionary";
import { gitWordData } from "./git-word-data";

const ROOT = join(import.meta.dirname, "..", "..");
export const DICTIONARY_GENERATED_PATH = join(ROOT, "public", "dictionary", "learner.json");

/** ブラウザが 取りに 行く 場所。`src/lib/dictionary-store.ts` と そろえる。 */
export const DICTIONARY_URL = "/dictionary/learner.json";

/**
 * 書き出す 中身を 組み立てる（比較にも 使うので 純関数）。
 *
 * 並べ方は `src/lib/content.ts` の `listVocabBooks` / `listWordStages` に そろえる
 *（id 順 → `buildDictionary` が 読み順に 並べ替える）。DB は 見ない —— ここで 作るのは
 * **git の 分**で、先生が スタジオで 足した 語は 次の デプロイで 合流する。
 */
export function buildDictionaryJson(): string {
  const { books, stages } = gitWordData();
  return `${JSON.stringify(buildDictionary(books, stages))}\n`;
}

export function writeDictionary(): number {
  const json = buildDictionaryJson();
  mkdirSync(join(ROOT, "public", "dictionary"), { recursive: true });
  writeFileSync(DICTIONARY_GENERATED_PATH, json);
  return (JSON.parse(json) as unknown[]).length;
}

if (process.argv[1] && process.argv[1].endsWith("bake_dictionary.ts")) {
  const count = writeDictionary();
  console.log(`${relative(ROOT, DICTIONARY_GENERATED_PATH)} を書き出しました（${count} 語）`);
}
