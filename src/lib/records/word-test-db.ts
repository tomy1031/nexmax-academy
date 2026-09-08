/**
 * ことばの テストの 成績と 打った ことばを 台帳に 残す — **けっか画面で 1回だけ**
 *
 * ## なぜ 要るか
 * もんだい（quizset）の 点は `quiz_results` に 残るのに、**ことばの 点だけが
 * 端末の localStorage にしか 無かった**（`@/lib/progress/store` の `TestResult`）。
 * 先生から 見ると 成績の 半分が 欠けて いて、しかも 端末を 変えれば その 半分は 消える。
 *
 * 残すのは 2つ。
 *   1. `word_test_results` … 1回の 挑戦の まとめ（点・読み・いみ・合否）
 *   2. `word_test_answers` … 1語ぶんの 明細（**学習者が 打った 読み**・えらんだ いみ）
 *
 * 2 が 効く。⭕✕ だけでは「どの ことばで 止まるか」しか 分からないが、何と 打ったかが
 * 分かると **止まる 理由**が 読める（もんだい側で いちばん 効いたのが これだった）。
 *
 * ## 書くのは 1回
 * けっか画面に たどり着いた ときに、**まとめ 1行 ＋ 明細を 1回の insert** で 送る。
 * 1問ごとには 送らない——1回の 挑戦は 30語＝60問に なる ことが あり、
 * 教室の 1本の 回線から 人数ぶん 重なる（`flushMeetingTurns` と 同じ 考え方）。
 *
 * ## 送りっぱなし
 * 記録の ために 学習が 止まるのが いちばん まずい。待たないし、落ちても 何も しない。
 * ただし supabase-js は **投げずに `{ error }` を 返す**ので、必ず 受けて 開発時に 出す
 *（投げないことを 知らずに try/catch で 囲むと、永久に 空の 画面が できる）。
 */
"use client";

import type { ArcadeState, ArcadeSummary } from "@/components/arcade/arcade-reducer";
import type { Word } from "@/content/schema";
import { createClient } from "@/lib/supabase/client";
import { readOwnId } from "@/lib/supabase/claims";

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/** 1回の 挑戦の まとめ（DBの 列名と そろえる。ここが ずれると 1行も 入らない）。 */
export interface WordTestResultRow {
  readonly profile_id: string;
  readonly stage_id: string;
  readonly attempt_id: string;
  readonly mode: string;
  readonly score: number;
  readonly max_score: number;
  readonly total: number;
  readonly reading_asked: number;
  readonly reading_correct: number;
  readonly meaning_correct: number;
  readonly passed: boolean;
  readonly game_score: number;
  readonly best_combo: number;
  readonly created_at?: string;
}

/** 1語ぶんの 明細。 */
export interface WordTestAnswerRow {
  readonly profile_id: string;
  readonly stage_id: string;
  readonly attempt_id: string;
  readonly word_id: string;
  readonly term: string;
  readonly reading: string;
  readonly meaning: string;
  readonly reading_input: string;
  readonly reading_ok: boolean | null;
  readonly meaning_input: string;
  readonly meaning_ok: boolean;
  readonly word_index: number;
  readonly created_at?: string;
}

/**
 * 1回の 挑戦を まとめる 鍵を 作る。
 *
 * `crypto.randomUUID` が 無い 端末（古い WebView・安全でない つなぎ）でも
 * **記録が 落ちない**ように、そのときは 手で 作る。まとまりを 作るのが 役目で、
 * 暗号としての 強さは 要らない（`@/lib/quiz/results-db` と 同じ 流儀）。
 */
export function newWordTestAttemptId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * けっか画面から 呼ぶ。**待たない**（`void` で 投げる）。
 *
 * 語の 台帳（`words`）を 一緒に 受けるのは、**その日の 教材の すがた**を 凍らせる ため。
 * あとで 語や いみを 直しても、去年の 記録が そのまま 読める
 *（`quiz_results.max_points` と 同じ 考え方）。
 */
export async function saveWordTest({
  state,
  summary,
  words,
  attemptId,
}: {
  state: ArcadeState;
  summary: ArcadeSummary;
  words: readonly Word[];
  attemptId: string;
}): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;
  try {
    const profileId = await readOwnId(supabase).catch(() => null);
    // ログインして いない（デモモード）ときは 何も しない。記録の 持ち主が 決まらない。
    if (!profileId) return;
    if (state.outcomes.length === 0) return;

    const byId = new Map(words.map((word) => [word.id, word]));
    const readingAsked = state.outcomes.filter((one) => one.readingOk !== null).length;

    const result: WordTestResultRow = {
      profile_id: profileId,
      stage_id: state.stageId,
      attempt_id: attemptId,
      mode: state.mode,
      score: summary.score,
      max_score: summary.maxScore,
      total: summary.total,
      reading_asked: readingAsked,
      reading_correct: summary.readingCorrect,
      meaning_correct: summary.meaningCorrect,
      // 合否を 名乗れるのは **さいごまで やった 本番**だけ（summarize の completed）。
      passed: summary.passed,
      game_score: state.score,
      best_combo: state.bestCombo,
    };

    const answers: WordTestAnswerRow[] = state.outcomes.map((one, index) => {
      const word = byId.get(one.wordId);
      return {
        profile_id: profileId,
        stage_id: state.stageId,
        attempt_id: attemptId,
        word_id: one.wordId,
        term: word?.term ?? "",
        reading: word?.reading ?? "",
        meaning: word?.meaningEn ?? "",
        reading_input: one.readingInput,
        reading_ok: one.readingOk,
        meaning_input: one.meaningInput,
        meaning_ok: one.meaningOk,
        word_index: index,
      };
    });

    /*
     * まとめが 先。明細だけが 入って まとめが 無い 行を 作らないため
     *（先生の 画面は まとめを 軸に 明細を 引く）。
     * `attempt_id` に unique が ある ので、送り直しは 静かに はじかれる。
     */
    const { error: resultError } = await supabase.from("word_test_results").insert(result);
    if (resultError && resultError.code !== "23505") {
      warn("ことばのテストの 成績", resultError);
      return;
    }
    const { error: answerError } = await supabase
      .from("word_test_answers")
      .upsert(answers, { onConflict: "attempt_id,word_id", ignoreDuplicates: true });
    if (answerError) warn("ことばのテストの こたえ", answerError);
  } catch {
    // 残せなくても 学習は 続く（記録は あとから 見る ための もの）
  }
}

function warn(what: string, error: { code?: string; message: string }): void {
  // 表が まだ 無い（移行SQL 未適用）のは 壊れて いるのでは ない。
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return;
  console.warn(`[word-test] ${what}を 残せませんでした:`, error.message);
}
