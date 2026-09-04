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
