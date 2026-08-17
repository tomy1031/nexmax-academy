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
 * ## いちばん 効くのは 設問ごとの 正答率
 * ある設問だけ 極端に 低いなら、疑うのは 学生ではなく **その設問の 問い方**か
 * **前の 教材の 説明**である。だから `statsByQuestion` は 正答率の **低い順**に 並べる
 * ——先生は 一覧を 上から 読むだけで 直す順が 分かる。
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

/** テーブルがまだ無いときの Postgres のコード（`meeting_turn_logs` の読み側と同じ扱い）。 */
const UNDEFINED_TABLE = "42P01";

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

/** 読み出しの結果。テーブルがまだ無いときは "preparing"（logs-db.ts と同じ扱い）。 */
export type QuizResultsState =
  | { readonly state: "ready"; readonly rows: readonly QuizResultRow[] }
  | { readonly state: "preparing" }
  | { readonly state: "error"; readonly message: string };

/** 先生向け。セットで絞って、新しい順に読む。 */
export async function fetchQuizResults({
  quizSetId,
  profileId,
  limit = 2000,
}: {
  quizSetId?: string;
  profileId?: string;
  limit?: number;
} = {}): Promise<QuizResultsState> {
  const supabase = createClient();
  if (!supabase) return { state: "preparing" };

  let query = supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (quizSetId) query = query.eq("quiz_set_id", quizSetId);
  if (profileId) query = query.eq("profile_id", profileId);

  const { data, error } = await query;
  if (error) {
    if (error.code === UNDEFINED_TABLE) return { state: "preparing" };
    return { state: "error", message: error.message };
  }
  return { state: "ready", rows: (data ?? []) as QuizResultRow[] };
}

/** 設問ごとの集計（先生の画面の主役）。 */
export interface QuizQuestionStat {
  readonly questionId: string;
  readonly questionIndex: number;
  readonly questionType: string;
  readonly answered: number;
  readonly correct: number;
  /** 正答率（0〜1）。答えた人が0なら 0。 */
  readonly rate: number;
  readonly earned: number;
  readonly points: number;
  /** まちがえた人が実際に書いた・選んだ言葉（多い順・最大8件）。 */
  readonly misses: readonly { readonly answer: string; readonly count: number }[];
}

/**
 * 設問ごとにまとめる。**正答率の低い順**に並べる（直す順がそのまま上から読める）。
 * 純関数なので、画面を立てずにテストできる。
 */
export function statsByQuestion(rows: readonly QuizResultRow[]): QuizQuestionStat[] {
  const byQuestion = new Map<string, QuizResultRow[]>();
  for (const row of rows) {
    const list = byQuestion.get(row.question_id) ?? [];
    list.push(row);
    byQuestion.set(row.question_id, list);
  }

  const stats = [...byQuestion.entries()].map(([questionId, list]) => {
    const correct = list.filter((r) => r.correct).length;
    const missCount = new Map<string, number>();
    for (const row of list) {
      if (row.correct) continue;
      // 空文字 = 何も書かずに「こたえを 見る」を押した。これも見せる（そこで詰まった証拠）
      const key = row.answer_text;
      missCount.set(key, (missCount.get(key) ?? 0) + 1);
    }
    return {
      questionId,
      questionIndex: list[0]?.question_index ?? 0,
      questionType: list[0]?.question_type ?? "",
      answered: list.length,
      correct,
      rate: list.length === 0 ? 0 : correct / list.length,
      earned: list.reduce((sum, r) => sum + r.earned, 0),
      points: list.reduce((sum, r) => sum + r.max_points, 0),
      misses: [...missCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([answer, count]) => ({ answer, count })),
    };
  });

  return stats.sort((a, b) => a.rate - b.rate || a.questionIndex - b.questionIndex);
}

/** 1回の挑戦（同じ attempt_id）のまとめ。生徒ごとの一覧に使う。 */
export interface QuizAttemptSummary {
  readonly attemptId: string;
  readonly profileId: string;
  readonly quizSetId: string;
  readonly at: string;
  readonly earned: number;
  readonly points: number;
  readonly answered: number;
  readonly fullSet: boolean;
  /** 何回目の挑戦か（古い順に1から）。端末の申告ではなく、この画面で数える。 */
  readonly nth: number;
}

/**
 * 挑戦ごとにまとめる。**合否は画面側で** `passRate`（教材の値）と比べて出す
 * ——しきい値を DB に焼くと、教材を直した日に過去の行と食い違う。
 */
export function attemptsOf(rows: readonly QuizResultRow[]): QuizAttemptSummary[] {
  const byAttempt = new Map<string, QuizResultRow[]>();
  for (const row of rows) {
    const list = byAttempt.get(row.attempt_id) ?? [];
    list.push(row);
    byAttempt.set(row.attempt_id, list);
  }

  const summaries = [...byAttempt.entries()].map(([attemptId, list]) => {
    const at = list.map((r) => r.created_at ?? "").sort()[0] ?? "";
    return {
      attemptId,
      profileId: list[0]?.profile_id ?? "",
      quizSetId: list[0]?.quiz_set_id ?? "",
      at,
      earned: list.reduce((sum, r) => sum + r.earned, 0),
      points: list.reduce((sum, r) => sum + r.max_points, 0),
      answered: list.length,
      fullSet: list.every((r) => r.full_set),
      nth: 0,
    };
  });

  // 人ごとに古い順で「何回目」をふる（端末に依存しない数え方）
  const byProfile = new Map<string, QuizAttemptSummary[]>();
  for (const s of summaries) {
    const list = byProfile.get(s.profileId) ?? [];
    list.push(s);
    byProfile.set(s.profileId, list);
  }
  const numbered: QuizAttemptSummary[] = [];
  for (const list of byProfile.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    list.forEach((s, i) => numbered.push({ ...s, nth: i + 1 }));
  }
  return numbered.sort((a, b) => b.at.localeCompare(a.at));
}
