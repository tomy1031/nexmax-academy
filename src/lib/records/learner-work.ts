/**
 * 1人の「工程ごとの 行った こと」（2026-10-11・願い #599 第3段）
 *
 * 先生が まず 知りたいのは「各工程の生徒の行ったこと」で、進み具合は「それに付随して
 * わかればいい程度」。だから ステージ（工程）ごとに、その 生徒が **書いた・話した・
 * 打った ことば**を 並べ、進み具合は 教材の 横の 印（✓／途中／まだ）だけに する。
 *
 * ## 読むだけの 教材は 印だけ
 * ページ・まんが・スライド・リンクは「終わったか どうかだけで よい」（同日の 指定）。
 * ただし ページの 書きこみフォームや 調査ツールの こたえが ある ときは、それを 出す
 *（読むだけでは ない）。
 *
 * ## もんだいは 初回を 出す
 * 2回目 以降で 直した 答えより、**1回目に 何と 答えたか**が つまずきを 映す。
 * 丸ごと 通した 回の いちばん 古い 回を 出し、回数は 横に 添える。
 */

import type { ContentRefType } from "@/content/schema";
import type {
  ContentProgressRecord,
  ListeningRecord,
  MeetingRecord,
  QuizRecord,
  TalkRecord,
  WordAnswerRecord,
  WordTestRecord,
} from "@/lib/records/records-db";
import { quizPassed, quizPercent } from "@/lib/quiz/pass-rate";
import { askOf, promptOf, type Lookups } from "@/lib/records/table";
import type { UnitIndex } from "@/lib/records/units";

/** 回答の 無い 教材（印だけ 出す）。書きこみが あれば 回答を 出す。 */
export const READ_ONLY_KINDS: ReadonlySet<ContentRefType> = new Set([
  "article",
  "manga",
  "slides",
  "link",
  "skit",
  "quest",
  "typing",
]);

/** 1人ぶんの 記録（表ごとに 読んだ もの）。 */
export interface LearnerRecords {
  readonly progress: readonly ContentProgressRecord[];
  readonly quiz: readonly QuizRecord[];
  readonly wordTests: readonly WordTestRecord[];
  readonly wordAnswers: readonly WordAnswerRecord[];
  readonly meetings: readonly MeetingRecord[];
  readonly talks: readonly TalkRecord[];
  readonly listening: readonly ListeningRecord[];
}

export type WorkStatus = "done" | "started" | "none";

export interface WorkItem {
  /** 問い・相手の 発言（無ければ 空）。 */
  readonly prompt: string;
  /** 生徒が 書いた・話した・打った ことば。 */
  readonly answer: string;
  /** ⭕ = true・✕ = false・判定 なし = null。 */
  readonly ok: boolean | null;
}

export interface WorkUnit {
  readonly id: string;
  readonly type: ContentRefType;
  readonly title: string;
  readonly status: WorkStatus;
  /** 回答を 出さない（読むだけ・記録の 無い 種類）。 */
  readonly readOnly: boolean;
  /** 横に 添える 一言（「初回 7／10点・3回」など）。 */
  readonly summary: string;
  readonly items: readonly WorkItem[];
}

export interface WorkStage {
  readonly id: string;
  readonly title: string;
  readonly units: readonly WorkUnit[];
  readonly done: number;
  readonly total: number;
  /** この 生徒の 記録が 1つでも あるか（開いて 見せるか）。 */
  readonly touched: boolean;
}

/** 単語の まちがいを 並べる 上限（多すぎると 読めない）。 */
const WORD_MISS_LIMIT = 12;

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

const byTime = <T extends { created_at: string }>(a: T, b: T) =>
  a.created_at.localeCompare(b.created_at);

/** いちばん 早い 行の 時刻（空の 組は 空文字）。 */
const firstAt = <T extends { created_at: string }>(rows: readonly T[]) =>
  rows.reduce((min, row) => (min === "" || row.created_at < min ? row.created_at : min), "");

