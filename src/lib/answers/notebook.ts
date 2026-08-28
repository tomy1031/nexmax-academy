/**
 * こたえノート — **自分が 書いた こたえを、あとの 画面で もう一度 見る**ための 置き場
 *
 * ## 何を 解いた ものか
 * 「ヘンディさんに 報告する」も「松井社長と 話す」も、**さっき 調べた ことを
 * 口に 出す**のが 中身である。ところが 会話の 画面には 自分の こたえが どこにも
 * 出て こなかった。学習者は 25問ぶんを 覚えて 会話に 入る か、別の タブを
 * 行ったり 来たり する しか なかった（2026-08-27 の 指定
 * 「回答した内容をミーティングで表示させる方法はないか」）。
 *
 * ## なぜ 下書き（`@/lib/quiz/resume`）を 見に 行かないか
 * あちらは **完走した 瞬間に 消える**（もう一度 はじめから 挑戦できるように するため）。
 * つまり「出したあと」＝ちょうど 会話で 要る ときには もう 無い。
 * だから 出した ときに **別の 鍵で 写しを 取る**。役目が ちがう ものを
 * 同じ 保存に 相乗りさせると、片方の 都合（消す・残す）で もう片方が 壊れる。
 *
 * ## なぜ DB（`quiz_results`）を 引かないか
 * 引けるなら 端末を またげるが、**鍵の 無い デモモードでは 何も 出ない**
 *（CI の 通し検証も そこを 通る）。教室で 使うのは 同じ 端末の 続きなので、
 * まず 端末に 置く。DB から 引き直すのは あとから 足せる——このファイルの
 * 呼び口（`readNotebook`）を 変えずに 中身だけ 差し替えられる 形にして ある。
 *
 * ## 教材の 種類を 知らない
 * 置くのも 読むのも「もんだいの id ＋ 行の 並び」だけ。ミーティング専用に しないのは、
 * これから 別の 対話にも 同じ「メモを 見ながら 話す」を 置く ため
 *（`src/components/answers/answer-notebook.tsx` も 同じ 方針）。
 */

import { z } from "zod";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

function keyOf(quizSetId: string): string {
  return `${NAMESPACE}:answers:${quizSetId}`;
}

const lineSchema = z.object({
  questionId: z.string(),
  /** 設問文（見出しに 出す）。 */
  q: z.string(),
  /** 学習者が 書いた こたえ。空なら「書いて いません」と 出す。 */
  answer: z.string().default(""),
  /**
   * 正解の 文。**外した ときに 何を 言えば よいか**が ここにしか 無い
   *（会話では「自分の こたえ」より 正しい 事実を 言う 必要が ある）。
   * 正解の 無い 問い（`free`）では 空。
   */
  correctAnswer: z.string().default(""),
  correct: z.boolean().default(false),
  /** 口に 出して 報告する 問いか（`quizQuestion.report`）。 */
  report: z.boolean().default(false),
  /** 章（MISSION）の 名前。メモの 中でも まとまりが 見えるように する。 */
  section: z.string().default(""),
});

const notebookSchema = z.object({
  quizSetId: z.string(),
  /** 出した 時こく（ISO）。**新しい ほうで 上書きする** 判断に 使う。 */
  at: z.string(),
  lines: z.array(lineSchema),
});

export type NotebookLine = z.infer<typeof lineSchema>;
export type Notebook = z.infer<typeof notebookSchema>;
/** 書くときの 形（既定は 省ける）。 */
export type NotebookInput = z.input<typeof notebookSchema>;

/**
 * 出した こたえを 残す。**上書きする**。
 *
 * 「もう一度 やる」で 出し直したら、新しい ほうが 正しい——古い こたえを 見ながら
 * 話すと、直した はずの まちがいを そのまま 口に 出す ことに なる。
 */
export function saveNotebook(
  notebook: NotebookInput,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(keyOf(notebook.quizSetId), JSON.stringify(notebook));
}

/**
 * 読む。**壊れた 保存値は「まだ 無い」として 扱う**（会話は 止めない）。
 *
 * 呼ぶ側は `null` を「まだ その もんだいを やって いない」と 読んで、
 * 「先に ◯◯を やりましょう」と 案内する。
 */
export function readNotebook(
  quizSetId: string,
  backend: ProgressBackend = defaultBackend(),
): Notebook | null {
  const raw = backend.get(keyOf(quizSetId)) ?? "";
  if (raw === "") return null;
  try {
    const parsed = notebookSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearNotebook(
  quizSetId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(quizSetId));
}

/**
 * メモに 出す 行を えらぶ。
 *
 * `reportOnly` は **口に 出して 報告する 問いだけ**に 絞る（`report`）。
 * 25問 ぜんぶを 開いたままだと カンペに ならない——けっかの 画面で
 * 「🎤 ほうこく」の ふだを 置いたのと 同じ 理由（`quiz-runner.tsx`）。
 *
 * ただし **しるしの 付いた 問いが 1つも 無い 教材で 空に しない**。絞った 結果が
 * 0行なら 全部 出す——「メモを 開いたのに 何も 無い」は、絞りすぎた ときの
 * いちばん たちの 悪い 見え方で、学習者には 原因が 分からない。
 */
export function notebookLines(
  notebook: Notebook,
  options?: { reportOnly?: boolean },
): NotebookLine[] {
  if (!options?.reportOnly) return notebook.lines;
  const picked = notebook.lines.filter((line) => line.report);
  return picked.length > 0 ? picked : notebook.lines;
}

/**
 * その行で **口に 出す ことば**。
 *
 * 合って いた 問いは 自分の こたえ、外した 問いは 正解。書いて いない 問いは 正解。
 * けっかの 一覧（`ReviewRow`）と 同じ 決め方に そろえて ある——同じ 学習者が
 * 2つの 画面で ちがう ことを 言われると、どちらを 信じてよいか 分からなくなる。
 */
export function spokenAnswer(line: NotebookLine): string {
  const own = line.answer.trim();
  if (line.correct && own !== "") return own;
  if (line.correctAnswer.trim() !== "") return line.correctAnswer;
  return own;
}
