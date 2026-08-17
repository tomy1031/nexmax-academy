/**
 * つづきから はじめる — もんだい（quizset）版
 *
 * ## 何が 起きて いたか
 * 「ほうこくの じゅんび」は 9問・約17分。授業の チャイムで 中断した 班は、
 * 次に 開くと `createQuizSession(set)`（`quiz-reducer.ts` は 常に index 0）で
 * また 1問目から だった。進捗には `status`（started/completed）しか 書いて おらず、
 * どこまで 答えたかは どこにも 残って いなかった。
 *
 * ## ミーティングと 同じ 流儀（`@/lib/meeting/resume`）
 * 置き場は 進捗ストアと 同じ 入れ物・同じ 名前空間（`nexmax:v1`）で、鍵だけ 分ける。
 * DBには 送らない——先生が 見る 成績では なく、学習者の 手もとの しおりである。
 * 壊れた保存値は zod で 弾き、「まだ 無い」として 扱う（学習は 止めない）。
 *
 * ## ミーティングと 違う ところ（index を 持たない）
 * ミーティングは 会話の 途中（言い直しの 最中）にも 保存するので、位置と
 * 答えの 内訳が ずれ得る——だから 両方を 別々に 持ち、しおりを 優先して 突き合わせる。
 * もんだいは 1問が「答える → 解説を 読む → つぎへ」で 閉じており、採点は
 * 答えた 瞬間に 確定する。だから **「何問目」は 常に 「結果の 数」と 同じ**——
 * 別に 持つと ずれた ときに どちらが 正しいか 分からなくなるだけなので、持たない。
 * 保存するのは `results`（答えた 問題だけ）で、次に 見せる 問題は その数から 決める。
 *
 * ## 完走したら 消す
 * 全問 答え終えた 人が もう一度 開いたら、**はじめから 挑戦できる**のが 正しい
 * （もんだいは 何度でも やり直せる）。だから 完走で 消し、結果の 数が 問題数に
 * 届いて いる ときは 保存が 残って いても はじめから にする。
 */

import { z } from "zod";
import { defaultBackend, readContentProgress, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

const resultSchema = z.object({
  questionId: z.string(),
  correct: z.boolean(),
  earned: z.number(),
  /**
   * 学習者が 出した こたえ。`.optional()` ではなく `.default("")` にする理由が2つある。
   * (a) zod は 知らない鍵を 黙って 落とすので、ここに 無いと「つづきから」で 戻った回の
   *     こたえが 消える。(b) 出力の 型が `string` に なるので、必須プロパティの
   *     `QuizResult[]` へ そのまま 渡せる（任意だと 型が 合わない）。
   * 既定を 空文字に すると、この鍵が 無かった 頃の 保存値も そのまま 読める。
   */
  answer: z.string().default(""),
});

const resumeSchema = z.object({
  quizSetId: z.string(),
  /** 答え終えた 問題だけ。並びは 出題順。 */
  results: z.array(resultSchema),
});

export type QuizResumeResult = z.infer<typeof resultSchema>;
export type QuizResume = z.infer<typeof resumeSchema>;

/** 画面が これから 始める ところ。 */
export interface QuizStart {
  /** つぎに 出す 問題の 番号（0始まり）。 */
  readonly index: number;
  /** ここまでの 結果（正解した 問題の ID・得点）。 */
  readonly results: readonly QuizResumeResult[];
  /** 途中から 戻ったか（「つづきから」の 案内を 出すか の 判断に 使う）。 */
  readonly resumed: boolean;
}

/** はじめから。 */
export const FRESH_QUIZ_START: QuizStart = { index: 0, results: [], resumed: false };

function keyOf(quizSetId: string): string {
  return `${NAMESPACE}:quiz-resume:${quizSetId}`;
}

/* ------------------------------------------------------------------ *
 * どこから 始めるか（純粋）
 * ------------------------------------------------------------------ */

/**
 * 保存されて いた ものと しおりから、始める ところを 決める。
 *
 * 規則は 5つ:
 * 1. 手がかりが 無い・整数で ない なら はじめから
 * 2. 結果の 数が **問題の 数に 届いて いれば** はじめから（＝完走ずみ。もう一度 挑戦できる）
 * 3. 結果が 0件 なら はじめから（戻す ものが 無い）
 * 4. 教材が 直されて 問題の 並びが 変わった ときも はじめから
 *    （答えの 内訳は 出題順を 前提に するので、並びが ずれた ものは 数え直せない）
 * 5. しおり（進捗ストアの `position.question`）だけが 残って いる ときは、
 *    内訳が 無くても 位置だけ 戻す——0点 扱いに なっても、9問目から 再開できる ほうが
 *    1問目に 戻すより ずっと よい。
 */
export function startFrom(
  saved: QuizResume | null,
  panel: number | undefined,
  questionIds: readonly string[],
): QuizStart {
  const candidate = saved ? saved.results.length : panel;
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return FRESH_QUIZ_START;
  if (candidate <= 0 || candidate >= questionIds.length) return FRESH_QUIZ_START;

  // しおりだけの ときは 位置だけ 戻す（内訳が 無いので 結果は 空のまま）
  if (!saved) return { index: candidate, results: [], resumed: true };

  // 教材が 問題を 入れかえて いたら、答えの 内訳は もう 前提に 合わない
  const stillMatches = saved.results.every((r, i) => questionIds[i] === r.questionId);
  if (!stillMatches) return FRESH_QUIZ_START;

  return { index: candidate, results: saved.results, resumed: true };
}

/* ------------------------------------------------------------------ *
 * 読み書き
 * ------------------------------------------------------------------ */

export function readQuizResume(
  quizSetId: string,
  backend: ProgressBackend = defaultBackend(),
): QuizResume | null {
  const raw = backend.get(keyOf(quizSetId)) ?? "";
  if (raw === "") return null;
  try {
    const parsed = resumeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // 壊れた保存値は「まだ無い」として扱う（学習は続けられる）
    return null;
  }
}

export function saveQuizResume(
  resume: QuizResume,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(keyOf(resume.quizSetId), JSON.stringify(resume));
}

/** 完走したとき・やり直すときに 消す。 */
export function clearQuizResume(
  quizSetId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(quizSetId));
}

/**
 * 端末に 残って いる ものを 読んで、始める ところを 組み立てる。
 *
 * しおり（`content:<id>` の `position.question`）は 進捗ストアが 持ち、内訳は
 * こちらが 持つ。2つの 保存先を 突き合わせる のは ここ 1か所だけにする
 * （`@/lib/meeting/resume` の `restoreMeeting` と 同じ 形）。
 */
export function restoreQuiz(
  quizSetId: string,
  questionIds: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): QuizStart {
  return startFrom(
    readQuizResume(quizSetId, backend),
    readContentProgress(quizSetId, backend)?.position?.question,
    questionIds,
  );
}
