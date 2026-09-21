/**
 * 型の ある 文の うめかた（`fillin`）— **欄の 並びと 組み立ては ここだけ**
 *
 * `fillin` の 1問は 4つの 部品から できて いる。
 *
 * ```
 *   head   … 宛先（打つ）・件名（変えられない）
 *   intro  … 「お疲れ様です。〇〇です。…」
 *   blanks … 【問題】___ 【原因】___ …
 *   outro  … 「よろしく お願い いたします。」
 * ```
 *
 * 学習者が 打つ 欄（**スロット**）は `head` の `write` と `blanks` を つないだ もので、
 * その **並びが 下書きの 並び**（`QuizDraft.inputs`）に なる。この 対応を
 * 画面・採点・AIの 3か所で 別々に 書くと、欄を 1つ 足した 日に
 * **こたえが 1つ ずれて 記録される**（どこにも エラーは 出ない）。
 * だから 並べるのも 組み立てるのも ここ 1か所に する。
 */

import type { QuizQuestion } from "@/content/schema";
import type { QuizDraft } from "@/lib/quiz/draft";

type Fillin = Extract<QuizQuestion, { type: "fillin" }>;

/** 学習者が 打つ 欄 1つぶん。 */
export interface FillinSlot {
  readonly label: string;
  readonly answer: string;
  readonly accept: readonly string[];
  readonly placeholder?: string;
  /** 本文の 上（宛先）か、本文の 中（【問題】など）か。画面の 出しわけに 使う。 */
  readonly area: "head" | "body";
}

/** 打つ 欄を 上から 順に 並べる（**下書きの 並びは これ**）。 */
export function fillinSlots(question: Fillin): FillinSlot[] {
  const head: FillinSlot[] = question.head
    .filter(
      (row): row is Extract<(typeof question.head)[number], { kind: "write" }> =>
        row.kind === "write",
    )
    .map((row) => ({
      label: row.label,
      answer: row.answer,
      accept: row.accept,
      placeholder: row.placeholder,
      area: "head",
    }));
  const body: FillinSlot[] = question.blanks.map((blank) => ({
    label: blank.label,
    answer: blank.answer,
    accept: blank.accept,
    placeholder: blank.placeholder,
    area: "body",
  }));
  return [...head, ...body];
}

/**
 * 書きあがった 文（**AIに 渡す もの・お手本を 作る もの**）。
 *
 * 画面では 欄に 分かれて いても、相手に 届くのは **1本の メール**。
 * AIには その 形で 渡す——欄ごとに 見せると「文として 通じるか」を 見て もらえない
 *（連絡文の ねらいは そこに ある）。
 *
 * 空の 欄は `（まだ 書いて いません）` と 書いて 渡す。黙って 抜くと、AIは
 * **書けて いない ことに 気づかず** ブラッシュアップで 勝手に 埋める
 *（言って いない 中身を 足さない・朝礼の `polished` と 同じ 決めごと）。
 */
export function fillinText(question: Fillin, inputs: readonly string[]): string {
  const value = (index: number): string => {
    const written = (inputs[index] ?? "").trim();
    return written === "" ? "（まだ 書いて いません）" : written;
  };
  const lines: string[] = [];
  let slot = 0;
  for (const row of question.head) {
    lines.push(
      row.kind === "fixed" ? `${row.label}：${row.text}` : `${row.label}：${value(slot++)}`,
    );
  }
  if (question.intro) lines.push(question.intro);
  for (const blank of question.blanks) {
    lines.push(`【${blank.label}】${value(slot++)}`);
  }
  if (question.outro) lines.push(question.outro);
  return lines.join("\n");
}

/** お手本の 文（欄の 正解を 入れた もの）。`ai.model` を 書かない 教材でも 出せる。 */
export function fillinModelText(question: Fillin): string {
  return fillinText(
    question,
    fillinSlots(question).map((slot) => slot.answer),
  );
}

/**
 * **チェックを 受けた 文**（画面の 部品と もんだいの 画面で 同じ ものを 見る ため）。
 *
 * ⭕の 印は「どの 文に ついての ⭕か」を いっしょに 持つ（`answer-check.tsx`）。
 * その 文の 作り方が 2か所に あると、打ち直して いないのに ⭕が 消える／
 * 打ち直したのに ⭕が 残る、が 起きる。だから ここ 1つに する。
 */
export function checkedText(question: QuizQuestion, draft: QuizDraft | undefined): string {
  /*
   * 前後の 空白は 落とす。メールは 欄ごとに `.trim()` して 組み立てる（`fillinText`）のに
   * 自由記述は 生の ままだった ころは、**うしろに 空白を 1つ 足しただけで ⭕が 消え、
   * つぎの もんだいが また 閉じた**（2026-09-21 のコード検収）。
   * 部品の 側（`useAnswerCheck`）も 同じ ように 落として 突き合わせる。
   */
  if (question.type === "fillin") {
    return fillinText(question, draft?.kind === "fillin" ? draft.inputs : []).trim();
  }
  if (question.type === "free") return draft?.kind === "free" ? draft.input.trim() : "";
  return "";
}
