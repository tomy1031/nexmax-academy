/**
 * ステージの ことば — そのステージで おぼえる 単語を セットに 分ける
 *
 * 出発点は **「そのステージで 学習する ことば ＝ おぼえる 単語」**（2026-08-19/20）。
 * 名前の 無い ことばの グループが 2つ 付いていても、学習者に 出すのは **1つ**——
 * 「ITと ビジネス、どっちを やるか」の 判断は 学習では ない。
 *
 * 2026-08-25（願い #203）に **セット名（`label`）**が 入り、初級・中級のように
 * 先生が 名前を 付けた グループは 分けて 出して いた。**2026-08-31（願い #280）に
 * それを 戻した** — 「初級・中級・上級などの セットの ものは 一つに まとめて
 * ください（会社を知る、報連相：連絡）」。**1ステージ＝1つの 単語テスト**に なる。
 * 「初級を やるか 上級を やるか」も、出発点と 同じく **学習では ない** 判断だった。
 *
 *  - 見出しは **ステージの 名前 そのもの**にそろえる（「はじめに の ことば」は 冗長）。
 *  - 単語ステージ そのものは 分けたまま 持つ（先生が スタジオで 課ごとに 直せる形を
 *    こわさない）。`label` も 消さない——まとめるのは **見せかたと 出題だけ**である。
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
 * - `id` は **1つのときは その 単語ステージのまま**（これまでの `/wordtest/<単語ステージID>`
 *   と 進み具合の 保存キーを 変えない）。2つ以上を まとめた ときだけ ステージの id を 使う
 * - ことばは **同じ表記なら 先に 出たほうが 勝つ**（`src/lib/dictionary.ts` と同じ規則。
 *   説明が 2つ 育つのを 避ける）
 * - 1回の 出題数は 部分の いちばん 多い もの、合格ラインは いちばん 高い ものに そろえる
 */
export function stageWordStage(stage: StageHead, parts: readonly WordStage[]): WordStage | null {
  if (parts.length === 0) return null;

  const titleEntry: FuriganaEntry[] = [[stage.title, stage.reading]];

  if (parts.length === 1) return withStageTitle(stage, parts[0]!);

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
    /*
     * 出題数は **足し算**（2026-08-26）。
     *
     * 前は いちばん 多い セットの 数（max）だった ので、2つを まとめても
     * 出る 数は 増えず、あとの セットの ことばは ほとんど 出番が なかった。
     * それぞれが「ぜんぶ 出す」設定なら、まとめた ものも ぜんぶ 出る。
     * 先生が どれかを 減らして いれば、その ぶんだけ 減る。
     */
    questionCount: Math.min(
      parts.reduce((n, p) => n + p.questionCount, 0),
      words.length,
    ),
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

/** ステージの 読み辞書を 足した 1本（見出しは そのまま）。 */
function withStageFurigana(stage: StageHead, part: WordStage): WordStage {
  return {
    ...part,
    furigana: entries(part.furigana, stage.furigana, [[stage.title, stage.reading]]),
  };
}

/** 見出しを ステージの 名前に そろえた 1本（`label` は そのまま 運ぶ）。 */
function withStageTitle(stage: StageHead, part: WordStage): WordStage {
  return { ...withStageFurigana(stage, part), title: stage.title };
}

/**
 * ステージの ことばを、学習者に 出す **セットの ならび**に する。
 *
 * いまは いつでも **1本**（願い #280）。ぶら下がって いる 単語ステージが
 * 3つでも、セット名（初級・中級・上級）が 付いて いても、学習者には
 * 「その ステージの 単語テスト」が 1つ 出る。
 *
 * 返りを 配列の ままに して あるのは、呼ぶ側（ステージトップ・`/wordtest/<id>`）を
 * 「0本か 1本以上か」で 書いた ままに して おく ため——0本（ことばの 無い ステージ）
 * だけは これからも あるので、`null` 返しの 1本ものに するより 素直に なる。
 */
export function stageWordSets(stage: StageHead, parts: readonly WordStage[]): WordStage[] {
  const merged = stageWordStage(stage, parts);
  return merged ? [merged] : [];
}

/**
 * 学習者に 見せる ことばの 一覧。
 *
 * 単語テストを 単独で 開いた ときの 一覧は、ステージの 名前で 並ぶ
 *（同じ ことばが 2つの 名前で 出るのを 防ぐ。1ステージ＝1行）。
 * どの ステージにも 付いて いない 単語ステージは、
 * そのまま 後ろに 置く——先生が 作った ものを 消さない
 *（複数の ステージから 語を 集めた「中間テスト対策」の セットも ここに 出る）。
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
    out.push(...stageWordSets(stage, parts));
  }

  for (const stage of wordStages) {
    if (!used.has(stage.id)) out.push(stage);
  }
  return out;
}

/**
 * その ことばを 持って いる ステージ。どこにも 付いて いなければ null。
 *
 * 単語テストから **来た ステージへ 戻る**ために 使う。URLの 1段目は
 * ステージID の ことも 単語ステージID の ことも あるので（`findLearnerWordStage`
 * と 同じ）、どちらでも 引けるように 両方を 見る。
 *
 * 戻り先を クエリ（`?from=`）で 運ばないのは、**URLを 覚えた 学習者**にも
 * 同じ 戻り道を 出すため——`/wordtest/<id>` を そのまま 開いても、その ことばが
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
 * 学習者に 出す ことばの セットを 引く。
 *
 *  - **ステージID**（`/wordtest/kaisha`）→ その ステージの 単語テスト（1本）。
 *  - **単語ステージID**（`/wordtest/stage23_kaisha`）→ それが 入って いる ほうを 返す。
 *    まとまった あとの 名前は ステージID なので、古い リンクは ここで 拾われる。
 */
export function findLearnerWordSets(
  id: string,
  stages: readonly StageWithWords[],
  wordStages: readonly WordStage[],
): WordStage[] {
  const byId = new Map(wordStages.map((stage) => [stage.id, stage]));
  const owner = stages.find((stage) => stage.id === id || stage.wordStageIds.includes(id));

  if (owner) {
    const parts = owner.wordStageIds
      .map((partId) => byId.get(partId))
      .filter((part): part is WordStage => part !== undefined);
    const sets = stageWordSets(owner, parts);
    if (owner.id === id) return sets;
    const one = sets.find((set) => set.id === id) ?? sets.find((set) => set.id === owner.id);
    return one ? [one] : sets;
  }

  // どの ステージにも 付いて いない ことば（先生が 作りかけの もの・横断の セット）
  const orphan = byId.get(id);
  return orphan ? [orphan] : [];
}

/**
 * `findLearnerWordSets` の 1本だけ ほしい とき（見出し・古い 呼び出し）。
 * ことばの 無い ステージでは null。
 */
export function findLearnerWordStage(
  id: string,
  stages: readonly StageWithWords[],
  wordStages: readonly WordStage[],
): WordStage | null {
  return findLearnerWordSets(id, stages, wordStages)[0] ?? null;
}
