import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../src/lib/profile-db";
import {
  buildLookups,
  buildRecordsCsv,
  certificateTable,
  defaultKind,
  EMPTY_FILTER,
  filterRows,
  kindsWithRecords,
  normalizeCode,
  RECORD_KINDS,
  summaryTable,
} from "../src/lib/records/table";
import type { CertificateRecord, RecordIndexRow } from "../src/lib/records/records-db";
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

const UNITS: UnitRef[] = [
  {
    id: "kanryou-listening",
    type: "listening",
    title: "リスニング：作業完了の 報告",
    stageId: "houkoku",
    stageTitle: "報告",
    order: 0,
  },
  {
    id: "houkoku-typing",
    type: "typing",
    title: "タイピング：報告の 文",
    stageId: "houkoku",
    stageTitle: "報告",
    order: 1,
  },
];

const LOOKUPS = buildLookups([AYA, BOPHA], UNITS);

function cert(over: Partial<CertificateRecord>): CertificateRecord {
  return {
    id: "c1",
    profile_id: "aya",
    content_id: "kanryou-listening",
    kind: "listening",
    attempt: 1,
    perfect: false,
    score: 80,
    max_score: null,
    misses: 2,
    detail: {},
    learner_name: "ヤマダ アヤ",
    code: "ABCD2345",
    // 2026-10-06 10:30 UTC = 17:30 ICT（カンボジア）
    issued_at: "2026-10-06T10:30:00.000Z",
    ...over,
  };
}

