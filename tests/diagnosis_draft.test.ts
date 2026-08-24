import { describe, expect, it } from "vitest";
import { PERSONALITY_QUESTIONS, type PersonalityAnswer } from "@/content/personality";
import {
  canResumeQuestions,
  isDiagnosedRow,
  isDiagnosisDraft,
  parseDiagnosisDraft,
  type DiagnosisDraft,
} from "@/lib/profile";

/**
 * 書きかけの20問（下書き）— 2026-08-24 の直し。
 *
 * 8/21 の授業では17人が診断に取り組んだのに、記録に残ったのは13人だった。答えは
 * 画面のメモリにしか無く、結果を見て閉じた人の20問が消えていた（本番のログでは、
 * その時間帯の保存は全部成功していて、失敗は1件も無い＝送られてすらいなかった）。
 * ここは「端末に控える」側の決まりを固定する。
 */

const ANSWERS = Array.from({ length: PERSONALITY_QUESTIONS.length }, (_, index) =>
  index % 2 === 0 ? "a" : "b",
) as PersonalityAnswer[];

function draft(overrides: Partial<DiagnosisDraft> = {}): DiagnosisDraft {
  return {
    answers: [...ANSWERS],
    questionIndex: 5,
    introRead: true,
    language: "easy",
    languageSwitched: false,
    names: { familyName: "ソク", givenName: "ソピア", nickname: "" },
    school: { university: "AUPP", cohort: 2 },
    gender: "female",
    savedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("下書きとして読める形か", () => {
  it("そのまま書いて読み戻せる", () => {
    const restored = parseDiagnosisDraft(JSON.stringify(draft()));
    expect(restored).toEqual(draft());
  });

  it("まだ答えていない設問（null）を含んでいてよい", () => {
    const halfway = [...ANSWERS.slice(0, 7), ...Array(13).fill(null)];
    expect(isDiagnosisDraft(draft({ answers: halfway }))).toBe(true);
  });

  it("設問数と長さが合わない答えは読まない", () => {
    expect(isDiagnosisDraft(draft({ answers: ANSWERS.slice(0, 19) }))).toBe(false);
    expect(isDiagnosisDraft(draft({ answers: [...ANSWERS, "a"] as PersonalityAnswer[] }))).toBe(
      false,
    );
  });

  it("v2 の答え（yes / no）は読まない", () => {
    const legacy = Array.from({ length: PERSONALITY_QUESTIONS.length }, () => "yes");
    expect(isDiagnosisDraft(draft({ answers: legacy as unknown as PersonalityAnswer[] }))).toBe(
      false,
    );
  });

  it("台帳に無い言語・学校は読まない", () => {
    expect(isDiagnosisDraft({ ...draft(), language: "khmer" })).toBe(false);
    expect(isDiagnosisDraft({ ...draft(), school: { university: "RUPP", cohort: 1 } })).toBe(false);
  });

  it("設問の位置が範囲の外なら読まない", () => {
    expect(isDiagnosisDraft(draft({ questionIndex: -1 }))).toBe(false);
    expect(isDiagnosisDraft(draft({ questionIndex: PERSONALITY_QUESTIONS.length }))).toBe(false);
    expect(isDiagnosisDraft(draft({ questionIndex: 1.5 }))).toBe(false);
  });

  it("壊れた文字列・空は「無かった」として扱う（画面を止めない）", () => {
    expect(parseDiagnosisDraft("{壊れている")).toBeNull();
    expect(parseDiagnosisDraft("null")).toBeNull();
    expect(parseDiagnosisDraft("")).toBeNull();
    expect(parseDiagnosisDraft(null)).toBeNull();
  });
});

describe("しつもんの続きから戻ってよいか", () => {
  const filled = {
    names: { familyName: "ソク", givenName: "ソピア", nickname: "" },
    school: { university: "AUPP" as const, cohort: 2 },
    gender: "female" as const,
  };

  it("1問でも答えていて、なまえ・学校・せいべつがそろっていれば戻る", () => {
    const halfway = [...ANSWERS.slice(0, 1), ...Array(19).fill(null)];
    expect(canResumeQuestions(filled, draft({ answers: halfway }))).toBe(true);
  });

  it("下書きが無ければ戻らない", () => {
    expect(canResumeQuestions(filled, null)).toBe(false);
  });

  it("1問も答えていない下書きでは戻らない", () => {
    expect(canResumeQuestions(filled, draft({ answers: Array(20).fill(null) }))).toBe(false);
  });

  it("せいべつが空なら戻らない（20問の前に入れてもらう欄）", () => {
    expect(canResumeQuestions({ ...filled, gender: null }, draft())).toBe(false);
  });

  it("なまえがカタカナでなければ戻らない", () => {
    const romaji = { familyName: "Sok", givenName: "Sophea", nickname: "" };
    expect(canResumeQuestions({ ...filled, names: romaji }, draft())).toBe(false);
  });

  it("学校を選んでいなければ戻らない", () => {
    expect(canResumeQuestions({ ...filled, school: { university: "", cohort: 0 } }, draft())).toBe(
      false,
    );
  });
});

describe("診断が終わっている行か（登録だけの行と見分ける）", () => {
  const row = {
    answers: [...ANSWERS],
    personality_type: "ISTJ",
    gender: "male",
  };

  it("答え・タイプ・せいべつがそろっていれば診断ずみ", () => {
    expect(isDiagnosedRow(row)).toBe(true);
  });

  it("ログインしただけの行（タイプもせいべつも空）は診断ずみではない", () => {
    expect(isDiagnosedRow({ answers: [], personality_type: null, gender: null })).toBe(false);
  });

  it("答えだけ残っていてタイプが無い行は診断ずみではない", () => {
    expect(isDiagnosedRow({ ...row, personality_type: null })).toBe(false);
  });

  it("せいべつが無い行は診断ずみではない", () => {
    expect(isDiagnosedRow({ ...row, gender: null })).toBe(false);
  });

  it("途中までの答えは診断ずみではない", () => {
    expect(isDiagnosedRow({ ...row, answers: ANSWERS.slice(0, 19) })).toBe(false);
  });

  it("v2 の4値タイプは診断ずみとして通さない", () => {
    expect(isDiagnosedRow({ ...row, personality_type: "leader" })).toBe(false);
  });
});
