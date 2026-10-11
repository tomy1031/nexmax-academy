import { describe, expect, it } from "vitest";
import { buildLearnerWork, type LearnerRecords } from "../src/lib/records/learner-work";
import type {
  ContentProgressRecord,
  MeetingRecord,
  QuizRecord,
  WordAnswerRecord,
  WordTestRecord,
} from "../src/lib/records/records-db";
import { buildLookups } from "../src/lib/records/table";
import type { UnitIndex } from "../src/lib/records/units";

const INDEX: Pick<UnitIndex, "stages" | "units"> = {
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
      id: "houkoku_words",
      type: "wordstage",
      title: "報告の ことば",
      stageId: "houkoku",
      stageTitle: "報連相：報告",
      order: 2,
    },
    {
      id: "houkoku_meeting",
      type: "meeting",
      title: "報告の ミーティング",
      stageId: "houkoku",
      stageTitle: "報連相：報告",
      order: 3,
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
};

const LOOKUPS = buildLookups([], INDEX.units, {
  "houkoku_quiz:q1": "報告は どの 順で 話しますか",
  "houkoku_quiz:q2": "悪い ニュースは いつ 言いますか",
  "houkoku_meeting:m1": "きのう 何を しましたか",
});

const NONE: LearnerRecords = {
  progress: [],
  quiz: [],
  wordTests: [],
  wordAnswers: [],
  meetings: [],
  talks: [],
  listening: [],
};

function progress(id: string, status: "started" | "completed"): ContentProgressRecord {
  return {
    profile_id: "sok",
    content_id: id,
    status,
    position: null,
    started_at: "2026-10-01T00:00:00Z",
    completed_at: status === "completed" ? "2026-10-01T01:00:00Z" : null,
    updated_at: "2026-10-01T01:00:00Z",
  };
}

function answer(
  attempt: string,
  at: string,
  q: string,
  index: number,
  text: string,
  ok: boolean,
): QuizRecord {
  return {
    id: `${attempt}-${q}`,
    profile_id: "sok",
    quiz_set_id: "houkoku_quiz",
    question_id: q,
    question_type: "choose",
    answer_text: text,
    correct: ok,
    earned: ok ? 1 : 0,
    max_points: 1,
    question_index: index,
    full_set: true,
    attempt_id: attempt,
    created_at: at,
  };
}

function find(stages: ReturnType<typeof buildLearnerWork>, stageId: string, unitId: string) {
  const unit = stages.find((stage) => stage.id === stageId)?.units.find((one) => one.id === unitId);
  if (!unit) throw new Error(`${stageId}/${unitId} が ありません`);
  return unit;
}

describe("1人の 工程ごとの 行った こと（願い #599 第3段）", () => {
  it("地図の ステージは 記録が 無くても 出す。地図に 出ない ステージは 記録が ある ときだけ", () => {
    const stages = buildLearnerWork(NONE, INDEX, LOOKUPS);
    expect(stages.map((stage) => stage.id)).toEqual(["houkoku", "renraku"]);
    const touched = buildLearnerWork(
      { ...NONE, progress: [progress("intro_slides", "completed")] },
      INDEX,
      LOOKUPS,
    );
    expect(touched.map((stage) => stage.id)).toEqual(["houkoku", "renraku", "intro"]);
  });

  it("読むだけの 教材は 印だけ（終わったか どうか）", () => {
    const stages = buildLearnerWork(
      { ...NONE, progress: [progress("houkoku_page", "completed")] },
      INDEX,
      LOOKUPS,
    );
    const page = find(stages, "houkoku", "houkoku_page");
    expect(page).toMatchObject({ status: "done", readOnly: true, items: [] });
    expect(stages.find((stage) => stage.id === "houkoku")).toMatchObject({ done: 1, total: 4 });
  });

  it("もんだいは 初回の こたえを 問いの 文と 並べ、回数を 添える", () => {
    const stages = buildLearnerWork(
      {
        ...NONE,
        quiz: [
          // 2回目（満点）
          answer("b", "2026-10-02T00:00:00Z", "q1", 0, "結論 → 経過", true),
          answer("b", "2026-10-02T00:00:00Z", "q2", 1, "すぐ", true),
          // 1回目
          answer("a", "2026-10-01T00:00:00Z", "q2", 1, "あとで", false),
          answer("a", "2026-10-01T00:00:00Z", "q1", 0, "経過 → 結論", false),
        ],
      },
      INDEX,
      LOOKUPS,
    );
    const quiz = find(stages, "houkoku", "houkoku_quiz");
    expect(quiz.summary).toBe("初回 0／2点・2回");
    expect(quiz.items).toEqual([
      { prompt: "報告は どの 順で 話しますか", answer: "経過 → 結論", ok: false },
      { prompt: "悪い ニュースは いつ 言いますか", answer: "あとで", ok: false },
    ]);
    expect(quiz.status).toBe("started");
  });

  it("ことばの テストは 合否と、読みを まちがえた 語（多い 順）", () => {
    const test = (passed: boolean, at: string): WordTestRecord => ({
      id: at,
      profile_id: "sok",
      stage_id: "houkoku_words",
      attempt_id: at,
      mode: "test",
      score: 0,
      max_score: 0,
      total: 0,
      reading_asked: 0,
      reading_correct: 0,
      meaning_correct: 0,
      passed,
      game_score: 0,
      best_combo: 0,
      created_at: at,
    });
    const miss = (
      word: string,
      term: string,
      reading: string,
      input: string,
    ): WordAnswerRecord => ({
      id: `${word}-${input}`,
      profile_id: "sok",
      stage_id: "houkoku_words",
      attempt_id: "x",
      word_id: word,
      term,
      reading,
      meaning: "",
      reading_input: input,
      reading_ok: false,
      meaning_input: "",
      meaning_ok: true,
      word_index: 0,
      created_at: "2026-10-01T00:00:00Z",
    });
    const stages = buildLearnerWork(
      {
        ...NONE,
        wordTests: [test(false, "1"), test(false, "2"), test(false, "3")],
        wordAnswers: [
          miss("w1", "改善", "かいぜん", "かいせん"),
          miss("w2", "接続", "せつぞく", "けっさい"),
          miss("w2", "接続", "せつぞく", "けつろん"),
        ],
      },
      INDEX,
      LOOKUPS,
    );
    const words = find(stages, "houkoku", "houkoku_words");
    expect(words.summary).toBe("まだ 不合格（3回）");
    expect(words.items[0]).toEqual({
      prompt: "接続（せつぞく）",
      answer: "けっさい・けつろん",
      ok: false,
    });
  });

  it("ミーティングは 聞かれた 文と 発言・評価（miss は ✕）", () => {
    const turn = (grade: MeetingRecord["grade"], at: string): MeetingRecord => ({
      id: at,
      profile_id: "sok",
      meeting_id: "houkoku_meeting",
      question_id: "m1",
      ask: "",
      attempt: 1,
      mode: "voice",
      utterance: `発言 ${at}`,
      judge: null,
      grade,
      fallback: "",
      created_at: at,
    });
    const stages = buildLearnerWork(
      { ...NONE, meetings: [turn("good", "2"), turn("miss", "1")] },
      INDEX,
      LOOKUPS,
    );
    const meeting = find(stages, "houkoku", "houkoku_meeting");
    expect(meeting.summary).toBe("miss 1／2");
    expect(meeting.items.map((item) => [item.prompt, item.answer, item.ok])).toEqual([
      ["きのう 何を しましたか", "発言 1", false],
      ["きのう 何を しましたか", "発言 2", true],
    ]);
  });
});