describe("修了証を 先生の 表に する", () => {
  it("先頭の5列は ほかの 種類と 同じ（だれ・どこ）で、そのあとに 修了証の 列", () => {
    const table = certificateTable([cert({})], LOOKUPS);
    expect(table.columns.map((c) => c.key)).toEqual([
      "student",
      "school",
      "stage",
      "unit",
      "type",
      "learnerName",
      "attempt",
      "result",
      "score",
      "issuedAt",
      "code",
    ]);
    expect(table.columns.slice(5).map((c) => c.label)).toEqual([
      "出した 時の 名前",
      "回",
      "結果",
      "成績",
      "終えた 時刻",
      "照合番号",
    ]);
    expect(table.rows[0]?.cells).toMatchObject({
      student: "アヤ",
      school: "AUPP 1期生",
      stage: "報告",
      unit: "リスニング：作業完了の 報告",
      type: "リスニング",
      learnerName: "ヤマダ アヤ",
      attempt: "1回目",
      code: "ABCD2345",
    });
  });

  it("名前は 出した 時の もの（いまの 名前と ずれても そのまま）", () => {
    const table = certificateTable([cert({ learner_name: "ヤマダ アヤ" })], LOOKUPS);
    const cells = table.rows[0]?.cells;
    expect(cells?.student).toBe("アヤ");
    expect(cells?.learnerName).toBe("ヤマダ アヤ");
  });

  it("何回目かを 「N回目」で 出す", () => {
    const table = certificateTable([cert({ attempt: 3 })], LOOKUPS);
    expect(table.rows[0]?.cells.attempt).toBe("3回目");
  });

  it("パーフェクトは ★PERFECT、そうで ない 回は 修了", () => {
    const table = certificateTable(
      [cert({ id: "p", perfect: true }), cert({ id: "n", perfect: false, code: "ZZZZ9999" })],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.result).toBe("★PERFECT");
    expect(table.rows[1]?.cells.result).toBe("修了");
  });

  it("成績: リスニングは スコアと ミス", () => {
    const table = certificateTable([cert({ score: 80, misses: 2 })], LOOKUPS);
    expect(table.rows[0]?.cells.score).toBe("スコア 80点・ミス 2回");
  });

  it("成績: ミスが 0回でも 「0回」と 書く（空欄に しない）", () => {
    const table = certificateTable([cert({ score: 100, misses: 0, perfect: true })], LOOKUPS);
    expect(table.rows[0]?.cells.score).toBe("スコア 100点・ミス 0回");
  });

  it("成績: タイピングは 1回で 正解した 文と ❌ の 回数", () => {
    const table = certificateTable(
      [
        cert({
          kind: "typing",
          content_id: "houkoku-typing",
          score: 8,
          max_score: 10,
          misses: 3,
        }),
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.score).toBe("1回で 正解 8/10・❌ 3回");
    expect(table.rows[0]?.cells.type).toBe("タイピング");
  });

  it("成績: もんだいは 正解の 数と 合否。正解の 無い 教材は 書けた 数（第2段）", () => {
    const table = certificateTable(
      [
        cert({
          id: "a",
          kind: "quizset",
          score: 4,
          max_score: 5,
          misses: 1,
          detail: { passed: true, sawScriptBefore: true },
        }),
        cert({ id: "b", kind: "quizset", score: 2, max_score: 5, detail: { passed: false } }),
        cert({ id: "c", kind: "quizset", score: 3, max_score: 3, detail: { freeOnly: true } }),
        cert({
          id: "d",
          kind: "quizset",
          score: 5,
          max_score: 5,
          detail: { sawModelAnswer: true, passed: true },
        }),
      ],
      LOOKUPS,
    );
    expect(table.rows.map((row) => row.cells.score)).toEqual([
      "正解 4/5・合格（こたえあわせを 見た あとの やりなおし）",
      "正解 2/5・不合格",
      "書けた 3/3",
      "正解 5/5・合格（バグ報告で こたえの 文を 見た）",
    ]);
  });

  it("成績: 知らない 種類でも 持って いる 数は そのまま 出す", () => {
    const table = certificateTable(
      [
        cert({ id: "a", kind: "future", score: 7, max_score: 9, misses: 1 }),
        cert({ id: "b", kind: "future", score: null, max_score: null, misses: null }),
      ],
      LOOKUPS,
    );
    expect(table.rows[0]?.cells.score).toBe("7/9・ミス 1回");
    expect(table.rows[1]?.cells.score).toBe("");
  });

  it("終えた 時刻は カンボジアの 時刻（ICT）で 出す", () => {
    const table = certificateTable([cert({ issued_at: "2026-10-06T10:30:00.000Z" })], LOOKUPS);
    expect(table.rows[0]?.cells.issuedAt).toBe("2026/10/06 17:30（ICT）");
  });

  it("ICT は 日付も またぐ（UTC 20:15 = 翌日 03:15）", () => {
    const table = certificateTable([cert({ issued_at: "2026-10-06T20:15:00.000Z" })], LOOKUPS);
    expect(table.rows[0]?.cells.issuedAt).toBe("2026/10/07 03:15（ICT）");
  });

  it("消えた 学生・教材でも 行は 消さない（無いことと 引けないことは 別）", () => {
    const table = certificateTable(
      [cert({ profile_id: "gone", content_id: "removed-listening" })],
      LOOKUPS,
    );
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.cells).toMatchObject({
      student: "（消えた 学生）",
      unit: "removed-listening",
      learnerName: "ヤマダ アヤ",
      code: "ABCD2345",
    });
  });

  it("並べ替えに 使う 時刻は 出した 時刻（新しい ものが 上）", () => {
    const table = certificateTable(
      [
        cert({ id: "old", code: "AAAA1111", issued_at: "2026-10-01T03:00:00.000Z" }),
        cert({ id: "new", code: "BBBB2222", issued_at: "2026-10-05T03:00:00.000Z" }),
      ],
      LOOKUPS,
    );
    const rows = filterRows(table, EMPTY_FILTER, LOOKUPS);
    expect(rows.map((r) => r.cells.code)).toEqual(["BBBB2222", "AAAA1111"]);
  });

  it("つまずきの まとめは 出さない（正誤の 記録では ない）", () => {
    const table = certificateTable([cert({})], LOOKUPS);
    expect(summaryTable("certificate", table.rows)).toBeNull();
  });

  it("CSV にも 照合番号と 時刻が 出る", () => {
    const table = certificateTable([cert({ perfect: true })], LOOKUPS);
    const csv = buildRecordsCsv(table.columns, table.rows);
    expect(csv).toContain("照合番号");
    expect(csv).toContain("ABCD2345");
    expect(csv).toContain("★PERFECT");
    expect(csv).toContain("17:30（ICT）");
  });
});

