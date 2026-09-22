/**
 * 出したあとに もう一度 開いた とき、**前に 出した こたえを 入力欄へ 戻す**
 *
 * ## なぜ 要るか（2026-09-22 の 指定）
 * 調査（リサーチ）を 開き直したら 欄が 空だった——「回答が 消えてしまってます」。
 * こたえ自体は 残って いた（DB の `quiz_results` と 端末の こたえノート）が、
 * **入力欄が その どちらからも 読み戻さない**ので、学習者にも 先生にも 消えたように 見える。
 *
 * 下書き（`@/lib/quiz/resume`）は 出し終えた 瞬間に 消える。それは
 * 「もう一度 はじめから 挑戦できる」ための 決まりだが、**やり直す 意味の 無い 教材が ある**。
 * 調査は 自分で 調べて 書いた ものが そのまま 資産で、あとで 見返して 直せるのが 正しい
 *（同日の 指定「やり直す意味が見つからない。あとで見返せたり、修正できるのが生であるはず」）。
 *
 * ## どの 教材で 戻すか — **正解の 無い 問いだけで できた 教材**
 * 「ケースバイケース」を 教材データの 新しい 欄で 決めると スキーマを 触る ことに なる
 *（横断変更）。いまは **設問の 型で 決められる**——`free` と `ranklist` しか 無い 教材は、
 * 採点も 正解も 無く、書いた ものが そのまま 記録に なる。そこでは 開き直し＝見直しで あって、
 * 挑戦のやり直しでは ない。えらび直す 練習（`choose` など）が 1問でも 混ざる 教材は
 * これまで どおり まっさらから 始める——前の 選択が 入った まま 出ると 練習に ならない。
 *
 * ## いまは 端末の 写しから（暫定A）
 * 戻し元は こたえノート（localStorage）＝**同じ 端末の 同じ ブラウザ**だけ。
 * 本来は ログインした 人ごとに DB（`quiz_results`）から 戻すべきで（同日の 指定）、
 * それは 別の 一歩に する。呼び口（`openQuiz`）を 変えずに 中身だけ 差し替えられる
 * ——`readNotebook` と 同じ 考え方（`@/lib/answers/notebook`）。
 */

import type { QuizSet } from "@/content/schema";
import { readNotebook, type Notebook } from "@/lib/answers/notebook";
import { hasNoRightAnswer, type QuizDraft } from "@/lib/quiz/draft";
import { restoreQuiz, type QuizStart } from "@/lib/quiz/resume";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

export interface QuizOpen extends QuizStart {
  /**
   * 前に 出した こたえを 戻したか。
   *
   * `resumed`（書きかけの つづき）とは 別に する——案内の 文が ちがう。
   * 「まえの つづきから」と 言われた 人は まだ 出して いないと 思うが、
   * こちらは **もう 出した もの**で、直して 出し直す ための 画面で ある。
   */
  readonly reopened: boolean;
}

/**
 * じゅんばんに ならべた こたえの 文を 行に ほどく（`（1）社長　（2）取締役` → `["社長", "取締役"]`）。
 *
 * 組み立ては `gradeDraft`（`@/lib/quiz/draft`）の 1か所。ほどくのも ここ 1か所に する。
 * 空の 行は 記録に 残って いない（書いた 行だけを つなぐ）ので、戻る 行も 書いた ぶんだけ。
 */
export function rankRowsOfAnswer(answer: string): string[] {
  return answer
    .split(/（\d+）/)
    .map((row) => row.trim())
    .filter((row) => row !== "");
}

/** 教材ぜんぶが 正解の 無い 問いか（＝開き直し＝見直しに する 教材か）。 */
export function keepsAnswers(set: QuizSet): boolean {
  return set.questions.length > 0 && set.questions.every(hasNoRightAnswer);
}

/**
 * こたえノートから 下書きを 組み立てる。**読めない 行は 落とす**（画面は 止めない）。
 *
 * 教材が 直されて 設問が 入れ替わって いても、id の 合う ものだけが 戻る。
 */
export function draftsFromNotebook(
  set: QuizSet,
  notebook: Notebook | null,
): Record<string, QuizDraft> {
  if (notebook === null || !keepsAnswers(set)) return {};

  const byId = new Map(set.questions.map((q) => [q.id, q]));
  const drafts: Record<string, QuizDraft> = {};

  for (const line of notebook.lines) {
    const question = byId.get(line.questionId);
    const answer = line.answer.trim();
    if (question === undefined || answer === "") continue;

    if (question.type === "free") {
      drafts[question.id] = { kind: "free", input: line.answer };
    } else if (question.type === "ranklist") {
      const rows = rankRowsOfAnswer(line.answer);
      if (rows.length > 0) drafts[question.id] = { kind: "ranklist", rows };
    }
  }

  return drafts;
}

/**
 * 開く ときの 始点を 決める。
 *
 * **書きかけの つづきが 先**。出したあとに また 書き足して 閉じた 人は、
 * その 書きかけの ほうが 新しい——古い 提出で 上書きしたら、いま 書いた ものが 消える。
 */
export function openQuiz(set: QuizSet, backend: ProgressBackend = defaultBackend()): QuizOpen {
  const start = restoreQuiz(
    set.id,
    set.questions.map((q) => q.id),
    set.answerMode,
    backend,
  );
  if (start.resumed) return { ...start, reopened: false };

  const drafts = draftsFromNotebook(set, readNotebook(set.id, backend));
  if (Object.keys(drafts).length === 0) return { ...start, reopened: false };

  return { ...start, drafts, reopened: true };
}
