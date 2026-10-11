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
 * ## 絞り込みは **DB へ 渡す**（手もとで ふるいに かけない）
 * 上限（`RECORDS_LIMIT`）は 新しい ほうから 数えるので、取って きた あとに
 * 手もとで 絞ると **上限より 前の 記録には 永久に たどり着けない**。
 * ことばの 明細は 1語 1行（30人 × 20語 × 2回 = 1200行／1コマ）なので、
 * 2コマで 上限に 届く——「先週の この子」が 誰にも 見えなく なる。
 * しかも 画面は「絞り込んでください」と 案内する ので、**言われた とおりに しても
 * 何も 増えない**（いちばん 静かに 効く 取りこぼし）。
 * だから 学生・ステージ・単元は `where` に して 送り、絞るたびに 読み直す。
 *
 * ## 表が まだ 無い ときは「じゅんびちゅう」
 * 移行SQL が 流れる 前でも 画面は 開く（`fetchMeetingLogs` と 同じ 流儀）。
 * 生の エラー文を 先生に 見せない——直せるのは 先生では ないので、
 * 見せても 不安に なるだけである。
 */
"use client";

import { createClient } from "@/lib/supabase/client";
import type { JudgeGrade } from "@/lib/meeting/judge";
import type { MeetingTurnJudge } from "@/lib/meeting/log";

/** 一度に 読む 上限。全部 読むと 学期の 終わりに 画面が 開かなく なる。 */
export const RECORDS_LIMIT = 2000;

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export type RecordsResult<Row> =
  | { readonly ok: true; readonly rows: Row[]; readonly truncated: boolean }
  /** preparing = 表が まだ 無い（移行SQL 未適用）。壊れて いるのでは ない。 */
  | { readonly ok: false; readonly preparing: boolean; readonly message: string };

/**
 * DB へ 渡す 絞り込み。
 *
 * `profileIds` が **空の 配列**（＝条件に 合う 学生が 1人も いない）と `null`（絞らない）
 * は ちがう。空を 「絞らない」と 読むと、いない はずの 学生の 記録が 全員ぶん 出る。
 */
export interface RecordsQuery {
  /** その 学生たちの ぶんだけ。null = 絞らない。 */
  readonly profileIds: readonly string[] | null;
  /** その 教材の ぶんだけ（記録の 表ごとに 列の 名前が ちがう）。null = 絞らない。 */
  readonly unitIds: readonly string[] | null;
}

export const NO_QUERY: RecordsQuery = { profileIds: null, unitIds: null };

async function fetchTable<Row>(
  table: string,
  order: string,
  unitColumn: string,
  query: RecordsQuery,
): Promise<RecordsResult<Row>> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  // 条件に 合う 学生・教材が 1つも 無いなら、読みに 行かずに 空を 返す
  //（`.in(col, [])` は 0件だが、往復は 払う）。
  if (query.profileIds?.length === 0 || query.unitIds?.length === 0) {
    return { ok: true, rows: [], truncated: false };
  }
  let request = supabase.from(table).select("*");
  if (query.profileIds) request = request.in("profile_id", [...query.profileIds]);
  if (query.unitIds) request = request.in(unitColumn, [...query.unitIds]);
  const { data, error } = await request.order(order, { ascending: false }).limit(RECORDS_LIMIT);
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
  /**
   * AIが 学生に 聞いた 文そのもの。
   *
   * 空 = この 列（移行SQL 20260909120000）より 前の 記録。そのときは 教材から
   * 引き直す（`talkTable`）——ヘンディさんの ミーティングは それで 出るが、
   * 松井社長との たいわ は しつもんを AI が その場で 作る ので 引けない。
   *
   * `select *` は **列が まだ 無い DB では この 鍵を 返さない**ので、任意に する
   *（移行SQL が 流れる 前でも 画面は 開く）。
   */
  ask?: string;
  attempt: number;
  mode: "text" | "voice";
  utterance: string;
  /**
   * AIの 見かたの 生JSON（返事・ほめた ところ・直す ところ・お手本・軸）。
   *
   * **持って いる ぶんだけ**（松井社長との 会話には 軸が 無い）。先生の 画面は
   * ここまで 開く——`grade` だけでは「もう いちど と 言われた」ことしか 分からず、
   * **何を どう 直せば よかったか**が 見えない。
   */
  judge: MeetingTurnJudge | null;
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

