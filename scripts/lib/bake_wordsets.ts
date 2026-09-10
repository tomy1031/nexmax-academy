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
import type { WordStage } from "../../src/content/schema";
import { learnerWordGroups } from "../../src/lib/wordstage-merge";
import { gitWordData } from "./git-word-data";

const ROOT = join(import.meta.dirname, "..", "..");
export const WORDSETS_GENERATED_PATH = join(ROOT, "public", "wordtest", "sets.json");

/** ブラウザが 取りに 行く 場所。`src/lib/wordset-store.ts` と そろえる。 */
export const WORDSETS_URL = "/wordtest/sets.json";

/**
 * その セットの 画面に **ルビが 付きうる 文**を ぜんぶ つなげた もの。
 *
 * `ArcadeGame` が セットの 読み辞書で 描くのは 5か所 だけ——見出し（`title`）・
 * セット名（`label`）・説明（`description`）・説明文（`explanationJa`）・例文（`example`）。
 * 見出し語（`term`）は `<ruby>` に `reading` を 直に 置くので 読み辞書を 通らないが、
 * `src/lib/dictionary.ts` と そろえて ここにも 入れて おく。
 *
 * 対訳（`meaningEn`）と 誤答（`wrongMeanings`）は 英語で、どこでも `RubyText` を
 * 通らない。**ここに 足す 文を 減らすと 画面の ルビが 静かに 消える**ので、
 * 描く ところを 増やした ときは この 一覧も 足す。
 */
function rubiedText(set: WordStage): string {
  return [
    set.title,
    set.label ?? "",
    set.description,
    ...set.words.flatMap((word) => [word.term, word.explanationJa, word.example ?? ""]),
  ].join("\n");
}

/**
 * その セットの 本文に **出て くる 見出しだけ**を 読み辞書に 残す。
 *
 * `hydrateWordStage` は 正の 読み辞書を **まるごと** どの セットにも 積む。
 * 覆いを 落とさない ための 作りだが、ブラウザへ 配る ときは 荷物に なる——
 * 実測（2026-09-09）で 8,388件 の うち **5,806件（69%）は その セットの 文に
 * 一度も 出て こない**（raw 139KB ぶん）。授業では 20人が 同時に 取りに 来る。
 *
 * `src/lib/dictionary.ts` の `furiganaFor` が 語ごとに やって いるのと 同じ 絞り方を、
 * セットごとに 当てる。**本文に 無い 見出しは `annotateRuby` の どの 位置にも
 * 当たらない**（走査は `text.startsWith(surface, i)` だけ）ので、合成される ルビは
 * 1文字も 変わらない。`buildFuriganaIndex` の `maxLength` は 残った 見出しから
 * 数え直されるが、判定は `surface.length <= maxLength` なので これも 効かない。
 *
 * 並びは 変えない（`filter` は 順を 保つ）。同じ 長さで ぶつかった ときの 勝ち負けは
 * `buildFuriganaIndex` の 安定ソート＝元の 並び順で 決まるので、ここを 入れ替えると
 * 読みが 変わりうる。
 */
export function trimWordSetFurigana(set: WordStage): WordStage {
  const text = rubiedText(set);
  return { ...set, furigana: (set.furigana ?? []).filter(([surface]) => text.includes(surface)) };
}

/** 書き出す 中身（比較にも 使うので 純関数）。並びは `learnerWordGroups` に まかせる。 */
export function buildWordSetsJson(): string {
  const { stages, lessons } = gitWordData();
  const sets = learnerWordGroups(lessons, stages).sets.map(trimWordSetFurigana);
  return `${JSON.stringify(sets)}\n`;
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
