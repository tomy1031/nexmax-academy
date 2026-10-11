import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../src/lib/profile-db";
import type { LearnerQuizFirstRow, LearnerSummaryRow } from "../src/lib/records/records-db";
import {
  buildRoster,
  flagLabel,
  followUpFlags,
  FOLLOW_RULES,
  rosterStudents,
  type RosterRow,
} from "../src/lib/records/roster";
import type { UnitIndex } from "../src/lib/records/units";

/** 1人ぶんの 行（1人だけ 渡した ときに 使う）。 */
function only(rows: RosterRow[]): RosterRow {
  const [row] = rows;
  if (!row) throw new Error("行が ありません");
  return row;
}

function profile(id: string, over: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id,
    email: `${id}@example.com`,
    display_name: id,
    family_name: "",
    given_name: "",
    nickname: "",
    university: "AUPP",
    cohort: 3,
    gender: null,
    personality_type: null,
    answers: [],
    scores: {} as ProfileRow["scores"],
    is_admin: false,
    ...over,
  } as ProfileRow;
}

function summary(id: string, over: Partial<LearnerSummaryRow> = {}): LearnerSummaryRow {
  return {
    profile_id: id,
    completed_ids: [],
    word_sets: 0,
    word_passed_sets: 0,
    word_stuck_sets: 0,
    talk_graded: 0,
    talk_miss: 0,
    certificates: 0,
    last_at: null,
    ...over,
  };
}

function first(id: string, set: string, score: number, max = 10): LearnerQuizFirstRow {
  return {
    profile_id: id,
    quiz_set_id: set,
    first_score: score,
    first_max: max,
    first_at: "2026-10-10T10:00:00Z",
    runs: 1,
  };
}

/** 地図の ステージ 2つ（教材 3本）と、地図に 出ない ステージ 1つ。 */
const INDEX: Pick<UnitIndex, "stages" | "units" | "passRates"> = {
  stages: [
    { id: "houkoku", title: "報連相：報告", onMap: true },
    { id: "renraku", title: "報連相：連絡", onMap: true },
    { id: "intro", title: "はじめに", onMap: false },
  ],
  units: [
    {
      id: "houkoku_page",
      type: "article",
      title: "報告の 型",
      stageId: "houkoku",
      stageTitle: "報連相：報告",
      order: 0,
    },
    {
      id: "houkoku_quiz",
      type: "quizset",
      title: "報告の もんだい",
      stageId: "houkoku",
      stageTitle: "報連相：報告",
      order: 1,
    },
    {
      id: "renraku_quiz",
      type: "quizset",
      title: "連絡の もんだい",
      stageId: "renraku",
      stageTitle: "報連相：連絡",
      order: 0,
    },
    {
      id: "intro_slides",
      type: "slides",
      title: "はじめに",
      stageId: "intro",
      stageTitle: "はじめに",
      order: 0,
    },
  ],
  passRates: { houkoku_quiz: 70, renraku_quiz: 80 },
};

describe("生徒の 一覧（願い #599）", () => {
  it("全体の 進みは 地図の ステージの 教材だけで 数える", () => {
    const row = only(
      buildRoster(
        [profile("sok")],
        [summary("sok", { completed_ids: ["houkoku_page", "houkoku_quiz", "intro_slides"] })],
        [],
        INDEX,
      ),
    );
    expect(row.progress).toEqual({ done: 2, total: 3, stagesDone: 1, stagesTotal: 2 });
  });

  it("記録が 1行も 無い 生徒も 出す（まだ 何も して いない ことが 分かる）", () => {
    const row = only(buildRoster([profile("pia")], [], [], INDEX));
    expect(row.progress.done).toBe(0);
    expect(row.firstAverage).toBeNull();
    expect(row.flags).toEqual([]);
  });

  it("初回の 点は 合格ラインと 比べる（セットごとに ちがう ライン）", () => {
    const row = only(
      buildRoster(
        [profile("sophea")],
        [summary("sophea")],
        // 報告 7/10 = 70% は ライン 70% に 届く。連絡 7/10 = 70% は ライン 80% に 届かない
        [first("sophea", "houkoku_quiz", 7), first("sophea", "renraku_quiz", 7)],
        INDEX,
      ),
    );
    expect(row.lowSets.map((set) => set.id)).toEqual(["renraku_quiz"]);
    expect(row.firstAverage).toBeCloseTo(0.7);
  });

  it("合格ラインの 無い 記録（ページの 書きこみフォーム）は 数えない", () => {
    const row = only(
      buildRoster(
        [profile("dara")],
        [summary("dara")],
        [first("dara", "asakai_form_article", 0, 5)],
        INDEX,
      ),
    );
    expect(row.quizSets).toBe(0);
    expect(row.lowSets).toEqual([]);
  });

  it("印の 多い 人から 並べる。同じなら 名前順", () => {
    const rows = buildRoster(
      [profile("a-ok"), profile("b-low"), profile("c-ok")],
      [summary("a-ok"), summary("b-low", { word_stuck_sets: 1 }), summary("c-ok")],
      [],
      INDEX,
    );
    expect(rows.map((row) => row.profileId)).toEqual(["b-low", "a-ok", "c-ok"]);
  });
});

