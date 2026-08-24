/**
 * もんだいの「下書き」と 採点 — 1問ずつ でも まとめて 出す でも、採点は ここだけ
 *
 * ## なぜ 分けたか
 * もんだいには 2つの やりかたが ある（`QuizMode`）。
 *  - **1問ずつ**: 答えた 瞬間に 採点して、こたえと せつめいを 見る
 *  - **まとめて 出す**: ぜんぶ 書いてから 出す。採点は 出した あと 1回だけ
 *
 * 採点の 場所を 2つ 持つと、片方だけ 直した 日に **同じ 答えなのに 点が ちがう**が
 * 起きる（複数選択の 部分点のような 細かい 決めごとほど ずれる）。だから
 * 「学習者が 出した もの」＝下書き（`QuizDraft`）を 先に 決めて、
 * **採点は `gradeDraft` 1つ**に する。状態機械（quiz-reducer）は どちらの やりかたでも
 * この 関数を 通す。
 *
 * ## 下書きは 番号で 持ち、記録は 文で 持つ
 * 下書きは 端末に 保存して 次の 日に 読み直す ものなので、選択肢の 番号で 持つ
 * （画面に 選んだ ところを 出し直す ため）。いっぽう 先生に 残す 記録は
 * **文そのもの**（`QuizResult.answer`）——教材の 選択肢を 1行 入れ替えると
 * 番号の 意味が 変わり、去年の 記録が 読めなく なるため（quiz-reducer の 経緯）。
 * その 橋渡しを するのが `draftAnswerText`。
 */

import { z } from "zod";
import type { QuizQuestion } from "@/content/schema";
import { answerMatches } from "@/lib/text/normalize";

/**
 * 学習者が いま 出して いる もの（採点まえ）。
 *
 * `emotion` だけ 2段階（気もち → 言い方）なので、片方だけ 決まって いる 途中の
 * 形を 持てるように する（`null` = まだ）。
 */
export type QuizDraft =
  | { readonly kind: "choice"; readonly index: number }
  | { readonly kind: "multi"; readonly indexes: readonly number[] }
  | { readonly kind: "keyword"; readonly input: string }
  | { readonly kind: "wordbank"; readonly filled: readonly (string | null)[] }
  | { readonly kind: "emotion"; readonly feeling: number | null; readonly reply: number | null }
  | { readonly kind: "free"; readonly input: string };

/**
 * 保存された 下書きを 読み直す ための 検査（`@/lib/quiz/resume` が 使う）。
 * 壊れた ものは 弾いて「まだ 答えて いない」として 扱う——学習は 止めない。
 */
export const quizDraftSchema: z.ZodType<QuizDraft> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), index: z.number().int().min(0) }),
  z.object({ kind: z.literal("multi"), indexes: z.array(z.number().int().min(0)) }),
  z.object({ kind: z.literal("keyword"), input: z.string() }),
  z.object({ kind: z.literal("wordbank"), filled: z.array(z.string().nullable()) }),
  z.object({ kind: z.literal("free"), input: z.string() }),
  z.object({
    kind: z.literal("emotion"),
    feeling: z.number().int().min(0).nullable(),
    reply: z.number().int().min(0).nullable(),
  }),
]);

/** 設問の型に 合う 下書きの 種類（教材が 直されて 型が 変わった 下書きを 弾く ため）。 */
const DRAFT_KIND: Record<QuizQuestion["type"], QuizDraft["kind"]> = {
  choose: "choice",
  multi: "multi",
  keyword: "keyword",
  wordbank: "wordbank",
  emotion: "emotion",
  free: "free",
};

/**
 * その 下書きは この 設問の ものか。
 *
 * 教材を 直して 設問の 型が 変わると、端末に 残った 下書きは 形が 合わなく なる。
 * 合わない ものは **無かった ことに する**（読めない 下書きで 採点すると、
 * 学習者は 身に 覚えの ない 点を 見る ことに なる）。
 */
export function draftFits(question: QuizQuestion, draft: QuizDraft | undefined): boolean {
  return draft !== undefined && draft.kind === DRAFT_KIND[question.type];
}

/**
 * 何か 出して いるか（「まだ こたえて いません」を 出すかの 判断）。
 *
 * 空白だけの 自由入力・1つも 選んで いない 複数選択・穴が 1つも 埋まって いない
 * 語群は **まだ**として 扱う——出す 前の かくにん画面で「のこり」に 数えたいのは、
 * 手を 付けて いない もの だから。
 */
export function draftAnswered(question: QuizQuestion, draft: QuizDraft | undefined): boolean {
  if (!draftFits(question, draft) || !draft) return false;
  switch (draft.kind) {
    case "choice":
      return true;
    case "multi":
      return draft.indexes.length > 0;
    case "keyword":
      return draft.input.trim().length > 0;
    case "wordbank":
      return draft.filled.some((v) => v !== null && v !== "");
    case "emotion":
      // 2段階 そろって はじめて「こたえた」。気もちだけでは 採点の 形に ならない
      return draft.feeling !== null && draft.reply !== null;
    case "free":
      return draft.input.trim().length > 0;
  }
}

/** 採点の 結果（記録に 残す 3つ ＋ 言い方を 選ぶ ための「あと すこし」）。 */
export interface QuizGrade {
  readonly correct: boolean;
  readonly earned: number;
  /** 先生の 画面と 見直しに 出す、学習者の こたえの 文。 */
  readonly answer: string;
  /** 一部だけ 合って いるか（複数選択・語群）。 */
  readonly partial: boolean;
}

