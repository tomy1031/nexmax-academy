/**
 * ステージの ことば — そのステージで おぼえる 単語を 1つに まとめる
 *
 * 原則は **「そのステージで 学習する ことば ＝ おぼえる 単語」**である
 *（2026-08-19/20 の指定）。だから:
 *
 *  - ことばの グループが 2つ 付いていても、学習者に 出すのは **1つ**。
 *    「どっちを やるか」の 判断は 学習では ない。
 *  - 見出しは **ステージの 名前 そのもの**にそろえる（「はじめに の ことば」は 冗長）。
 *
 * 単語ステージ そのものは 分けたまま 持つ（先生が スタジオで 課ごとに 直せる形を
 * こわさない）。まとめるのは **見せかたと 出題だけ**である。
 *
 * 純関数だけ。node:fs も React も持たないので、ページからも scripts からも 呼べる。
 */

import type { WordStage } from "@/content/schema";
import { mergeFuriganaEntries, type FuriganaEntry } from "@/lib/text/furigana";

/** 見出しに 要るぶんだけの ステージ（このファイルを ページの型に しばらない）。 */
export interface StageHead {
  id: string;
  title: string;
  reading: string;
  furigana?: readonly FuriganaEntry[];
}

/** ことばを ぶら下げた ステージ（一覧づくりに 要るぶんだけ）。 */
export interface StageWithWords extends StageHead {
  wordStageIds: readonly string[];
}

function entries(...sources: (readonly FuriganaEntry[] | undefined)[]): [string, string][] {
  return mergeFuriganaEntries(...sources).map(([surface, reading]): [string, string] => [
    surface,
    reading,
  ]);
}

/**
 * ステージに ぶら下がった 単語ステージを、学習者に 出す 1つの かたちに する。
 *
 * - 見出しは **ステージの 名前**。よみは ステージの `reading` を 読み辞書に 足して 出す
 *   （名前に 漢字が あっても 裸に しない — 規律2）
 * - `id` は **1つのときは その 単語ステージのまま**（これまでの `/arcade/<単語ステージID>`
 *   と 進み具合の 保存キーを 変えない）。2つ以上を まとめた ときだけ ステージの id を 使う
 * - ことばは **同じ表記なら 先に 出たほうが 勝つ**（`src/lib/dictionary.ts` と同じ規則。
 *   説明が 2つ 育つのを 避ける）
 * - 1回の 出題数は 部分の いちばん 多い もの、合格ラインは いちばん 高い ものに そろえる
 */
export function stageWordStage(stage: StageHead, parts: readonly WordStage[]): WordStage | null {
  if (parts.length === 0) return null;

  const titleEntry: FuriganaEntry[] = [[stage.title, stage.reading]];

  if (parts.length === 1) {
    const only = parts[0]!;
    return {
      ...only,
      title: stage.title,
      furigana: entries(only.furigana, stage.furigana, titleEntry),
    };
  }

  const seenTerms = new Set<string>();
  const seenIds = new Set<string>();
  const words: WordStage["words"] = [];
  for (const part of parts) {
    for (const word of part.words) {
      if (seenTerms.has(word.term)) continue;
      seenTerms.add(word.term);
      // ことばの id は 課ごとの 名前空間なので、まとめると ぶつかりうる
      //（両方に「houkoku」がいる等）。ぶつかったら 出どころを 前に 付ける。
      const wordId = seenIds.has(word.id) ? `${part.id}__${word.id}` : word.id;
      seenIds.add(wordId);
      words.push({ ...word, id: wordId });
    }
  }

  return {
    kind: "wordstage",
    id: stage.id,
    title: stage.title,
    description: parts[0]!.description,
    fieldSequence: parts[0]!.fieldSequence,
    questionCount: Math.min(Math.max(...parts.map((p) => p.questionCount)), words.length),
    passRate: Math.max(...parts.map((p) => p.passRate)),
    /*
     * 語ごとの (表記, よみ) を 先に、読み辞書を あとに 置く（あと勝ち）。
     * ぶつかったら **読み辞書が 勝つ**（「報告書」は 語の よみ より 複合語の よみが 正しい）。
     */
    furigana: entries(
      words.map((w) => [w.term, w.reading] as const),
      ...parts.map((p) => p.furigana),
      stage.furigana,
      titleEntry,
    ),
    words,
  };
}

/**
 * 学習者に 見せる ことばの 一覧 — **1ステージ＝1つ**。
 *
 * ことばアーケードを 単独で 開いた ときの グループ一覧も、ステージの 名前で 並ぶ
 *（同じ ことばが 2つの 名前で 出るのを 防ぐ）。どの ステージにも 付いて いない
 * 単語ステージは、そのまま 後ろに 置く——先生が 作った ものを 消さない。
 */
export function learnerWordStages(
  stages: readonly StageWithWords[],
  wordStages: readonly WordStage[],
): WordStage[] {
  const byId = new Map(wordStages.map((stage) => [stage.id, stage]));
  const used = new Set<string>();
  const out: WordStage[] = [];

  for (const stage of stages) {
    const parts = stage.wordStageIds
      .map((id) => byId.get(id))
      .filter((part): part is WordStage => part !== undefined);
    if (parts.length === 0) continue;
    parts.forEach((part) => used.add(part.id));
    const merged = stageWordStage(stage, parts);
    if (merged) out.push(merged);
  }

  for (const stage of wordStages) {
    if (!used.has(stage.id)) out.push(stage);
  }
  return out;
}

/**
 * その ことばを 持って いる ステージ。どこにも 付いて いなければ null。
 *
 * ことばアーケードから **来た ステージへ 戻る**ために 使う。URLの 1段目は
 * ステージID の ことも 単語ステージID の ことも あるので（`findLearnerWordStage`
 * と 同じ）、どちらでも 引けるように 両方を 見る。
 *
 * 戻り先を クエリ（`?from=`）で 運ばないのは、**URLを 覚えた 学習者**にも
 * 同じ 戻り道を 出すため——`/arcade/<id>` を そのまま 開いても、その ことばが
 * どの ステージの ものかは データから 分かる。
 */
export function wordStageOwner<T extends StageWithWords>(
  id: string,
  stages: readonly T[],
): T | null {
  return stages.find((stage) => stage.id === id || stage.wordStageIds.includes(id)) ?? null;
}

/**
 * URLの1段目（ステージID でも 単語ステージID でも よい）から、
 * 学習者に 出す ことばを 引く。単語ステージを 名指しされても、それが 付いて いる
 * **ステージの まとまり**を 返す（1ステージ＝1つ を どの入口でも 崩さない）。
 */
export function findLearnerWordStage(
  id: string,
  stages: readonly StageWithWords[],
  wordStages: readonly WordStage[],
): WordStage | null {
  const all = learnerWordStages(stages, wordStages);
  const direct = all.find((stage) => stage.id === id);
  if (direct) return direct;

  const owner = stages.find((stage) => stage.wordStageIds.includes(id));
  if (owner) return all.find((stage) => stage.id === owner.id || stage.id === id) ?? null;
  return null;
}
