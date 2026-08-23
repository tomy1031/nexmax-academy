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
import { quizDraftSchema, type QuizDraft } from "@/lib/quiz/draft";

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
  /** 答え終えた 問題だけ。並びは 出題順（1問ずつ の とき）。 */
  results: z.array(resultSchema),
  /**
   * どちらの やりかたで 始めたか。**既定は 1問ずつ**——この鍵が 無かった 頃の
   * 保存値も そのまま 読める（`.default()` に する 理由は `answer` と 同じ）。
   */
  mode: z.enum(["one", "submit", "all"]).default("one"),
  /**
   * まとめて 出す ときの 採点まえの こたえ。**問題IDを 鍵に する**——並びで 持つと、
   * 教材に 1問 足した 日に ぜんぶ 1つずつ ずれる。
   */
  drafts: z.record(z.string(), quizDraftSchema).default({}),
  /** まとめて 出す ときに 見て いた 問題の 番号（0始まり）。 */
  index: z.number().int().min(0).default(0),
});

export type QuizResumeResult = z.infer<typeof resultSchema>;
/** 読み終えた 形（既定が 埋まって いる）。 */
export type QuizResume = z.infer<typeof resumeSchema>;
/**
 * 書くときの 形（既定は 省ける）。
 * 1問ずつの 保存に `drafts: {}` を 毎回 書かせないための 入口。
 */
export type QuizResumeInput = z.input<typeof resumeSchema>;

/** 画面が これから 始める ところ。 */
export interface QuizStart {
  /** つぎに 出す 問題の 番号（0始まり）。 */
  readonly index: number;
  /** ここまでの 結果（正解した 問題の ID・得点）。1問ずつ の とき だけ 中身が 入る。 */
  readonly results: readonly QuizResumeResult[];
  /** 途中から 戻ったか（「つづきから」の 案内を 出すか の 判断に 使う）。 */
  readonly resumed: boolean;
  /** 前回 えらんだ やりかた。 */
  readonly mode: QuizMode;
  /** まとめて 出す ときの 採点まえの こたえ（問題IDごと）。 */
  readonly drafts: Readonly<Record<string, QuizDraft>>;
}

/** もんだいの やりかた（`@/components/quiz/quiz-reducer` の QuizMode と同じ 3つ）。 */
export type QuizMode = "one" | "submit" | "all";

/**
 * 「書きためて さいごに 1回 出す」やりかたか。
 *
 * `submit`（1問ずつ 見る）と `all`（ぜんぶ 1ページ）は **見せかたが ちがうだけ**で、
 * 保存する ものは 同じ（採点まえの 下書き）。先生が この2つを 切り替えても、
 * 学習者が 書いた ものは そのまま 使える——だから 生の `mode` では 比べない。
 */
export function gradesAtEnd(mode: QuizMode): boolean {
  return mode !== "one";
}

/**
 * はじめから。`mode` は 教材の 既定（まとめて 出す）を 置くが、`startFrom` は
 * かならず 教材の やりかたで 上書きする——ここの 値は 目印でしかない。
 */
export const FRESH_QUIZ_START: QuizStart = {
  index: 0,
  results: [],
  resumed: false,
  mode: "submit",
  drafts: {},
};

function keyOf(quizSetId: string): string {
  return `${NAMESPACE}:quiz-resume:${quizSetId}`;
}

/* ------------------------------------------------------------------ *
 * どこから 始めるか（純粋）
 * ------------------------------------------------------------------ */