/**
 * 修了証（`completion_certificates` の 1行）。
 *
 * 時刻・名前・照合番号・何回目かは **DB が 押した もの**（端末の 申告ではない）。
 * 先生は 学習者が 出した 画像の 照合番号を ここと 突き合わせる。
 */
export interface CertificateRecord {
  id: string;
  profile_id: string;
  /** 教材ID（`content_progress.content_id` と 同じ 値）。 */
  content_id: string;
  /** 'listening' / 'typing' / …（ステージの contents[].type と 同じ 名前）。 */
  kind: string;
  attempt: number;
  perfect: boolean;
  score: number | null;
  max_score: number | null;
  misses: number | null;
  detail: Record<string, unknown> | null;
  /** 出した 時の 名前（あとで 設定を 直しても 変わらない）。 */
  learner_name: string;
  /** 照合番号（8文字）。 */
  code: string;
  issued_at: string;
}

/* ------------------------------------------------------------------ *
 * 読む
 * ------------------------------------------------------------------ */

export function fetchContentProgress(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<ContentProgressRecord>> {
  return fetchTable<ContentProgressRecord>("content_progress", "updated_at", "content_id", query);
}

export function fetchQuizRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<QuizRecord>> {
  return fetchTable<QuizRecord>("quiz_results", "created_at", "quiz_set_id", query);
}

export function fetchWordTestRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<WordTestRecord>> {
  return fetchTable<WordTestRecord>("word_test_results", "created_at", "stage_id", query);
}

export function fetchWordAnswerRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<WordAnswerRecord>> {
  return fetchTable<WordAnswerRecord>("word_test_answers", "created_at", "stage_id", query);
}

export function fetchTalkRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<TalkRecord>> {
  return fetchTable<TalkRecord>("talk_turn_logs", "created_at", "talk_id", query);
}

export function fetchMeetingRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<MeetingRecord>> {
  return fetchTable<MeetingRecord>("meeting_turn_logs", "created_at", "meeting_id", query);
}

/**
 * 「どこに 記録が あるか」の 見取り図（view `record_index` の 1行）。
 *
 * 中身は 持たない——(種類, 学生, 教材) ごとの **件数だけ**。
 */
export interface RecordIndexRow {
  kind: string;
  profile_id: string;
  unit_id: string;
  n: number;
}

/**
 * 見取り図を 読む。
 *
 * ## なぜ 素の 表を 数えに 行かないか
 * 画面は 新しい ほうから `RECORDS_LIMIT` 行までしか 読まない。単元の 一覧を
 * それで 作ると、上限に 当たった 日から **古い 教材が 黙って 消える**——
 * 先生には「その 教材の 記録が 無い」ようにしか 見えない。数えるのは DB の 仕事。
 *
 * 上限を 付けないのは、返るのが (種類, 学生, 教材) ごとの 1行だけ だから
 *（学期を 通しても 数千行）。
 */
export async function fetchRecordIndex(): Promise<RecordsResult<RecordIndexRow>> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  const { data, error } = await supabase.from("record_index").select("*");
  if (error) {
    const preparing = MISSING_TABLE_CODES.has(error.code ?? "");
    return {
      ok: false,
      preparing,
      message: preparing
        ? "記録の 見取り図（record_index）が まだ ありません。単元と 種類の 一覧は しぼらずに 出します。"
        : "記録の 見取り図を 読めませんでした。単元と 種類の 一覧は しぼらずに 出します。",
    };
  }
  return { ok: true, rows: (data ?? []) as RecordIndexRow[], truncated: false };
}

