import {
  claudeStatus,
  claudeToolOf,
  requestClaudeTool,
  type ClaudeCheckKind,
} from "@/lib/ai/claude-check";
import {
  BUG_REVIEW_SYSTEM,
  BUG_REVIEW_TOOL,
  buildBugReviewPrompt,
  parseBugReview,
  type BugReviewContext,
  type BugReviewResult,
} from "@/lib/quiz/bugreport";
import {
  QUIZ_REVIEW_SYSTEM,
  QUIZ_REVIEW_TOOL,
  buildQuizReviewPrompt,
  parseQuizReview,
  type QuizReviewContext,
  type QuizReviewResult,
} from "@/lib/quiz/ai-review";

/**
 * こたえの チェックを Claude で 見る（願い #586）
 *
 * **Gemini の 見かた係と 同じ 指示文・同じ 道具・同じ 読みとり**を 使う
 *（`ai-review.ts`・`bugreport.ts`）。ちがうのは 運び手だけ——Live の つなぎでは なく
 * Supabase の 関数を 1回 呼ぶ。だから 画面の 部品は 何も 変えない。
 *
 * 読めない 漢字が あれば 1回だけ 言い直して もらう（Gemini と 同じ。読み辞書は 画面が 持つ）。
 */

export type ClaudeReviewResult<T> =
  | { readonly ok: true; readonly review: T; readonly model: string }
  | { readonly ok: false; readonly reason: string; readonly closed: boolean };

async function reviewWith<T>(
  kind: ClaudeCheckKind,
  system: string,
  tool: ReturnType<typeof claudeToolOf>,
  prompt: (kanjiRetry: boolean) => string,
  parse: (input: unknown) => T | null,
  needsKanjiRetry: (result: T) => boolean,
): Promise<ClaudeReviewResult<T>> {
  /*
   * **閉じて いると 分かって いる あいだは 呼ばない**（60秒 覚えた 状態）。
   * 授業の 時間の 外に 毎回 1往復 足すと、Gemini で 見て もらう 生徒が その ぶん 待つ。
   * 覚えて いない ときは この 問いあわせで 関数も 起きる（1回目の 待ちが 短く なる）。
   */
  const status = await claudeStatus();
  if (!status.open) {
    const closed = status.reason !== "network";
    return { ok: false, reason: status.reason || "unconfigured", closed };
  }
  const first = await requestClaudeTool(kind, { system, prompt: prompt(false), tool });
  if (!first.ok) return first;
  let review = parse(first.input);
  if (review && needsKanjiRetry(review)) {
    const again = await requestClaudeTool(kind, { system, prompt: prompt(true), tool });
    // 2回目が 崩れて いたら 1回目を 使う（読めない 文は 画面が 落とす）
    const parsed = again.ok ? parse(again.input) : null;
    if (parsed) review = parsed;
  }
  if (!review) return { ok: false, reason: "badShape", closed: false };
  return { ok: true, review, model: first.model };
}

const QUIZ_TOOL = claudeToolOf(QUIZ_REVIEW_TOOL);
const BUG_TOOL = claudeToolOf(BUG_REVIEW_TOOL);

/** メール（`fillin`）・Slack（`free`＋観点）の こたえの チェック。 */
export function claudeQuizReview(
  context: QuizReviewContext,
  needsKanjiRetry: (result: QuizReviewResult) => boolean,
): Promise<ClaudeReviewResult<QuizReviewResult>> {
  return reviewWith(
    "quiz",
    QUIZ_REVIEW_SYSTEM,
    QUIZ_TOOL,
    (kanjiRetry) => buildQuizReviewPrompt(context, kanjiRetry),
    (input) => parseQuizReview(input, context),
    needsKanjiRetry,
  );
}

/** バグ報告（`bugreport`）の 採点。 */
export function claudeBugReview(
  context: BugReviewContext,
  needsKanjiRetry: (result: BugReviewResult) => boolean,
): Promise<ClaudeReviewResult<BugReviewResult>> {
  return reviewWith(
    "bug",
    BUG_REVIEW_SYSTEM,
    BUG_TOOL,
    (kanjiRetry) => buildBugReviewPrompt(context, kanjiRetry),
    (input) => parseBugReview(input),
    needsKanjiRetry,
  );
}

/**
 * Claude が だめだった ときに **Gemini へ 回すか**。
 *
 * - 閉じて いた（時間の 外・設定が 無い 等）… 回す（いまの 動き そのもの）
 * - 遅かった … 回さない（もう 十分 待たせて いる。Gemini の 待ちを 足すと 1分 近く なる）
 * - それ以外の 失敗 … 回す（生徒が 自分の 鍵を 持って いれば 見て もらえる）
 */
export function fallBackToGemini(result: { reason: string; closed: boolean }): boolean {
  return result.closed || result.reason !== "timeout";
}

/**
 * Claude の わけを、画面の 一言（`judgeFailNote`）の わけに 言いかえる。
 * Gemini にも 回せなかった ときだけ 使う。
 *
 * - 授業の 時間の 外・設定が 無い … いまと 同じ「AIの せっていが まだです」（noKey）
 * - 上限・止めて いる … 「いま つかえません」（使いすぎの 文は Google の 1日の 枠の 話なので 使わない）
 * - Anthropic の 混雑（429・529）… 「こんで います」
 */
export function claudeFailReason(result: { reason: string; closed: boolean }): string {
  if (result.closed) {
    return ["budget", "userLimit", "stopped", "off"].includes(result.reason)
      ? "unavailable"
      : "noKey";
  }
  if (result.reason === "rateLimited") return "overloaded";
  return result.reason;
}