/**
 * 保存されて いた ものと しおりから、始める ところを 決める。
 *
 * ## やりかたは 教材が 決める
 * 「1問ずつ」か「まとめて 出す」かは **先生が 管理画面で 決める**（`QuizSet.answerMode`）。
 * だから ここでは 引数の `mode` が 正で、端末に 残って いた `mode` は
 * **その 保存が 今の やりかたの ものか**を 見分ける ためだけに 使う。
 * 先生が やりかたを 切り替えたら、前の 保存は もう 前提が ちがうので はじめから にする
 * （1問ずつの 採点ずみ 内訳を まとめて 出す の 下書きとして 読む ことは できない）。
 *
 * ## まとめて 出す（mode: "submit"）
 * 採点まえの 下書きを そのまま 戻す。**問題IDを 鍵に して 持って いる**ので、
 * 教材の 並びが 変わっても ずれない——いま 無い 問題の 下書きだけ 落とす。
 * 見て いた 番号は 問題数の 中に 収める（教材が 短く なった ときの ため）。
 *
 * ## 1問ずつ（mode: "one"）
 * 規則は 5つ:
 * 1. 手がかりが 無い・整数で ない なら はじめから
 * 2. 結果の 数が **問題の 数に 届いて いれば** はじめから（＝完走ずみ。もう一度 挑戦できる）
 * 3. 結果が 0件 なら はじめから（戻す ものが 無い）
 * 4. 教材が 直されて 問題の 並びが 変わった ときも はじめから
 *    （答えの 内訳は 出題順を 前提に するので、並びが ずれた ものは 数え直せない）
 * 5. しおり（進捗ストアの `position.question`）だけが 残って いる ときは、
 *    内訳が 無くても 位置だけ 戻す——9問目から 再開できる ほうが 1問目に 戻すより ずっと よい。
 *
 * ## 規則5で 始めた 回は「成績を 数えない 回」
 * この回は **見て いない 問題を 残した まま 最後に 着く**。当初は「0点 扱いに なっても
 * よい」と 考えて いたが、実際に 起きるのは 逆で、答えた 2問だけで 100%・合格に なった
 *（成績は 答えた 数を 分母に する ため）。しかも 成績は 初回だけが 正式
 *（`recordFirstTestResult`）＝**あとから 直せない**。
 * かと いって 分母を 全問に 固定すると、途中から 戻った 人が 合格できない 回に なる。
 * だから 点の 数え方では なく **回の 数え方**で 分ける: 全問に 触れて いない 回は
 * 「まちがえた もんだいだけ」の やり直しと 同じ 扱いに して、成績にも ステージの
 * 「おわった」にも 残さない（判断は `quiz-reducer.ts` の `isWholeSetRun` 1か所）。
 * 位置は 戻す・点は 数えない——**中断した 人を 1問目に 戻さない**という 規則5の 値打ちは
 * そのまま 残る。
 */
export function startFrom(
  saved: QuizResume | null,
  panel: number | undefined,
  questionIds: readonly string[],
  mode: QuizMode = "submit",
): QuizStart {
  const fresh: QuizStart = { ...FRESH_QUIZ_START, mode };
  if (questionIds.length === 0) return fresh;
  /*
   * 先生が やりかたを 切り替えた あとの 保存は 読まない（前提が ちがう）。
   * ただし `submit` と `all` は **見せかたが ちがうだけ**なので、行き来しても
   * 書いた ものは 残す——ここで 生の `mode` を 比べると、先生が 見せかたを 変えた 日に
   * クラス全員の 下書きが 消える。
   */
  const own = saved && gradesAtEnd(saved.mode) === gradesAtEnd(mode) ? saved : null;

  if (gradesAtEnd(mode)) {
    if (!own) return fresh;
    // いま 教材に 無い 問題の 下書きは 落とす（並びが 変わっても ID なので ずれない）
    const alive = Object.entries(own.drafts).filter(([id]) => questionIds.includes(id));
    if (alive.length === 0) return fresh;
    return {
      index: Math.min(Math.max(own.index, 0), questionIds.length - 1),
      results: [],
      resumed: true,
      mode,
      drafts: Object.fromEntries(alive),
    };
  }

  const candidate = own ? own.results.length : panel;
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return fresh;
  if (candidate <= 0 || candidate >= questionIds.length) return fresh;

  // しおりだけの ときは 位置だけ 戻す（内訳が 無いので 結果は 空のまま）
  if (!own) return { ...fresh, index: candidate, resumed: true };

  // 教材が 問題を 入れかえて いたら、答えの 内訳は もう 前提に 合わない
  const stillMatches = own.results.every((r, i) => questionIds[i] === r.questionId);
  if (!stillMatches) return fresh;

  return { ...fresh, index: candidate, results: own.results, resumed: true };
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
  resume: QuizResumeInput,
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
  mode: QuizMode = "submit",
  backend: ProgressBackend = defaultBackend(),
): QuizStart {
  return startFrom(
    readQuizResume(quizSetId, backend),
    readContentProgress(quizSetId, backend)?.position?.question,
    questionIds,
    mode,
  );
}