/** 生徒の 一覧の 1人ぶん（view `learner_summary`・願い #599）。 */
export interface LearnerSummaryRow {
  profile_id: string;
  /** 終えた 教材の id（どの ステージかは 画面が 教材の 台帳と 照らす）。 */
  completed_ids: string[];
  word_sets: number;
  word_passed_sets: number;
  /** 同じ ことばの テストで 3回 以上 不合格の まま の セット数。 */
  word_stuck_sets: number;
  /** ミーティングで 評価の ついた 発言の 数と、そのうち miss の 数。 */
  talk_graded: number;
  talk_miss: number;
  certificates: number;
  /** 最後に 動いた 時刻（何も して いなければ null）。 */
  last_at: string | null;
}

/** もんだいセットの 初回の 点（view `learner_quiz_first`）。 */
export interface LearnerQuizFirstRow {
  profile_id: string;
  quiz_set_id: string;
  first_score: number;
  first_max: number;
  first_at: string;
  /** 丸ごと 通した 回数。 */
  runs: number;
  /**
   * 初回の 正解した 問題の 数と 問題の 数。合否は これで 決める（学習者の 画面と 同じ式）。
   * 移行SQL 20261011130000 より 前の view には 無いので 省略可（そのときは 点で 代わりに 数える）。
   */
  first_correct?: number | null;
  first_questions?: number | null;
}

/** サーバが 1回に 返す 行の 上限（Supabase の 既定）。これを 1ページと して 読む。 */
const PAGE_ROWS = 1000;
/** 1回の 読み込みで 読む 行の 上限（ここまで 来たら 打ち切って 知らせる）。 */
const MAX_PAGED_ROWS = 20000;

/**
 * 並びを 決めた 問い合わせを、ページを 送って **ぜんぶ** 読む。
 *
 * サーバは 1回に 返す 行数に 上限が あり、超えた ぶんは **黙って 切られる**（エラーに ならない）。
 * 先生の 画面で それが 起きると、古い 記録や 一部の 生徒が 理由なく 消える（2026-10-11 の レビュー）。
 */
async function readAllPages<Row>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<
  | { readonly ok: true; readonly rows: Row[]; readonly truncated: boolean }
  | { readonly ok: false; readonly error: { code?: string; message: string } }
> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_PAGED_ROWS; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { ok: false, error };
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < PAGE_ROWS) return { ok: true, rows, truncated: false };
  }
  return { ok: true, rows, truncated: true };
}

/**
 * 生徒の 一覧の 材料を 2つの view から 読む。行は **人数**（と 人数 × セット数）
 * なので、生の 記録の 2000行の 上限に 当たらない——学期の 途中で 古い 記録が
 * 数から 消えない ように、数えるのを DB に させて いる。
 */
