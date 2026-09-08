/**
 * もんだい（quizset）の こたえを 1問ずつ 残して 読む
 *
 * ## なぜ 要るか
 * これまで もんだいの 結果は **端末の localStorage にしか 残らなかった**
 * （`@/lib/progress/store` の TestResult は 合計点だけ。1問ごとの 内訳は
 * `quiz-runner.tsx` が 完走の ときに `clearQuizResume` で 捨てて いた）。
 * だから 先生には
 *   - **どの問題で 止まるか**（＝どの説明が 足りて いないか）
 *   - **その学生が どう 答えたか**（＝どこを 誤解して いるか）
 * が 一度も 見えなかった。会話側の `meeting_turn_logs` と 同じ 考え方で、
 * 1問ぶんを 1行 残して 管理画面で 読む。
 *
 * ## 読むのは 先生の 画面（`/admin/records`）
 * ここは **書く 側だけ**を 持つ。読み出しと 集計（設問ごとの 正答率・まちがえた こたえ・
 * 生徒ごとの 何回目）は 2026-09-04 に「学習の きろく」へ 移した——
 * 5種類の 記録を 同じ 絞り込み（所属・期生・メンバー・ステージ・単元）で 見る ためで、
 * ここに 読み手を 残すと **同じ 集計が 2か所に 育つ**（片方だけ 直る）。
 *
 * ## 書き込みは 送りっぱなし
 * 記録の ために 学習が 止まるのが いちばん まずい。だから 保存は 待たないし、
 * 失敗しても 何も しない。**ただし 黙って 消えるのは 別の 問題**なので、
 * supabase-js が 投げずに 返す `{ error }` は 必ず 受け取って 開発時に 出す
 * （投げないことを 知らずに try/catch で 囲むと、永久に 空の 画面が できる）。
 */
"use client";

import type { QuizResult } from "@/components/quiz/quiz-reducer";
import type { QuizQuestion } from "@/content/schema";
import { createClient } from "@/lib/supabase/client";

/** 表の名前は1か所に置く（読みと書きの2か所で使うので、文字列を2度書くと片方だけ直す事故が起きる）。 */
const TABLE = "quiz_results";

/**
 * テーブルがまだ無いときのコード。**2つある**。
 * - `42P01` … Postgres が返す「そんな表は無い」
 * - `PGRST205` … PostgREST 12.2 以降が、スキーマキャッシュに無い表に対して先に返す
 * 片方しか見ないと、マイグレーション未実行のときに「じゅんびちゅう」ではなく
 * 生のエラー文が先生の画面に出る。
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/** 1問ぶんの行（DBの列名とそろえる。ここがずれると1行も入らない）。 */
export interface QuizResultRow {
  readonly profile_id: string;
  readonly quiz_set_id: string;
  readonly question_id: string;
  readonly question_index: number;
  readonly question_type: string;
  readonly answer_text: string;
  readonly correct: boolean;
  readonly earned: number;
  readonly max_points: number;
  readonly full_set: boolean;
  readonly attempt_id: string;
  readonly created_at?: string;
}

/**
 * 1回の挑戦をまとめる鍵を作る。
 *
 * `crypto.randomUUID` は **安全なコンテキスト（https か localhost）でしか 生えない**。
 * 古い端末や http の検証環境でも **uuid として 妥当な形**を返す——列は uuid なので、
 * 形の崩れた鍵は Postgres が 22P02 で弾き、その挑戦が **丸ごと 消える**（しかも無音）。
 * ここで 欲しいのは 暗号の 強さではなく「同じ1回の 行が まとまること」だけである。
 */
export function newAttemptId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (Number(c) ^ (Math.floor(Math.random() * 256) & (15 >> (Number(c) / 4)))).toString(16),
    );
  }
}

/**
 * 1回の挑戦ぶん（複数問）をまとめて残す。**待たない・投げない。**
 *
 * @param profileId ログインしている学習者。null（デモモード）なら何もしない
 * @param fullSet   教材まるごとの挑戦か（false = まちがえた問題だけのやり直し）
 */
export async function saveQuizResults({
  profileId,
  quizSetId,
  questions,
  results,
  attemptId,
  fullSet,
}: {
  profileId: string | null;
  quizSetId: string;
  questions: readonly QuizQuestion[];
  results: readonly QuizResult[];
  attemptId: string;
  fullSet: boolean;
}): Promise<void> {
  if (!profileId || results.length === 0) return;
  const supabase = createClient();
  if (!supabase) return;

  const indexOf = new Map(questions.map((q, i) => [q.id, i]));
  const rows: QuizResultRow[] = results.flatMap((result) => {
    const question = questions.find((q) => q.id === result.questionId);
    if (!question) return [];
    return [
      {
        profile_id: profileId,
        quiz_set_id: quizSetId,
        question_id: result.questionId,
        question_index: indexOf.get(result.questionId) ?? 0,
        question_type: question.type,
        answer_text: result.answer,
        correct: result.correct,
        earned: result.earned,
        max_points: question.points,
        full_set: fullSet,
        attempt_id: attemptId,
      },
    ];
  });
  if (rows.length === 0) return;

  // `ignoreDuplicates: true` は必須。既定の upsert は ON CONFLICT DO UPDATE を生み、
  // update 権限を要求する——この表に update ポリシーは **わざと置いていない**ので、
  // 既定のままだと RLS に黙って全部落とされる。
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "attempt_id,question_id", ignoreDuplicates: true });

  if (error) {
    // supabase-js は **投げずに 返す**ので、`{ error }` を 受け取らないと 永久に 気づけない
    // （try/catch で 囲んでも 入らない）。先生の 画面が 空のままなら、まず ここを 見る。
    // 学習者の 画面は 止めない（ここで throw しない）。
    console.warn("[quiz-results] 記録できませんでした:", error.message);
  }
}