describe("フォローの 印（2026-10-11 に えらんだ 3つ）", () => {
  const base = only(buildRoster([profile("x")], [summary("x")], [], INDEX));

  it("初回の 点が 低い セットが 2つ 以上で 印（1つでは つけない）", () => {
    const low = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: "", ratio: 0.3, passRate: 70 }));
    expect(followUpFlags({ ...base, lowSets: low(1) })).toEqual([]);
    expect(followUpFlags({ ...base, lowSets: low(FOLLOW_RULES.firstLowSets) })).toEqual([
      { kind: "first-low", sets: 2 },
    ]);
  });

  it("ことばの テストで 足ぶみ（3回 以上 不合格の まま）の セットが あれば 印", () => {
    expect(followUpFlags({ ...base, word: { sets: 2, passed: 1, stuck: 1 } })).toEqual([
      { kind: "word-stuck", sets: 1 },
    ]);
  });

  it("会話は 発言が 少ない うちは 割合を 見ない。半分 以上 miss で 印", () => {
    expect(followUpFlags({ ...base, talk: { graded: 2, miss: 2 } })).toEqual([]);
    expect(followUpFlags({ ...base, talk: { graded: 4, miss: 1 } })).toEqual([]);
    expect(followUpFlags({ ...base, talk: { graded: 4, miss: 2 } })).toEqual([
      { kind: "talk-miss", ratio: 0.5 },
    ]);
  });

  it("「7日 動きなし」は 印に しない（えらばれなかった）", () => {
    expect(followUpFlags({ ...base, lastAt: "2026-01-01T00:00:00Z" })).toEqual([]);
  });

  it("印の 言葉", () => {
    expect(flagLabel({ kind: "first-low", sets: 3 })).toBe("初回の 点が 低い（3セット）");
    expect(flagLabel({ kind: "word-stuck", sets: 1 })).toBe("ことばで 足ぶみ（1セット）");
    expect(flagLabel({ kind: "talk-miss", ratio: 0.62 })).toBe("会話で つまずき（miss 62%）");
  });
});

describe("一覧に 出す 生徒", () => {
  const PEOPLE = [
    profile("sok"),
    profile("cadt", { university: "CADT" }),
    profile("teacher", { is_admin: true }),
    profile("staff", { university: "講師・スタッフ" }),
  ];
  const EMPTY = { university: "", cohort: 0, profileId: "", stageId: "", unitId: "", text: "" };

  it("先生と 講師・スタッフは 出さない", () => {
    expect(rosterStudents(PEOPLE, EMPTY).map((one) => one.id)).toEqual(["sok", "cadt"]);
  });

  it("所属で 絞ると その 学校の 生徒だけ", () => {
    expect(rosterStudents(PEOPLE, { ...EMPTY, university: "CADT" }).map((one) => one.id)).toEqual([
      "cadt",
    ]);
  });

  it("名指しで えらべば 先生でも 出す。所属「講師・スタッフ」なら 講師を 出す", () => {
    expect(rosterStudents(PEOPLE, { ...EMPTY, profileId: "teacher" }).map((one) => one.id)).toEqual(
      ["teacher"],
    );
    expect(
      rosterStudents(PEOPLE, { ...EMPTY, university: "講師・スタッフ" }).map((one) => one.id),
    ).toEqual(["staff"]);
  });
});

describe("レビューの 直し（2026-10-11）", () => {
  it("初回の 合否は 問題の 数で 決める（点では 届いても 問題の 数で 届かなければ 低い）", () => {
    const row = only(
      buildRoster(
        [profile("a")],
        [summary("a")],
        [
          // 点では 8/13＝62%（ライン 60 に 届く）。問題の 数では 4/9＝44%
          { ...first("a", "houkoku_quiz", 8, 13), first_correct: 4, first_questions: 9 },
        ],
        { ...INDEX, passRates: { houkoku_quiz: 60, renraku_quiz: 80 } },
      ),
    );
    expect(row.lowSets.map((set) => [set.id, Math.round(set.ratio * 100)])).toEqual([
      ["houkoku_quiz", 44],
    ]);
  });

  it("ステージの クリアは 地図と 同じく 関門の 教材だけで 決める", () => {
    const gated = {
      ...INDEX,
      units: INDEX.units.map((unit) =>
        unit.id === "houkoku_page" ? { ...unit, gates: false } : unit,
      ),
    };
    const row = only(
      buildRoster([profile("a")], [summary("a", { completed_ids: ["houkoku_quiz"] })], [], gated),
    );
    // 報告の 型（関門で ない）を 読んで いなくても、報告の ステージは クリア
    expect(row.progress.stagesDone).toBe(1);
    expect(row.progress.done).toBe(1);
  });
});