export async function fetchLearnerRoster(
  profileIds: readonly string[] | null,
  /** 合格ラインの ある もんだいセット（ページの 書きこみフォーム等は 読まない）。 */
  quizSetIds: readonly string[],
): Promise<
  | {
      readonly ok: true;
      readonly summaries: LearnerSummaryRow[];
      readonly quizFirst: LearnerQuizFirstRow[];
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly preparing: boolean; readonly message: string }
> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "生徒の 一覧は じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  if (profileIds?.length === 0) {
    return { ok: true, summaries: [], quizFirst: [], truncated: false };
  }

  const [summary, quiz] = await Promise.all([
    readAllPages<LearnerSummaryRow>((from, to) => {
      let request = supabase.from("learner_summary").select("*");
      if (profileIds) request = request.in("profile_id", [...profileIds]);
      return request.order("profile_id").range(from, to);
    }),
    quizSetIds.length === 0
      ? Promise.resolve({ ok: true as const, rows: [] as LearnerQuizFirstRow[], truncated: false })
      : readAllPages<LearnerQuizFirstRow>((from, to) => {
          let request = supabase
            .from("learner_quiz_first")
            .select("*")
            .in("quiz_set_id", [...quizSetIds]);
          if (profileIds) request = request.in("profile_id", [...profileIds]);
          return request.order("profile_id").order("quiz_set_id").range(from, to);
        }),
  ]);
  const failed = !summary.ok ? summary.error : !quiz.ok ? quiz.error : null;
  if (failed || !summary.ok || !quiz.ok) {
    const preparing = MISSING_TABLE_CODES.has(failed?.code ?? "");
    return {
      ok: false,
      preparing,
      message: preparing
        ? "生徒の 一覧の 材料（learner_summary）が まだ ありません。supabase/migrations が 流れると 見られます。"
        : "生徒の 一覧を 読めませんでした。少し待って もう一度 ためしてください。",
    };
  }
  return {
    ok: true,
    summaries: summary.rows,
    quizFirst: quiz.rows,
    truncated: summary.truncated || quiz.truncated,
  };
}

/**
 * 1人の 記録を、表ごとに **ぜんぶ** 読む（工程ごとの 行った こと・2026-10-11 の レビュー）。
 *
 * `fetchTable` は 新しい ほうから 決まった 数までしか 読まないので、ことばの 明細（1語 1行）の
 * ように 1人で 1000行を 超える 表では、いちばん 古い ＝ 最初の つまずきから 消えて いた。
 */
export async function fetchProfileRows<Row>(
  table: string,
  order: string,
  profileId: string,
): Promise<RecordsResult<Row>> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  const got = await readAllPages<Row>((from, to) =>
    supabase
      .from(table)
      .select("*")
      .eq("profile_id", profileId)
      .order(order, { ascending: true })
      .range(from, to),
  );
  if (!got.ok) {
    const preparing = MISSING_TABLE_CODES.has(got.error.code ?? "");
    return {
      ok: false,
      preparing,
      message: preparing
        ? `きろくの 表（${table}）が まだ ありません。supabase/migrations が 流れると 見られます。`
        : "きろくを 読めませんでした。少し待って もう一度 ためしてください。",
    };
  }
  return { ok: true, rows: got.rows, truncated: got.truncated };
}

export function fetchListeningRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<ListeningRecord>> {
  return fetchTable<ListeningRecord>("listening_results", "updated_at", "listening_id", query);
}

/** 修了証。新しい ほうから（`issued_at` は DB が 打った 時刻）。 */
export function fetchCertificateRecords(
  query: RecordsQuery = NO_QUERY,
): Promise<RecordsResult<CertificateRecord>> {
  return fetchTable<CertificateRecord>("completion_certificates", "issued_at", "content_id", query);
}

/**
 * 照合番号で 1枚を 引く（8けたが ぜんぶ 入った とき）。
 *
 * ふだんの 表は 新しい ほうから 2000行まで しか 読まない ので、古い 修了証の 番号は その 中に
 * 無い ことが ある——本物なのに「0行」と 出て、偽物に 見えて しまう（code-critic の 指摘）。
 * 番号が そろったら DB に 直に 聞く。
 */
export async function fetchCertificateByCode(
  code: string,
): Promise<RecordsResult<CertificateRecord>> {
  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      preparing: true,
      message: "きろくは じゅんびちゅう（データベースの設定後に 見られます）",
    };
  }
  const { data, error } = await supabase
    .from("completion_certificates")
    .select("*")
    .eq("code", code)
    .limit(5);
  if (error) {
    return {
      ok: false,
      preparing: MISSING_TABLE_CODES.has(error.code ?? ""),
      message: "きろくを 読めませんでした。少し待って もう一度 ためしてください。",
    };
  }
  return { ok: true, rows: (data ?? []) as CertificateRecord[], truncated: false };
}
