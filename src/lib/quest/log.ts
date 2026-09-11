/**
 * クエストの メッセージログの 文 — **文を 組み立てる 場所と、読みを 持つ 場所を そろえる**
 *
 * ログの 箱には 2種類の 字が 並ぶ。
 *   - 教材の 字 … `option.resultText`（読みは 教材の 読み辞書が 持つ）
 *   - 画面の 字 … ここで 組み立てる 文（読みは **ここ**が 持つ）
 *
 * 「画面の ことばの 読みは 画面が 持つ（教材の 読み辞書とは 混ぜない）」が この
 * リポジトリの 決まり（`quest-view.tsx`）なので、画面が 書く 文の 読みを 教材の
 * JSON へ 足して 済ませない。文が ここに あるなら、読みも ここに 置く。
 *
 * ## なぜ 分けたか（2026-09-11）
 * ログは 画面の 字も **教材の 読み辞書だけ**で 描いて いた。教材の 辞書は
 * 「確認した上で」の ために `["上","うえ"]` を 持つ ので、画面が 書いた
 * 「レベルが 上がった！」が **うえがった** に なって いた（critical と hit を
 * えらぶ たびに 出る ので、ほぼ 全員が 見る）。「警告」「個」は どちらの 辞書にも
 * 無く、裸の 漢字の まま 出て いた（規律2）。
 *
 * `lint:content` は 教材データしか 見ず、コードの 中の 文字列は 通らない。だから
 * 文を ここへ 出して **単体テストで 固定する**（`tests/quest_log.test.ts`）。
 *
 * **UI を 含まない。** React も 色も ここには 無い——画面を 立てずに 文を
 * 確かめられる ことが、読みを テストで 守れる 条件だからである（`state.ts` と 同じ）。
 */

import type { Quest } from "@/content/schema";
import type { FuriganaEntry } from "@/lib/text/furigana";
import { currentPhase, type QuestState } from "./state";

/** ログの 色の 分け方（原典の critical / hit / miss / system と 同じ）。 */
export type QuestLogTone = "normal" | "critical" | "hit" | "miss" | "system";

export interface QuestLogLine {
  readonly text: string;
  readonly tone: QuestLogTone;
}

/**
 * **ログが 自分で 書く ことば**の 読み。
 *
 * 教材の 読み辞書と 重ねて 使う（`mergeFuriganaEntries(quest.furigana, これ)`）。
 * 同じ 表記が あれば こちらが 勝つ。`["上が","あが"]` は 教材の `["上","うえ"]`
 * より 長いので、最長一致で 先に 当たる——「確認した上で」は うえで の まま。
 *
 * ここは **どの クエストを 読み込んでも 変わらない**。教材の 辞書に 何が 入って
 * いるかに 画面の 読みを 頼らせない ため、1字の 語も 省かずに 並べる。
 */
export const QUEST_LOG_FURIGANA: readonly FuriganaEntry[] = [
  ["警告", "けいこく"],
  ["行動", "こうどう"],
  ["上が", "あが"],
  ["個", "こ"],
  ["大", "おお"],
  ["始", "はじ"],
  ["直", "なお"],
  ["見", "み"],
  ["減", "へ"],
  ["金", "かね"],
  ["万", "まん"],
];

/** まだ 1手も 打って いない ときの 1行。 */
export function questLogOpening(quest: Quest): string {
  return `${quest.title} が 始まった！`;
}

/**
 * いまの 出来事（`state.event`）を ログの 行に 直す。出来事が 無ければ 空。
 *
 * 場面は `state` から 引く——手を えらんだ 直後は まだ 場面が 進んで いないので、
 * `currentPhase` は「その 手を 打った 場面」を 返す。
 */
export function questLogLines(quest: Quest, state: QuestState): QuestLogLine[] {
  const event = state.event;
  const phase = currentPhase(quest, state);
  if (!event || !phase) return [];

  const lines: QuestLogLine[] = [];

  if (event.kind === "turn") {
    const option = phase.options[event.optionIndex];
    const player = state.players[event.playerIndex];
    if (player) lines.push({ text: `${player.name}の 行動！`, tone: "normal" });
    if (option) lines.push({ text: option.resultText, tone: option.type });
    if (event.moneyLost > 0) {
      lines.push({ text: `お金が ${event.moneyLost}万 減った！`, tone: "miss" });
    }
    if (event.hpLost > 0 && player) {
      lines.push({ text: `${player.name}は ${event.hpLost}の ダメージ！`, tone: "miss" });
      if (player.hp <= 0) {
        lines.push({ text: `${player.name}は たおれて しまった！`, tone: "miss" });
      }
    }
    if (event.leveledUp && player) {
      lines.push({ text: `${player.name}は レベルが 上がった！`, tone: "critical" });
    }
    return lines;
  }

  lines.push({ text: "===== テスト スタート =====", tone: "system" });
  if (event.damage === 0) {
    lines.push({ text: "すごい！ バグは ひとつも なかった！", tone: "critical" });
  } else {
    lines.push({ text: `【警告】${event.risk}個の 大きな バグが 見つかった！`, tone: "miss" });
    lines.push({
      text: `やり直しだ！ お金 -${event.cost}万、みんなに ${event.damage}の ダメージ！`,
      tone: "miss",
    });
  }
  return lines;
}
