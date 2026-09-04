/**
 * 学習の きろくを **1つの 表の かたち**に そろえる
 *
 * ## なぜ そろえるか
 * 記録は 5種類 ある（進み具合・もんだい・ことば・会話・リスニング）。種類ごとに
 * 絞り込みと 表と CSV を 書くと 同じ ものが 5つに 増え、**片方だけ 直る**
 *（学校で 絞れるのに 期生で 絞れない 表、CSV に 名前が 出ない 表）。
 * だから 中身を 先に `RecordRow` へ 落として、絞り込み・並べ・表示・CSV は 1本に する。
 *
 * ## 先頭の 5列は 種類が 変わっても 同じ
 * だれ（学生・所属）と どこ（ステージ・単元・種別）。先生は 表を 横に 読む ので、
 * 種類を 切り替えるたびに 列の 意味が 動くと 読めなく なる。
 *
 * ## 純関数に する
 * ブラウザが 無い ところでも 単体テストで 確かめられる ように、DB も 画面も 知らない。
 */

import type { ContentRefType } from "@/content/schema";
import { contentKindMeta } from "@/lib/content-kinds";
import type { ProfileRow } from "@/lib/profile-db";
import { formatSchool } from "@/lib/school";
import type { UnitRef } from "@/lib/records/units";
import type {
  ContentProgressRecord,
  ListeningRecord,
  MeetingRecord,
  QuizRecord,
  TalkRecord,
  WordAnswerRecord,
  WordTestRecord,
} from "@/lib/records/records-db";

export interface RecordColumn {
  readonly key: string;
  readonly label: string;
}

export interface RecordRow {
  /** だれの 記録か（メンバーでの 絞り込みに 使う）。 */
  readonly profileId: string;
  /** どの 教材の 記録か（ステージ・単元での 絞り込みに 使う）。 */
  readonly unitId: string;
  /** 並べ替えに 使う 時こく（ISO）。 */
  readonly at: string;
  readonly cells: Readonly<Record<string, string>>;
}

export interface RecordTable {
  readonly columns: readonly RecordColumn[];
  readonly rows: readonly RecordRow[];
}

/** 記録の 種類（画面の タブ）。 */
export const RECORD_KINDS = [
  { id: "progress", icon: "📈", label: "進み具合" },
  { id: "quiz", icon: "✏️", label: "もんだいの こたえ" },
  { id: "word", icon: "🕹️", label: "ことばの テスト" },
  { id: "talk", icon: "💬", label: "会話" },
  { id: "listening", icon: "🎧", label: "リスニング" },
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number]["id"];

/** どの 種類でも 先頭に 出る 5列。 */
const COMMON_COLUMNS: readonly RecordColumn[] = [
  { key: "student", label: "学生" },
  { key: "school", label: "所属" },
  { key: "stage", label: "ステージ" },
  { key: "unit", label: "単元" },
  { key: "type", label: "種別" },
];

/* ------------------------------------------------------------------ *
 * 引き当て
 * ------------------------------------------------------------------ */

export interface Lookups {
  readonly profiles: ReadonlyMap<string, ProfileRow>;
  readonly units: ReadonlyMap<string, UnitRef>;
}

export function buildLookups(profiles: readonly ProfileRow[], units: readonly UnitRef[]): Lookups {
  return {
    profiles: new Map(profiles.map((profile) => [profile.id, profile])),
    units: new Map(units.map((unit) => [unit.id, unit])),
  };
}

/**
 * 先頭の 5列。
 *
 * **消えた 学生・消えた 教材も 行として 出す**（値は 空か id そのまま）。
 * 引けなかった 行を 落とすと、先生から見て 記録が 理由なく 減る——
 * 「無い」と「引けない」は 別物である。
 */
function commonCells(profileId: string, unitId: string, lookups: Lookups): Record<string, string> {
  const profile = lookups.profiles.get(profileId);
  const unit = lookups.units.get(unitId);
  return {
    student: profile?.display_name || profile?.email || "（消えた 学生）",
    school: profile ? formatSchool(profile) : "",
    stage: unit?.stageTitle ?? "",
    unit: unit?.title ?? unitId,
    type: unit ? contentKindMeta(unit.type as ContentRefType).label : "",
  };
}