/** もんだい・書きこみフォーム・調査ツール（どれも quiz_results に 入る）。 */
function quizWork(
  rows: readonly QuizRecord[],
  unitId: string,
  lookups: Lookups,
  /** 合格ライン（%）。もんだいセットで ない（書きこみフォーム・調査の こたえ）ときは null。 */
  passRate: number | null,
) {
  const runs = [...groupBy(rows, (row) => row.attempt_id).values()]
    .map((list) => list.toSorted((a, b) => a.question_index - b.question_index))
    .toSorted((a, b) => firstAt(a).localeCompare(firstAt(b)));

  // 採点の 無い 書きこみ（フォーム・調査）は ⭕✕を 付けず、いちばん 新しい 答えを 出す
  if (passRate === null) {
    const latest = runs.at(-1) ?? [];
    return {
      summary: `${runs.length}回 書いた`,
      items: latest.map((row) => ({
        prompt: promptOf(lookups, unitId, row.question_id),
        answer: row.answer_text,
        ok: null,
      })),
    };
  }

  const full = runs.filter((list) => list.every((row) => row.full_set));
  const shown = full[0] ?? runs.at(-1) ?? [];
  // 学習者の 画面と 同じ 数え方（何問中 何問 正解・四捨五入した % で 合否）
  const correct = shown.filter((row) => row.correct).length;
  const answered = shown.length;
  const label = full.length > 0 ? "初回" : "さいご";
  const verdict = quizPassed(correct, answered, passRate) ? "合格" : "不合格";
  return {
    summary: `${label} ${answered}問中 ${correct}問 正解（${quizPercent(correct, answered)}%・${verdict}）・${runs.length}回`,
    items: shown.map((row) => ({
      prompt: promptOf(lookups, unitId, row.question_id),
      answer: row.answer_text,
      ok: row.correct,
    })),
  };
}

/** ことばの テスト。合否と、読みを まちがえた 語（多い 順）。 */
function wordWork(tests: readonly WordTestRecord[], answers: readonly WordAnswerRecord[]) {
  const graded = tests.filter((row) => row.mode === "test");
  const passed = graded.some((row) => row.passed);
  const fails = graded.filter((row) => !row.passed).length;
  const summary =
    graded.length === 0
      ? `れんしゅう ${tests.length}回`
      : passed
        ? `合格（テスト ${graded.length}回）`
        : `まだ 不合格（${fails}回）`;
  const misses = new Map<string, { term: string; reading: string; inputs: string[] }>();
  for (const row of answers) {
    if (row.reading_ok !== false) continue;
    const entry = misses.get(row.word_id) ?? { term: row.term, reading: row.reading, inputs: [] };
    if (row.reading_input) entry.inputs.push(row.reading_input);
    misses.set(row.word_id, entry);
  }
  const items = [...misses.values()]
    .toSorted((a, b) => b.inputs.length - a.inputs.length)
    .slice(0, WORD_MISS_LIMIT)
    .map((entry) => ({
      prompt: `${entry.term}（${entry.reading}）`,
      answer: [...new Set(entry.inputs)].join("・") || "（空）",
      ok: false,
    }));
  return { summary, items };
}

/** ミーティング。AIが 聞いた 文と、生徒の 発言・評価。 */
function meetingWork(rows: readonly MeetingRecord[], unitId: string, lookups: Lookups) {
  const sorted = rows.toSorted(byTime);
  const graded = sorted.filter((row) => row.grade !== null);
  const miss = graded.filter((row) => row.grade === "miss").length;
  return {
    summary: graded.length > 0 ? `miss ${miss}／${graded.length}` : `${sorted.length}回 話した`,
    items: sorted.map((row) => ({
      prompt: askOf(lookups, unitId, row.question_id, row.ask ?? "", row.attempt),
      answer: row.utterance,
      ok: row.grade === null ? null : row.grade !== "miss",
    })),
  };
}

/** たいわ（お客さま）。いちばん 新しい 回の 会話を、相手 → 生徒 の 組に する。 */
function talkWork(rows: readonly TalkRecord[]) {
  const sessions = [...groupBy(rows, (row) => row.session_id).values()].toSorted((a, b) =>
    firstAt(a).localeCompare(firstAt(b)),
  );
  const last = (sessions.at(-1) ?? []).toSorted((a, b) => a.turn_index - b.turn_index);
  const items: WorkItem[] = [];
  let partner = "";
  for (const turn of last) {
    if (turn.speaker === "partner") {
      partner = turn.body;
      continue;
    }
    items.push({ prompt: partner, answer: turn.body, ok: null });
    partner = "";
  }
  const learnerTurns = last.filter((turn) => turn.speaker === "learner");
  const final = learnerTurns.at(-1);
  const summary = final
    ? `カード ${final.opened_count}／${final.req_total}・${sessions.length}回`
    : `${sessions.length}回`;
  return { summary, items };
}