/**
 * 下書きを 採点する。**1問ずつ でも まとめて 出す でも ここを 通る**。
 *
 * 答えて いない ものは 0点の 見送り（`answer` は 空文字）——「書けずに 出した」ことも
 * 先生には 意味の ある 記録なので、行は 残す。
 */
export function gradeDraft(question: QuizQuestion, draft: QuizDraft | undefined): QuizGrade {
  const blank: QuizGrade = { correct: false, earned: 0, answer: "", partial: false };
  if (!draftFits(question, draft) || !draft) return blank;

  switch (question.type) {
    case "choose": {
      if (draft.kind !== "choice") return blank;
      const correct = draft.index === question.answer;
      return {
        correct,
        earned: correct ? question.points : 0,
        answer: question.options[draft.index] ?? "",
        partial: false,
      };
    }

    case "multi": {
      if (draft.kind !== "multi") return blank;
      if (draft.indexes.length === 0) return blank;
      const picked = [...draft.indexes].sort((a, b) => a - b);
      const expected = [...question.answers].sort((a, b) => a - b);
      const correct =
        picked.length === expected.length && picked.every((v, i) => v === expected[i]);
      /*
       * **そろって いる ときだけ 点が 入る**（部分点は 置かない）。
       *
       * 以前は 合って いる ぶんを 按分して いた。5択4正解の ような 形では
       * **ぜんぶ 選ぶだけで 半分の 点が 入り**、読まなくても 点が 取れた。
       * 2026-08-19 ユーザー指定「複数選択の問題は正解したらポイントとしてください」。
       * 一部だけ 合って いる ことは 点では なく 言い方（`partial` →「あと すこし」）で 返す。
       */
      return {
        correct,
        earned: correct ? question.points : 0,
        answer: picked.map((i) => question.options[i] ?? "").join(" ／ "),
        partial: !correct && picked.some((v) => expected.includes(v)),
      };
    }

    case "keyword": {
      if (draft.kind !== "keyword") return blank;
      if (!draft.input.trim()) return blank;
      const correct = answerMatches(draft.input, [question.answer, ...question.accept]);
      return {
        correct,
        earned: correct ? question.points : 0,
        // 自由入力は **正規化せず 生のまま**——表記ゆれこそ 先生が 見たいもの
        answer: draft.input,
        partial: false,
      };
    }

    /*
     * 自由記述は **書いて あれば 点**。中身は 採点しない。
     *
     * 「なぜ そう 思ったか」に 正解は 無い。合っている かどうかを 機械が 決めると、
     * その 学習者だけの 正しい こたえが「ちがいます」に なる（規律1）。
     * 中身を 読むのは 先生の 仕事で、機械の 仕事は「書けたね」と 言う ことだけ。
     */
    case "free": {
      if (draft.kind !== "free") return blank;
      const written = draft.input.trim();
      const enough = written.length >= question.minLength;
      return {
        correct: enough,
        earned: enough ? question.points : 0,
        answer: draft.input,
        // もう すこし 書いて ほしい ときは「あと すこし」の 言い方に なる
        partial: !enough && written.length > 0,
      };
    }

    case "wordbank": {
      if (draft.kind !== "wordbank") return blank;
      if (!draft.filled.some((v) => v !== null && v !== "")) return blank;
      const correct =
        draft.filled.length === question.blanks.length &&
        question.blanks.every((expected, i) => draft.filled[i] === expected);
      return {
        correct,
        earned: correct ? question.points : 0,
        answer: question.blanks.map((_, i) => `（${i + 1}）${draft.filled[i] ?? ""}`).join("　"),
        partial: !correct && question.blanks.some((expected, i) => draft.filled[i] === expected),
      };
    }

    case "emotion": {
      if (draft.kind !== "emotion") return blank;
      if (draft.feeling === null || draft.reply === null) return blank;
      const correct =
        draft.feeling === question.answerFeeling && draft.reply === question.answerReply;
      return {
        correct,
        earned: correct ? question.points : 0,
        answer: `${question.feelings[draft.feeling] ?? ""} → ${question.replies[draft.reply] ?? ""}`,
        partial: false,
      };
    }
  }
}

/** 学習者の こたえの 文だけ 要る ところ（かくにん画面）。 */
export function draftAnswerText(question: QuizQuestion, draft: QuizDraft | undefined): string {
  return gradeDraft(question, draft).answer;
}

/** 型ごとに「正解の 見せ方」を 組み立てる。 */
export function correctAnswerText(question: QuizQuestion): string {
  switch (question.type) {
    case "choose":
      return question.options[question.answer] ?? "";
    case "multi":
      return question.answers.map((i) => question.options[i] ?? "").join(" ／ ");
    case "keyword":
      return question.answer;
    case "wordbank":
      return question.blanks.map((b, i) => `（${i + 1}）${b}`).join("　");
    case "emotion":
      return `${question.feelings[question.answerFeeling] ?? ""} → ${
        question.replies[question.answerReply] ?? ""
      }`;
    /*
     * 自由記述に「正解」は 無い。かくにん画面や 見直しで ここを 呼ばれた ときに
     * 何かを 出すと、**学習者の 書いた ものが まちがいに 見える**。空を 返す。
     */
    case "free":
      return "";
  }
}