/** 日時は 先生が 読む ので **秒まで 出さない**（表が 横に 伸びるだけ）。 */
export function formatAt(iso: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/* ------------------------------------------------------------------ *
 * 種類ごとの 組み立て
 * ------------------------------------------------------------------ */

export function progressTable(
  records: readonly ContentProgressRecord[],
  lookups: Lookups,
): RecordTable {
  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "status", label: "じょうたい" },
      { key: "position", label: "しおり" },
      { key: "completedAt", label: "おわった とき" },
      { key: "updatedAt", label: "さいごに 動いた とき" },
    ],
    rows: records.map((record) => ({
      profileId: record.profile_id,
      unitId: record.content_id,
      at: record.updated_at,
      cells: {
        ...commonCells(record.profile_id, record.content_id, lookups),
        status: record.status === "completed" ? "おわった" : "とちゅう",
        position: formatPosition(record.position),
        completedAt: formatAt(record.completed_at ?? ""),
        updatedAt: formatAt(record.updated_at),
      },
    })),
  };
}

/** しおりは 教材ごとに 形が ちがう。**そのまま 読める 形**にして 出す。 */
function formatPosition(position: Record<string, number> | null): string {
  if (!position) return "";
  const parts = Object.entries(position).map(([key, value]) => `${key}=${value}`);
  return parts.join(" ");
}

export function quizTable(records: readonly QuizRecord[], lookups: Lookups): RecordTable {
  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "question", label: "もんだい" },
      { key: "answer", label: "学生の こたえ" },
      { key: "correct", label: "正誤" },
      { key: "points", label: "点" },
      { key: "fullSet", label: "まるごと" },
      { key: "attempt", label: "挑戦の 鍵" },
      { key: "at", label: "日時" },
    ],
    rows: records.map((record) => ({
      profileId: record.profile_id,
      unitId: record.quiz_set_id,
      at: record.created_at,
      cells: {
        ...commonCells(record.profile_id, record.quiz_set_id, lookups),
        // 何問目かを 添える。設問IDだけでは 先生が 教材を 開かないと 分からない。
        question: `Q${record.question_index + 1} ${record.question_id}`,
        // 空 = 何も 書かずに「こたえを 見る」を 押した。**そこで 詰まった 証拠**なので
        // 空欄の ままに せず、そう 書く。
        answer: record.answer_text === "" ? "（書いて いません）" : record.answer_text,
        correct: record.correct ? "○" : "×",
        points: `${record.earned}/${record.max_points}`,
        fullSet: record.full_set ? "まるごと" : "まちがえた ぶんだけ",
        attempt: record.attempt_id.slice(0, 8),
        at: formatAt(record.created_at),
      },
    })),
  };
}

/**
 * ことばの テストは **1語 ＝ 1行**（明細）に して、その回の 点を 各行に 添える。
 *
 * 成績だけの 表と 明細の 表を 分けると、先生は 2つの 表を 突き合わせる ことに なる。
 * 知りたいのは いつも「この子は この語を どう 打ったか」なので、明細を 主に する。
 */
