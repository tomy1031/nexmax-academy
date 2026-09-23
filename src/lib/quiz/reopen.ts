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
  /**
   * 端末の 写しが 書かれた 時こく（戻せた ときだけ）。
   *
   * DB から 読んだ ぶんと くらべて **新しい ほうを 採る**ための ものさし。
   * 端末で 出し直した 直後は 写しの ほうが 新しい——そこへ 古い 提出を かぶせると、
   * 直した はずの こたえが 画面の 上で 元に 戻る。
   */
  readonly notebookAt?: string;
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

/**
 * DB（`quiz_results`）から 読んだ ほうを 採るか。
 *
 * **新しい ほうが 正しい。** 端末で 出し直した 直後は 写しの ほうが 新しく、そこへ
 * 古い 提出を かぶせると **直した はずの こたえが 画面の 上で 元に 戻る**。
 * 同じ 時こくなら 手もとの まま（動かす 理由が 無い）。写しが 無ければ DB を 採る
 * ——別の 端末で 書いた 人が、そこで はじめて 戻る。
 */
export function shouldTakeDbAnswers(notebookAt: string | undefined, dbAt: string): boolean {
  if (dbAt === "") return false;
  if (notebookAt === undefined || notebookAt === "") return true;
  return dbAt > notebookAt;
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
  if (notebook === null) return {};
  return draftsFromAnswers(
    set,
    Object.fromEntries(notebook.lines.map((line) => [line.questionId, line.answer])),
  );
}

/**
 * 「問いの id → 出した こたえの 文」から 下書きを 組み立てる。
 *
 * 端末の 写し（こたえノート）も DB（`quiz_results`）も、残して いるのは **文**である。
 * 戻し方を 2か所に 書くと、`ranklist` の ほどき方を 直した 日に 片方だけ 直る。
 */
export function draftsFromAnswers(
  set: QuizSet,
  answers: Readonly<Record<string, string>>,
): Record<string, QuizDraft> {
  if (!keepsAnswers(set)) return {};

  const drafts: Record<string, QuizDraft> = {};
  for (const question of set.questions) {
    const answer = answers[question.id] ?? "";
    if (answer.trim() === "") continue;

    if (question.type === "free") {
      drafts[question.id] = { kind: "free", input: answer };
    } else if (question.type === "ranklist") {
      const rows = rankRowsOfAnswer(answer);
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

  const notebook = readNotebook(set.id, backend);
  const drafts = draftsFromNotebook(set, notebook);
  if (Object.keys(drafts).length === 0) return { ...start, reopened: false };

  return { ...start, drafts, reopened: true, notebookAt: notebook?.at };
}