describe("照合番号で さがす", () => {
  const table = certificateTable(
    [
      cert({ id: "1", code: "ABCD2345" }),
      cert({ id: "2", code: "WXYZ6789", profile_id: "bopha", learner_name: "ボパー ソク" }),
      cert({ id: "3", code: "KMNP2468", learner_name: "ヤマダ アヤ" }),
    ],
    LOOKUPS,
  );
  const codesFor = (text: string) =>
    filterRows(table, { ...EMPTY_FILTER, text }, LOOKUPS)
      .map((row) => row.cells.code)
      .toSorted();

  it("番号を そのまま 入れると その 行だけに なる", () => {
    expect(codesFor("ABCD2345")).toEqual(["ABCD2345"]);
  });

  it("大文字・小文字を 問わない", () => {
    expect(codesFor("abcd2345")).toEqual(["ABCD2345"]);
    expect(codesFor("AbCd2345")).toEqual(["ABCD2345"]);
  });

  it("空白・ハイフンを 無視する（画像の 「ABCD-2345」を そのまま 貼れる）", () => {
    expect(codesFor("ABCD-2345")).toEqual(["ABCD2345"]);
    expect(codesFor("abcd 2345")).toEqual(["ABCD2345"]);
    expect(codesFor("  ab cd - 23 45  ")).toEqual(["ABCD2345"]);
  });

  it("全角の 英数字・ハイフンでも 当たる", () => {
    expect(codesFor("ＡＢＣＤ－２３４５")).toEqual(["ABCD2345"]);
    expect(codesFor("ＡＢＣＤ ２３４５")).toEqual(["ABCD2345"]);
  });

  it("途中までの 入力でも 絞れる（打ちながら 減る）", () => {
    expect(codesFor("WXYZ")).toEqual(["WXYZ6789"]);
    expect(codesFor("kmn")).toEqual(["KMNP2468"]);
  });

  it("どの 番号とも 合わない ときは 0行（別の 人の 画像と 取り違えない）", () => {
    expect(codesFor("ABCD2346")).toEqual([]);
    expect(codesFor("QQQQ-0000")).toEqual([]);
  });

  it("名前でも さがせる（ふつうの 検索は そのまま 効く）", () => {
    expect(codesFor("ボパー")).toEqual(["WXYZ6789"]);
    expect(codesFor("ヤマダ")).toEqual(["ABCD2345", "KMNP2468"]);
  });

  it("空の 検索は 絞らない", () => {
    expect(codesFor("")).toHaveLength(3);
    expect(codesFor("   ")).toHaveLength(3);
  });

  it("人・単元の 絞り込みと 一緒に 効く", () => {
    const rows = filterRows(
      table,
      { ...EMPTY_FILTER, text: "abcd-2345", profileId: "bopha" },
      LOOKUPS,
    );
    expect(rows).toEqual([]);
  });

  it("番号の ゆれを 取る 関数", () => {
    expect(normalizeCode(" ABcd-2345 ")).toBe("abcd2345");
    expect(normalizeCode("ＡＢＣＤ－２３４５")).toBe("abcd2345");
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode(" - ")).toBe("");
  });

  it("番号が 空の 行は 番号の さがし方で 当たらない", () => {
    const empty = certificateTable([cert({ code: "" })], LOOKUPS);
    expect(filterRows(empty, { ...EMPTY_FILTER, text: "ABCD" }, LOOKUPS)).toEqual([]);
  });
});

describe("修了証の タブ", () => {
  const INDEX: RecordIndexRow[] = [
    { kind: "progress", profile_id: "aya", unit_id: "kanryou-listening", n: 1 },
    { kind: "certificate", profile_id: "aya", unit_id: "kanryou-listening", n: 2 },
    { kind: "certificate", profile_id: "bopha", unit_id: "houkoku-typing", n: 1 },
  ];

  it("種類の 一覧に 入って いる", () => {
    expect(RECORD_KINDS.find((one) => one.id === "certificate")).toEqual({
      id: "certificate",
      icon: "🎓",
      label: "修了証",
    });
  });

  it("見取り図に 修了証が あれば タブが 出る", () => {
    expect(kindsWithRecords(INDEX, EMPTY_FILTER, LOOKUPS)).toEqual(["progress", "certificate"]);
  });

  it("人・単元で 絞っても 修了証の ある 条件だけ タブが 出る", () => {
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, profileId: "bopha" }, LOOKUPS)).toEqual([
      "certificate",
    ]);
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, unitId: "houkoku-typing" }, LOOKUPS)).toEqual(
      ["certificate"],
    );
  });

  it("修了証が 無い 見取り図では タブを 出さない", () => {
    const none = INDEX.filter((row) => row.kind !== "certificate");
    expect(kindsWithRecords(none, EMPTY_FILTER, LOOKUPS)).toEqual(["progress"]);
  });

  it("ことばで さがす は タブを 減らさない（照合番号を 打つたび タブが 消えない）", () => {
    expect(kindsWithRecords(INDEX, { ...EMPTY_FILTER, text: "ABCD-2345" }, LOOKUPS)).toEqual([
      "progress",
      "certificate",
    ]);
  });

  it("既定は 進み具合より 修了証（学生が 出した ほう）", () => {
    expect(defaultKind(["progress", "certificate"])).toBe("certificate");
  });
});