export function wordTable(
  answers: readonly WordAnswerRecord[],
  results: readonly WordTestRecord[],
  lookups: Lookups,
): RecordTable {
  const byAttempt = new Map(results.map((result) => [result.attempt_id, result]));
  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "word", label: "ことば" },
      { key: "reading", label: "正しい 読み" },
      { key: "readingInput", label: "学生が 打った 読み" },
      { key: "readingOk", label: "読み" },
      { key: "meaning", label: "正しい いみ" },
      { key: "meaningInput", label: "学生が えらんだ いみ" },
      { key: "meaningOk", label: "いみ" },
      { key: "mode", label: "遊びかた" },
      { key: "score", label: "その回の 点" },
      { key: "passed", label: "合否" },
      { key: "at", label: "日時" },
    ],
    rows: answers.map((answer) => {
      const result = byAttempt.get(answer.attempt_id);
      return {
        profileId: answer.profile_id,
        unitId: answer.stage_id,
        at: answer.created_at,
        cells: {
          ...commonCells(answer.profile_id, answer.stage_id, lookups),
          word: answer.term || answer.word_id,
          reading: answer.reading,
          // 空 = 一度も 打たなかった（時間切れ・いみだけの 遊びかた）。
          readingInput: answer.reading_input === "" ? "（打って いません）" : answer.reading_input,
          // null は「読みを 聞いて いない」。**0点 と 見分ける**ために 空欄に しない。
          readingOk: answer.reading_ok === null ? "—" : answer.reading_ok ? "○" : "×",
          meaning: answer.meaning,
          meaningInput: answer.meaning_input === "" ? "（時間ぎれ）" : answer.meaning_input,
          meaningOk: answer.meaning_ok ? "○" : "×",
          mode: modeLabel(result?.mode ?? ""),
          score: result ? `${result.score}/${result.max_score}` : "",
          // 合否を 名乗れるのは 本番だけ。れんしゅうの 行に「不合格」と 出さない。
          passed: result
            ? result.mode !== "test"
              ? "—"
              : result.passed
                ? "合格"
                : "もう いちど"
            : "",
          at: formatAt(answer.created_at),
        },
      };
    }),
  };
}

function modeLabel(mode: string): string {
  if (mode === "test") return "テスト";
  if (mode === "practice") return "れんしゅう";
  if (mode === "quiz") return "いみだけ";
  return mode;
}

const GRADE_LABEL: Record<string, string> = {
  veryGood: "すばらしい",
  good: "つたわった",
  miss: "もう いちど",
};

/**
 * 会話は **ミーティングと たいわ を 1つの 表**に する。
 *
 * 別々に すると、先生は「この子は 話せて いるか」を 2つの 画面を 行き来して 見る
 * ことに なる。形は ちがうが（たいわ は 相手の 返事も 残る）、聞きたい ことは 同じ。
 * ちがう ところは `kind` と `note` の 列に 逃がす。
 */
export function talkTable(
  meetings: readonly MeetingRecord[],
  talks: readonly TalkRecord[],
  lookups: Lookups,
): RecordTable {
  const rows: RecordRow[] = [
    ...meetings.map((record) => ({
      profileId: record.profile_id,
      unitId: record.meeting_id,
      at: record.created_at,
      cells: {
        ...commonCells(record.profile_id, record.meeting_id, lookups),
        kind: "ミーティング",
        speaker: "学生",
        topic: record.question_id,
        body: record.utterance,
        way: record.mode === "voice" ? "こえ" : "もじ",
        note:
          (record.grade ? (GRADE_LABEL[record.grade] ?? record.grade) : "") +
          // AIに 通せなかった 回は そう 書く。見かたが 空なのと 「AIなし」は 別物。
          (record.fallback && record.fallback !== "none" ? `（AIなし: ${record.fallback}）` : ""),
        attempt: `${record.attempt}回目`,
        at: formatAt(record.created_at),
      },
    })),
    ...talks.map((record) => ({
      profileId: record.profile_id,
      unitId: record.talk_id,
      at: record.created_at,
      cells: {
        ...commonCells(record.profile_id, record.talk_id, lookups),
        kind: "たいわ",
        speaker: record.speaker === "learner" ? "学生" : "あいて",
        topic: record.opened_req_id === "" ? "" : `聞き出せた: ${record.opened_req_id}`,
        body: record.body,
        way: record.mode === "voice" ? "こえ" : "もじ",
        note: `${record.opened_count}/${record.req_total} 聞き出せた`,
        attempt: `${record.turn_index + 1}番目`,
        at: formatAt(record.created_at),
      },
    })),
  ];
  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "kind", label: "しゅるい" },
      { key: "speaker", label: "話し手" },
      { key: "body", label: "話した こと" },
      { key: "topic", label: "しつもん／聞き出せた こと" },
      { key: "way", label: "やりかた" },
      { key: "note", label: "見かた" },
      { key: "attempt", label: "何回目" },
      { key: "at", label: "日時" },
    ],
    rows,
  };
}

