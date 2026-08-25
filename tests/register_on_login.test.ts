import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PERSONALITY_QUESTIONS,
  scorePersonality,
  type PersonalityAnswer,
} from "@/content/personality";
import { hasAuthCookieInBrowser, REGISTER_COOKIE, takeRegisterFlag } from "@/lib/auth-cookie";
import type { DiagnosisDraft, NexmaxProfile } from "@/lib/profile";
import { PERSONALITY_VERSION } from "@/lib/profile-db";
import {
  planRegistration,
  type LocalRegistration,
  type RegistrationRow,
} from "@/lib/register-on-login";

/**
 * ログインした時点の登録（2026-08-25 の指定）。
 *
 * 「まだ登録されていない人を登録する」と「端末にしか無い情報も一緒に登録する」の
 * 2つを決める純関数。DBが正で、端末の情報は**空いている欄だけ**を埋める——
 * ここを緩めると、先生が直した名前が学生の端末の古い控えで塗りつぶされる。
 */

const ANSWERS = Array.from({ length: PERSONALITY_QUESTIONS.length }, (_, index) =>
  index % 3 === 0 ? "b" : "a",
) as PersonalityAnswer[];

function draft(overrides: Partial<DiagnosisDraft> = {}): DiagnosisDraft {
  return {
    answers: [...ANSWERS],
    questionIndex: 19,
    introRead: true,
    language: "easy",
    languageSwitched: false,
    names: { familyName: "ソク", givenName: "ソピア", nickname: "" },
    school: { university: "AUPP", cohort: 2 },
    gender: "female",
    savedAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

function cached(overrides: Partial<NexmaxProfile> = {}): NexmaxProfile {
  return {
    displayName: "ソピア",
    gender: "female",
    type: "ISTJ",
    scores: { ei: 1, sn: 2, tf: 3, jp: 4 },
    createdAt: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    family_name: "",
    given_name: "",
    nickname: "",
    display_name: "",
    university: "",
    cohort: 0,
    gender: null,
    answers: [],
    ...overrides,
  };
}

const NOTHING: LocalRegistration = { draft: null, cached: null };

describe("まだ登録されていない人を登録する", () => {
  it("行が無ければ作る（端末に何も無くても）", () => {
    const plan = planRegistration(null, NOTHING);
    expect(plan).not.toBeNull();
    expect(plan!.insert).toBe(true);
    // 版は default を持たない列なので、行を作るなら必ず書く。
    expect(plan!.columns.personality_version).toBe(PERSONALITY_VERSION);
    // 診断はしていないので、タイプもせいべつも書かない（＝未診断の行）。
    expect(plan!.columns.personality_type).toBeUndefined();
    expect(plan!.columns.gender).toBeUndefined();
    expect(plan!.result).toBeNull();
  });

  it("行があって端末にも足すものが無ければ、何も書かない", () => {
    expect(
      planRegistration(row({ family_name: "ソク", given_name: "ソピア" }), NOTHING),
    ).toBeNull();
  });
});

describe("端末にある情報も一緒に登録する", () => {
  it("20問がそろっていれば、タイプ・スコア・答えをまとめて登録する", () => {
    const plan = planRegistration(null, { draft: draft(), cached: null });
    expect(plan!.columns.personality_type).toBe(scorePersonality(ANSWERS));
    expect(plan!.columns.answers).toEqual(ANSWERS);
    expect(plan!.columns.gender).toBe("female");
    expect(plan!.columns.answer_language).toBe("easy");
    // 記録台帳にも同じ結果を積む。
    expect(plan!.result?.personalityType).toBe(scorePersonality(ANSWERS));
    expect(plan!.result?.answers).toEqual(ANSWERS);
  });

  it("なまえ・がっこう・せいべつも一緒に登録する", () => {
    const plan = planRegistration(null, { draft: draft(), cached: null });
    expect(plan!.columns.family_name).toBe("ソク");
    expect(plan!.columns.given_name).toBe("ソピア");
    // 呼び名は3欄から組み立てる（画面が独自に作らない）。
    expect(plan!.columns.display_name).toBe("ソピア");
    expect(plan!.columns.university).toBe("AUPP");
    expect(plan!.columns.cohort).toBe(2);
  });

  it("答えが1つでも欠けていれば、診断としては登録しない", () => {
    const halfway = [...ANSWERS.slice(0, 19), null];
    const plan = planRegistration(null, { draft: draft({ answers: halfway }), cached: null });
    expect(plan!.columns.answers).toBeUndefined();
    expect(plan!.columns.personality_type).toBeUndefined();
    expect(plan!.result).toBeNull();
    // なまえ・がっこう・せいべつは、診断が途中でも登録してよい。
    expect(plan!.columns.family_name).toBe("ソク");
    expect(plan!.columns.gender).toBe("female");
  });

  it("せいべつが分からない20問は登録しない（DBの制約に弾かれるため）", () => {
    const plan = planRegistration(null, { draft: draft({ gender: null }), cached: null });
    expect(plan!.columns.answers).toBeUndefined();
    expect(plan!.result).toBeNull();
  });

  it("カタカナでないなまえは書かない（DBのCHECKに弾かれるため）", () => {
    const romaji = { familyName: "Sok", givenName: "Sophea", nickname: "" };
    const plan = planRegistration(null, { draft: draft({ names: romaji }), cached: null });
    expect(plan!.columns.family_name).toBeUndefined();
    expect(plan!.columns.display_name).toBeUndefined();
    // 20問そのものは、なまえと関係なく登録できる。
    expect(plan!.columns.answers).toEqual(ANSWERS);
  });

  it("控えしか無いとき（デモモードで診断した端末）は、呼び名とせいべつだけ登録する", () => {
    const plan = planRegistration(null, { draft: null, cached: cached() });
    expect(plan!.columns.display_name).toBe("ソピア");
    expect(plan!.columns.gender).toBe("female");
    // 控えは答えを持たない。タイプとスコアと答えはいつも一緒に動く決まりなので書かない。
    expect(plan!.columns.personality_type).toBeUndefined();
    expect(plan!.columns.scores).toBeUndefined();
  });
});

describe("DBに入っている値は上書きしない", () => {
  it("なまえ・がっこう・せいべつが入っている行には触らない", () => {
    const filled = row({
      family_name: "チャン",
      given_name: "ダラ",
      display_name: "ダラ",
      university: "CADT",
      cohort: 4,
      gender: "male",
    });
    const plan = planRegistration(filled, { draft: draft(), cached: cached() });
    expect(plan!.columns.family_name).toBeUndefined();
    expect(plan!.columns.university).toBeUndefined();
    expect(plan!.columns.cohort).toBeUndefined();
    expect(plan!.columns.gender).toBeUndefined();
    expect(plan!.insert).toBe(false);
  });

  it("診断ずみの行には、端末の20問を上書きしない", () => {
    const diagnosed = row({
      family_name: "チャン",
      given_name: "ダラ",
      display_name: "ダラ",
      university: "CADT",
      cohort: 4,
      gender: "male",
      answers: [...ANSWERS],
    });
    expect(planRegistration(diagnosed, { draft: draft(), cached: cached() })).toBeNull();
  });

  it("せいべつだけ入っている行でも、端末の20問は登録できる", () => {
    const plan = planRegistration(row({ gender: "male" }), { draft: draft(), cached: null });
    expect(plan!.columns.answers).toEqual(ANSWERS);
    // DBのせいべつが正。端末の「female」で塗り替えない。
    expect(plan!.columns.gender).toBeUndefined();
  });

  it("講師・スタッフの行には期生を求めない（学校は入っている扱い）", () => {
    const staff = row({
      university: "講師・スタッフ",
      cohort: 0,
      family_name: "ト",
      given_name: "ミ",
    });
    const plan = planRegistration(staff, { draft: draft(), cached: null });
    expect(plan!.columns.university).toBeUndefined();
    expect(plan!.columns.cohort).toBeUndefined();
  });
});

/**
 * 「いまログインしてきた」印。ログインの戻り道が立て、ブラウザ側が1回だけ読む。
 * 二度読めてしまうと、同じ20問を二度送ることになる。
 */
describe("ログインの印を1回だけ受け取る", () => {
  /** `document.cookie` は代入で1本ずつ足す・消すという癖のある窓口なので、そこまで真似る。 */
  function stubCookies(initial: string) {
    let jar = initial;
    vi.stubGlobal("document", {
      get cookie() {
        return jar;
      },
      set cookie(entry: string) {
        const [pair = "", ...attributes] = entry.split(";").map((part) => part.trim());
        const name = pair.split("=")[0] ?? "";
        const rest = jar
          .split(";")
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith(`${name}=`));
        if (!attributes.includes("max-age=0")) rest.push(pair);
        jar = rest.join("; ");
      },
    });
    return () => jar;
  }

  afterEach(() => void vi.unstubAllGlobals());

  it("印があれば true を返し、そのとき消す", () => {
    const jar = stubCookies(`${REGISTER_COOKIE}=1; nexmax.ready=1`);
    expect(takeRegisterFlag()).toBe(true);
    expect(jar()).not.toContain(REGISTER_COOKIE);
    // 2回目は走らせない（同じ20問を二度送らないため）。
    expect(takeRegisterFlag()).toBe(false);
  });

  it("ほかのクッキーは消さない", () => {
    const jar = stubCookies(`${REGISTER_COOKIE}=1; nexmax.ready=1`);
    takeRegisterFlag();
    expect(jar()).toContain("nexmax.ready=1");
  });

  it("印が無ければ false", () => {
    stubCookies("nexmax.ready=1");
    expect(takeRegisterFlag()).toBe(false);
  });

  /**
   * ログインしていない人には何もさせない（願い #17）。
   * クッキーが無ければ未ログインは確実なので、Supabase へ往復せずに決める。
   */
  it("ログインのクッキーが無ければ、登録の仕事そのものを始めない", () => {
    stubCookies("nexmax.ready=1");
    expect(hasAuthCookieInBrowser()).toBe(false);
  });

  it("分割されたセッションのクッキー（.0）も ログインずみと見る", () => {
    stubCookies("sb-abcdefg-auth-token.0=part1; nexmax.ready=1");
    expect(hasAuthCookieInBrowser()).toBe(true);
  });
});
