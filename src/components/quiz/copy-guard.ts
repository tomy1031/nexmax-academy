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
 *
 * ## 止めるのは **作文に 要る もの**だけ（同日 あと の 指定）
 *「URLとか、学習に関係のないものはコピーOKにしたい」「作文に必要なものはコピペできない」。
 * 線は **日本語（かな・漢字・全角の 記号）を 含むか**で 引く。含まない もの——URL・@宛先・
 * ファイルの 名前など 英数字だけの もの——は コピーも 貼り付けも できる。打ち写すのが 手間な だけで、
 * 日本語の 練習には ならない ため。
 */

/** 作文に 要る 文字（かな・漢字・全角の 記号）。これを 含む ものは コピペさせない。 */
const WRITING_TEXT = /[\u3001-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uffef]/;

/** コピペして よいか（日本語を 含まない＝URL・@宛先・英数字だけ）。 */
export function copyAllowed(text: string): boolean {
  return text.trim() !== "" && !WRITING_TEXT.test(text);
}

/**
 * もとにする 情報の 中で **選んで コピーできる** かたまり（英字を 含む 英数字の ならび）。
 *「http://test-server1」「@frontend_team」は 選べる。「22:00」など 数字だけの ものは 選べない
 *（短く、メモから さがす 中身でも ある）。
 */
export function copyableTokens(text: string): { text: string; copyable: boolean }[] {
  const parts: { text: string; copyable: boolean }[] = [];
  let at = 0;
  for (const match of text.matchAll(/[\x21-\x7e]+/g)) {
    const token = match[0];
    if (!/[A-Za-z]/.test(token)) continue;
    const start = match.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start), copyable: false });
    parts.push({ text: token, copyable: true });
    at = start + token.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), copyable: false });
  return parts;
}

function selectedText(): string {
  return typeof window === "undefined" ? "" : (window.getSelection()?.toString() ?? "");
}

/** 入力欄で 選んで いる 文字。 */
function inputSelection(target: EventTarget): string {
  const field = target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!field || typeof field.value !== "string") return "";
  return field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
}

/** 止めた ことを 言う 1行（漢字を 使わない——UIの 読み辞書に 頼らない）。 */
export const PASTE_BLOCKED_NOTE =
  "にほんごの ぶんは はりつけ できません。じぶんで うって ください（URLなどは はりつけ できます）。";

/** コピペを 止める 問いか（こたえの チェックが 関門に なる 連絡文の 練習・初級と 上級）。 */
export function guardsCopy(question: QuizQuestion): boolean {
  return question.type !== "bugreport" && gatesOnAnswerCheck(question);
}

/**
 * 読むだけの 文（もとにする 情報）に 付ける。`select-none` と いっしょに 使い、
 * コピーして よい かたまりだけ `data-copyable`＋`select-text` で 選べる ように する。
 */
export const NO_COPY_PROPS = {
  onCopy: (event: ClipboardEvent) => {
    if (!copyAllowed(selectedText())) event.preventDefault();
  },
  onCut: (event: ClipboardEvent) => {
    if (!copyAllowed(selectedText())) event.preventDefault();
  },
  onDragStart: (event: DragEvent) => {
    if (!copyAllowed(selectedText())) event.preventDefault();
  },
  onContextMenu: (event: MouseEvent) => {
    // URL などの 上では 右クリック／長押しの コピーを 出す
    if (!(event.target as Element | null)?.closest?.("[data-copyable]")) event.preventDefault();
  },
};

/**
 * 入力欄に 付ける。**日本語を 含む ものだけ** 止め、止めた ときに `onBlocked`
 *（画面で 理由を 言う ため）。URL など 英数字だけの ものは 貼れる。
 */
export function noPasteProps(onBlocked: () => void) {
  return {
    onPaste: (event: ClipboardEvent) => {
      if (copyAllowed(event.clipboardData?.getData("text") ?? "")) return;
      event.preventDefault();
      onBlocked();
    },
    onDrop: (event: DragEvent) => {
      if (copyAllowed(event.dataTransfer?.getData("text") ?? "")) return;
      event.preventDefault();
      onBlocked();
    },
    onCopy: (event: ClipboardEvent) => {
      if (!copyAllowed(inputSelection(event.currentTarget))) event.preventDefault();
    },
    onCut: (event: ClipboardEvent) => {
      if (!copyAllowed(inputSelection(event.currentTarget))) event.preventDefault();
    },
  };
}