export function listeningTable(records: readonly ListeningRecord[], lookups: Lookups): RecordTable {
  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "inputs", label: "学生が 当てた ことば" },
      { key: "found", label: "いくつ" },
      { key: "reveal", label: "原稿が 開いた %" },
      { key: "left", label: "のこりの キーワード" },
      { key: "updatedAt", label: "さいごに 動いた とき" },
    ],
    rows: records.map((record) => ({
      profileId: record.profile_id,
      unitId: record.listening_id,
      at: record.updated_at,
      cells: {
        ...commonCells(record.profile_id, record.listening_id, lookups),
        inputs: (record.inputs ?? []).join(" / "),
        found: String((record.inputs ?? []).length),
        reveal: `${record.reveal_percent}%`,
        left: String(record.keywords_left),
        updatedAt: formatAt(record.updated_at),
      },
    })),
  };
}

/* ------------------------------------------------------------------ *
 * 絞り込みと 並べ
 * ------------------------------------------------------------------ */

export interface RecordFilter {
  /** "" = ぜんぶ。 */
  readonly university: string;
  /** 0 = ぜんぶ。-1 = 未設定の 人だけ。 */
  readonly cohort: number;
  /** "" = ぜんぶ。 */
  readonly profileId: string;
  /** "" = ぜんぶ。 */
  readonly stageId: string;
  /** "" = ぜんぶ。 */
  readonly unitId: string;
  /** 学生の 名前・こたえの 中の ことば（空 = 絞らない）。 */
  readonly text: string;
}

export const EMPTY_FILTER: RecordFilter = {
  university: "",
  cohort: 0,
  profileId: "",
  stageId: "",
  unitId: "",
  text: "",
};

/** 絞り込みに 通る 学生か。 */
export function matchesProfile(profile: ProfileRow | undefined, filter: RecordFilter): boolean {
  if (filter.profileId !== "" && profile?.id !== filter.profileId) return false;
  if (filter.university !== "" && profile?.university !== filter.university) return false;
  if (filter.cohort > 0 && profile?.cohort !== filter.cohort) return false;
  // 「未設定」は 0 の 人（この列を 足す 前の 行）。**探せる ように する**——
  // 未設定の ままの 学生は、先生が 声を かける 相手である。
  if (filter.cohort === -1 && (profile?.cohort ?? 0) !== 0) return false;
  return true;
}

export function filterRows(
  table: RecordTable,
  filter: RecordFilter,
  lookups: Lookups,
): readonly RecordRow[] {
  const needle = filter.text.trim().toLowerCase();
  return (
    table.rows
      .filter((row) => {
        if (!matchesProfile(lookups.profiles.get(row.profileId), filter)) return false;
        if (filter.unitId !== "" && row.unitId !== filter.unitId) return false;
        if (filter.stageId !== "") {
          const unit = lookups.units.get(row.unitId);
          if ((unit?.stageId ?? "") !== filter.stageId) return false;
        }
        if (needle !== "") {
          const haystack = Object.values(row.cells).join(" ").toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      /*
       * 新しい ものが 上。先生が 開くのは たいてい **授業の 直後**で、見たいのは
       * さっきの 1コマである。古い順に すると、毎回 いちばん 下まで 送る ことに なる。
       */
      .toSorted((a, b) => b.at.localeCompare(a.at))
  );
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * 表の 見えて いる ぶんを そのまま CSV に する。
 *
 * 先頭に BOM を 付けるのは Excel が UTF-8 と 読み違えない ため
 *（`buildPersonalityCsv` と 同じ）。改行は CRLF。
 */
export function buildRecordsCsv(
  columns: readonly RecordColumn[],
  rows: readonly RecordRow[],
): string {
  const header = columns.map((column) => escapeCsv(column.label));
  const body = rows.map((row) => columns.map((column) => escapeCsv(row.cells[column.key] ?? "")));
  return `${"\uFEFF"}${[header, ...body].map((line) => line.join(",")).join("\r\n")}`;
}
