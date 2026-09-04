/**
 * 学習の きろくを 読む（先生の 画面）
 *
 * 読めるのは 本人と 先生だけ（RLS）。こたえの 文にも 発話にも 名前や 気持ちが
 * 入りうる ので、ここで 誰でも 読める 形に 開かない。
 *
 * ## 1つの タブ ＝ 1つの 表 だけ 読む
 * 5種類を いちどに 読むと、学期の 終わりに 先生の 画面が 開かなく なる。
 * 見て いる タブの 表だけを その場で 読む。
 *
 * ## 表が まだ 無い ときは「じゅんびちゅう」
 * 移行SQL が 流れる 前でも 画面は 開く（`fetchMeetingLogs` と 同じ 流儀）。
 * 生の エラー文を 先生に 見せない——直せるのは 先生では ないので、
 * 見せても 不安に なるだけである。
 */
"use client";

import { createClient } from "@/lib/supabase/client";
import type { JudgeGrade } from "@/lib/meeting/judge";

/** 一度に 読む 上限。全部 読むと 学期の 終わりに 画面が 開かなく なる。 */
export const RECORDS_LIMIT = 2000;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export type RecordsResult<Row> =
  | { readonly ok: true; readonly rows: Row[]; readonly truncated: boolean }
  /** preparing = 表が まだ 無い（移行SQL 未適用）。壊れて いるのでは ない。 */
  | { readonly ok: false; readonly preparing: boolean; readonly message: string };

async function fetchTable<Row>(table: string, order: string): Promise<RecordsResult<Row>> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order(order, { ascending: false })
    .limit(RECORDS_LIMIT);
  if (error) {
    const preparing = MISSING_TABLE_CODES.has(error.code ?? "");
    return {
      ok: false,
      preparing,
      message: preparing
        ? `きろくの 表（${table}）が まだ ありません。supabase/migrations が 流れると 見られます。`
        : "きろくを 読めませんでした。少し待って もう一度 ためしてください。",
    };
  }
  const rows = (data ?? []) as Row[];
  return { ok: true, rows, truncated: rows.length >= RECORDS_LIMIT };
}

/* ------------------------------------------------------------------ *
 * 行の かたち（DBの 列名と そろえる）
 * ------------------------------------------------------------------ */

export interface ContentProgressRecord {
  profile_id: string;
  content_id: string;
  status: "started" | "completed";
  position: Record<string, number> | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface QuizRecord {
  id: string;
  profile_id: string;
  quiz_set_id: string;
  question_id: string;
  question_type: string;
  answer_text: string;
  correct: boolean;
  earned: number;
  max_points: number;
  question_index: number;
  full_set: boolean;
  attempt_id: string;
  created_at: string;
}

export interface WordTestRecord {
  id: string;
  profile_id: string;
  stage_id: string;
  attempt_id: string;
  mode: string;
  score: number;
  max_score: number;
  total: number;
  reading_asked: number;
  reading_correct: number;
  meaning_correct: number;
  passed: boolean;
  game_score: number;
  best_combo: number;
  created_at: string;
}

export interface WordAnswerRecord {
  id: string;
  profile_id: string;
  stage_id: string;
  attempt_id: string;
  word_id: string;
  term: string;
  reading: string;
  meaning: string;
  reading_input: string;
  reading_ok: boolean | null;
  meaning_input: string;
  meaning_ok: boolean;
  word_index: number;
  created_at: string;
}

export interface TalkRecord {
  id: string;
  profile_id: string;
  talk_id: string;
  session_id: string;
  turn_index: number;
  speaker: "learner" | "partner";
  mode: "text" | "voice";
  body: string;
  opened_req_id: string;
  opened_count: number;
  req_total: number;
  created_at: string;
}

export interface MeetingRecord {
  id: string;
  profile_id: string;
  meeting_id: string;
  question_id: string;
  attempt: number;
  mode: "text" | "voice";
  utterance: string;
  grade: JudgeGrade | null;
  fallback: string;
  created_at: string;
}

export interface ListeningRecord {
  profile_id: string;
  listening_id: string;
  inputs: string[] | null;
  reveal_percent: number;
  keywords_left: number;
  updated_at: string;
}

/* ------------------------------------------------------------------ *
 * 読む
 * ------------------------------------------------------------------ */

export function fetchContentProgress(): Promise<RecordsResult<ContentProgressRecord>> {
  return fetchTable<ContentProgressRecord>("content_progress", "updated_at");
}

export function fetchQuizRecords(): Promise<RecordsResult<QuizRecord>> {
  return fetchTable<QuizRecord>("quiz_results", "created_at");
}

export function fetchWordTestRecords(): Promise<RecordsResult<WordTestRecord>> {
  return fetchTable<WordTestRecord>("word_test_results", "created_at");
}

export function fetchWordAnswerRecords(): Promise<RecordsResult<WordAnswerRecord>> {
  return fetchTable<WordAnswerRecord>("word_test_answers", "created_at");
}

export function fetchTalkRecords(): Promise<RecordsResult<TalkRecord>> {
  return fetchTable<TalkRecord>("talk_turn_logs", "created_at");
}

export function fetchMeetingRecords(): Promise<RecordsResult<MeetingRecord>> {
  return fetchTable<MeetingRecord>("meeting_turn_logs", "created_at");
}

export function fetchListeningRecords(): Promise<RecordsResult<ListeningRecord>> {
  return fetchTable<ListeningRecord>("listening_results", "updated_at");
}
