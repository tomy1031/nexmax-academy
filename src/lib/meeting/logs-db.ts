"use client";

import { createClient } from "@/lib/supabase/client";
import type { JudgeGrade } from "@/lib/meeting/judge";
import type { MeetingTurnJudge } from "@/lib/meeting/log";

/**
 * ミーティングの記録を読む（先生の画面）
 *
 * 読めるのは本人と先生だけ（RLS）。発話には名前・出身が入るので、
 * ここで誰でも読める形に開かない。
 *
 * ## 何を見たいのか
 * 会話の中身そのものより、**質問ごとの「もう いちど」率**がいちばん効く。
 * ある質問だけ高いなら、学生ではなく**その質問のヒントの作りが悪い**。
 * 言い直しのあとに上がったかも見る（learning が起きた証拠）。
 */

export interface MeetingLogRow {
  id: string;
  profile_id: string;
  meeting_id: string;
  question_id: string;
  attempt: number;
  mode: "text" | "voice";
  utterance: string;
  /** 見かたは **持って いる ぶんだけ**（社長との 会話には 軸が 無い）。 */
  judge: MeetingTurnJudge | null;
  grade: JudgeGrade | null;
  fallback: string;
  model: string;
  latency_ms: number;
  created_at: string;
}

export type MeetingLogsResult =
  | { ok: true; rows: MeetingLogRow[] }
  /** preparing = 表がまだ無い（マイグレーション未適用）。壊れているのではない。 */
  | { ok: false; preparing: boolean; message: string };

/** 一度に読む上限。全部読むと、学期の終わりに管理画面が開かなくなる。 */
const LIMIT = 500;

export async function fetchMeetingLogs(): Promise<MeetingLogsResult> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  const { data, error } = await supabase
    .from("meeting_turn_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) {
    // 表がまだ無い（42P01）ときは「これから使える」状態として伝える
    const preparing = error.code === "42P01";
    return {
      ok: false,
      preparing,
      message: preparing
        ? "きろくの 表が まだ ありません。supabase/migrations の meeting_turn_logs を 実行してください。"
        : "きろくを 読めませんでした。少し待って もう一度 ためしてください。",
    };
  }
  return { ok: true, rows: (data ?? []) as MeetingLogRow[] };
}

export interface QuestionStat {
  questionId: string;
  turns: number;
  veryGood: number;
  good: number;
  miss: number;
  /** AIに通せなかった回数（キーが無い・混んでいる等）。 */
  fallback: number;
  /** 言い直しまで行った回数（attempt が2以上）。 */
  retried: number;
}

/**
 * 質問ごとに畳む。
 *
 * 並びは**「もう いちど」の多い順**。先生が最初に見るべきなのは、
 * 一番つまずいている質問だから（一覧を上から読むだけで直す順が分かる）。
 */
export function statsByQuestion(rows: readonly MeetingLogRow[]): QuestionStat[] {
  const map = new Map<string, QuestionStat>();
  for (const row of rows) {
    const stat = map.get(row.question_id) ?? {
      questionId: row.question_id,
      turns: 0,
      veryGood: 0,
      good: 0,
      miss: 0,
      fallback: 0,
      retried: 0,
    };
    stat.turns += 1;
    if (row.grade === "veryGood") stat.veryGood += 1;
    if (row.grade === "good") stat.good += 1;
    if (row.grade === "miss") stat.miss += 1;
    if (row.fallback !== "none") stat.fallback += 1;
    if (row.attempt > 1) stat.retried += 1;
    map.set(row.question_id, stat);
  }
  return [...map.values()].sort(
    (a, b) => b.miss / Math.max(b.turns, 1) - a.miss / Math.max(a.turns, 1),
  );
}
