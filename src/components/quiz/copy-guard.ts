import type { ClipboardEvent, DragEvent, MouseEvent } from "react";
import type { QuizQuestion } from "@/content/schema";
import { gatesOnAnswerCheck } from "@/lib/quiz/ai-review";

/**
 * 連絡文の 練習の **コピペ止め**（2026-10-26 の 指定）
 *
 *「修正点が入力した瞬間に消えるのはやめて。その代わりそのフィールドはコピペ不可にして。
 *  あともとにする情報もコピペ不可。初級も上級も」。
 *
 * なおすところ（直した 形）を 書き直しの あいだも 出して おく かわりに、
 * - 入力欄 … 貼り付け・落とし込み・コピー・切り取りを 止める（自分で 打つ）
 * - もとにする 情報（場面の メモ）… 選べない・コピーできない（メモから 写して 貼れない）
 * タイピングの お手本（`typing-view.tsx`）と 同じ 止めかた。
 */

/** 止めた ことを 言う 1行（漢字を 使わない——UIの 読み辞書に 頼らない）。 */
export const PASTE_BLOCKED_NOTE = "はりつけは できません。じぶんで うって ください。";

/** コピペを 止める 問いか（こたえの チェックが 関門に なる 連絡文の 練習・初級と 上級）。 */
export function guardsCopy(question: QuizQuestion): boolean {
  return question.type !== "bugreport" && gatesOnAnswerCheck(question);
}

/** 読むだけの 文（もとにする 情報）に 付ける。`select-none` と いっしょに 使う。 */
export const NO_COPY_PROPS = {
  onCopy: (event: ClipboardEvent) => event.preventDefault(),
  onCut: (event: ClipboardEvent) => event.preventDefault(),
  onDragStart: (event: DragEvent) => event.preventDefault(),
  onContextMenu: (event: MouseEvent) => event.preventDefault(),
};

/** 入力欄に 付ける。止めた ときに `onBlocked`（画面で 理由を 言う ため）。 */
export function noPasteProps(onBlocked: () => void) {
  return {
    onPaste: (event: ClipboardEvent) => {
      event.preventDefault();
      onBlocked();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      onBlocked();
    },
    onCopy: (event: ClipboardEvent) => event.preventDefault(),
    onCut: (event: ClipboardEvent) => event.preventDefault(),
  };
}