/** リスニング。当てた ことば。 */
function listeningWork(row: ListeningRecord) {
  const inputs = (row.inputs ?? []).filter((one) => one.trim() !== "");
  return {
    summary: `当てた ことば ${inputs.length}・のこり ${row.keywords_left}`,
    items:
      inputs.length > 0 ? [{ prompt: "当てた ことば", answer: inputs.join("・"), ok: null }] : [],
  };
}

/**
 * 1人ぶんを 工程（ステージ）ごとに 並べる。
 *
 * 地図の ステージは **記録が 無くても 出す**（どこまで 進んで いないかも 分かる）。
 * 地図に 出ない ステージと、どの ステージにも 入って いない 教材は、記録が ある ときだけ。
 */
export function buildLearnerWork(
  records: LearnerRecords,
  index: Pick<UnitIndex, "stages" | "units" | "passRates">,
  lookups: Lookups,
): WorkStage[] {
  const progressOf = new Map(records.progress.map((row) => [row.content_id, row.status]));
  const quizOf = groupBy(records.quiz, (row) => row.quiz_set_id);
  const testsOf = groupBy(records.wordTests, (row) => row.stage_id);
  const answersOf = groupBy(records.wordAnswers, (row) => row.stage_id);
  const meetingsOf = groupBy(records.meetings, (row) => row.meeting_id);
  const talksOf = groupBy(records.talks, (row) => row.talk_id);
  const listeningOf = new Map(records.listening.map((row) => [row.listening_id, row]));

  const unitWork = (unit: UnitIndex["units"][number]): WorkUnit => {
    const quiz = quizOf.get(unit.id) ?? [];
    let work: { summary: string; items: WorkItem[] } | null = null;
    if (unit.type === "wordstage") {
      const tests = testsOf.get(unit.id) ?? [];
      if (tests.length > 0) work = wordWork(tests, answersOf.get(unit.id) ?? []);
    } else if (unit.type === "meeting") {
      const rows = meetingsOf.get(unit.id) ?? [];
      if (rows.length > 0) work = meetingWork(rows, unit.id, lookups);
    } else if (unit.type === "scenario") {
      const rows = talksOf.get(unit.id) ?? [];
      if (rows.length > 0) work = talkWork(rows);
    } else if (unit.type === "listening") {
      const row = listeningOf.get(unit.id);
      if (row) work = listeningWork(row);
    } else if (quiz.length > 0) {
      // もんだい・ページの 書きこみフォーム・調査ツールの こたえ
      work = quizWork(
        quiz,
        unit.id,
        lookups,
        unit.type === "quizset" ? (index.passRates[unit.id] ?? null) : null,
      );
    }

    const progress = progressOf.get(unit.id);
    const status: WorkStatus =
      progress === "completed" ? "done" : progress || work ? "started" : "none";
    return {
      id: unit.id,
      type: unit.type,
      title: unit.title,
      status,
      // 回答の 記録が 無ければ 印だけ（読むだけの 教材・まだ 解いて いない もんだい）
      readOnly: work === null,
      summary: work?.summary ?? "",
      items: work?.items ?? [],
    };
  };

  const stages: WorkStage[] = [];
  const buildStage = (
    id: string,
    title: string,
    units: readonly UnitIndex["units"][number][],
    always: boolean,
  ) => {
    const list = units.toSorted((a, b) => a.order - b.order).map(unitWork);
    const touched = list.some((unit) => unit.status !== "none");
    if (!always && !touched) return;
    stages.push({
      id,
      title,
      units: list,
      done: list.filter((unit) => unit.status === "done").length,
      total: list.length,
      touched,
    });
  };

  for (const stage of index.stages) {
    buildStage(
      stage.id,
      stage.title,
      index.units.filter((unit) => unit.stageId === stage.id),
      stage.onMap,
    );
  }
  buildStage(
    "",
    "どの ステージにも 入って いない 教材",
    index.units.filter((unit) => unit.stageId === ""),
    false,
  );
  return stages;
}
