import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioSchema, type Scenario } from "../src/content/schema";
import { buildOpeningLine } from "../src/components/listening/live-mode";
import {
  CLIENT_ID,
  groupReqsByKind,
  judgeAddressed,
  ownerOf,
  personaWithContext,
  talkPeople,
} from "../src/components/listening/people";

/**
 * 3人の たいわ（アプリの 要件定義）の 芯——**だれに 聞くか**の 判定。
 *
 * 札は 担当の 人に 聞いた ときだけ 開く。ちがう 人に 聞いたら「◯◯が くわしい」と
 * 相手を 教える（ぼかさない・規律1）。相手が 1人の 教材では 担当が 全部 その人なので、
 * これまでと 同じ 結果に なる ことも ここで 見張る。
 */

const REQS = [
  { id: "r1", keywords: ["予算", "よさん", "いくら"], owner: undefined },
  { id: "r2", keywords: ["在庫", "ざいこ", "のこり"], owner: "tenchou" },
  { id: "r3", keywords: ["予約", "よやく", "DM"], owner: "sensei" },
] as const;

describe("だれに 聞くか（judgeAddressed）", () => {
  it("担当の 人に 聞けば 開く", () => {
    const out = judgeAddressed({
      utterance: "在庫の のこりは どう 数えて いますか",
      reqs: REQS,
      openIds: new Set(),
      targetId: "tenchou",
    });
    expect(out).toEqual({ kind: "opened", reqId: "r2" });
  });

  it("ちがう 人に 聞くと 開かず、担当を 教える", () => {
    const out = judgeAddressed({
      utterance: "在庫の のこりは どう 数えて いますか",
      reqs: REQS,
      openIds: new Set(),
      targetId: CLIENT_ID,
    });
    expect(out).toEqual({ kind: "wrongPerson", reqId: "r2", ownerId: "tenchou" });
  });

  it("owner を 省いた 札は 主催者（client）の もの", () => {
    expect(ownerOf({ owner: undefined })).toBe(CLIENT_ID);
    const out = judgeAddressed({
      utterance: "予算は いくらですか",
      reqs: REQS,
      openIds: new Set(),
      targetId: CLIENT_ID,
    });
    expect(out).toEqual({ kind: "opened", reqId: "r1" });
  });

  it("1語だけなら「あと ひとこと」、あいさつは 何も 開かない", () => {
    expect(
      judgeAddressed({
        utterance: "予算の 話は あとで",
        reqs: REQS,
        openIds: new Set(),
        targetId: CLIENT_ID,
      }),
    ).toEqual({ kind: "close", near: "r1" });
    expect(
      judgeAddressed({
        utterance: "こんにちは",
        reqs: REQS,
        openIds: new Set(),
        targetId: CLIENT_ID,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("相手の 並びと つなぎ直しの 指示", () => {
  const base = {
    kind: "scenario",
    id: "t",
    order: 1,
    title: "た",
    subtitle: "た",
    subtitleEn: "t",
    emoji: "🍵",
    color: "leaf",
    difficulty: 1,
    client: { name: "山本", role: "社長", desc: "d", voice: "Kore", avatar: "x", tip: "t" },
    mission: {
      chat: [
        { from: "hendy", text: "a" },
        { from: "me", text: "b" },
      ],
      goal: "g",
    },
    words: [
      { w: "a", r: "あ", en: "a", m: "a" },
      { w: "b", r: "い", en: "b", m: "b" },
      { w: "c", r: "う", en: "c", m: "c" },
      { w: "d", r: "え", en: "d", m: "d" },
    ],
    interview: {
      persona: "P",
      others: [
        {
          id: "sensei",
          name: "佐々木",
          role: "先生",
          desc: "d",
          voice: "Aoede",
          avatar: "x",
          tip: "t",
          persona: "S",
        },
      ],
      reqs: [1, 2, 3, 4, 5, 6].map((n) => ({
        id: `r${n}`,
        cat: "why",
        icon: "x",
        label: "l",
        secret: "s",
        fact: "f",
        keywords: ["a", "b", "c"],
        hint: "h",
        owner: n % 2 ? undefined : "sensei",
        kind: n <= 3 ? "problem" : "functional",
      })),
    },
    doc: {
      projectName: "p",
      clientLine: "c",
      sections: [
        { title: "s", items: [1, 2, 3, 4, 5, 6].map((n) => ({ reqId: `r${n}`, text: "x" })) },
      ],
    },
    lesson: { title: "l", points: ["a", "b"] },
  };

  it("スキーマは others と owner を 受け、いない 人の owner は 弾く", () => {
    expect(scenarioSchema.safeParse(base).success).toBe(true);
    const bad = structuredClone(base);
    bad.interview.reqs[0]!.owner = "dareka";
    expect(scenarioSchema.safeParse(bad).success).toBe(false);
  });

  it("先頭は 主催者、others が 続く。段は 種類の 順", () => {
    const scenario = scenarioSchema.parse(base) as Scenario;
    const people = talkPeople(scenario);
    expect(people.map((p) => p.id)).toEqual([CLIENT_ID, "sensei"]);
    expect(people[1]!.persona).toBe("S");
    expect(groupReqsByKind(scenario.interview.reqs).map((g) => g.kind)).toEqual([
      "problem",
      "functional",
    ]);
  });

  it("つなぎ直す ときは これまでの 会話を 添え、あいさつを やり直させない", () => {
    const scenario = scenarioSchema.parse(base) as Scenario;
    const people = talkPeople(scenario);
    const text = personaWithContext(
      people[1]!,
      [
        { from: "me", text: "予算は いくらですか", mode: "text" },
        { from: CLIENT_ID, text: "1,500,000円です", mode: "voice" },
      ],
      people,
    );
    expect(text.startsWith("S")).toBe(true);
    expect(text).toContain("学習者: 予算は いくらですか");
    expect(text).toContain("山本: 1,500,000円です");
    expect(text).toContain("名乗ってから");
    // 会話が 無ければ persona そのまま
    expect(personaWithContext(people[1]!, [], people)).toBe("S");
  });
});

/**
 * 「アプリの 要件定義」（youken2）— 画面の ヒントの とおりに **担当の 人へ** 聞けば 札が 開く。
 * `talk_hint_opens.test.ts` が 5話に して いる 見張りの、3人版。
 */
describe("youken2: ヒントどおりに 担当へ 聞けば 開く", () => {
  const file = join(import.meta.dirname, "..", "content", "scenarios", "youken2_aoba_app.json");
  const scenario = scenarioSchema.parse(JSON.parse(readFileSync(file, "utf8"))) as Scenario;
  const reqs = scenario.interview.reqs;
  const question = (hint: string) => /[「『]([^」』]+)[」』]/u.exec(hint)?.[1] ?? hint;

  it("12件 すべて、ヒントの 質問で 開く", () => {
    for (const req of reqs) {
      const out = judgeAddressed({
        utterance: question(req.hint),
        reqs,
        openIds: new Set(),
        targetId: ownerOf(req),
      });
      expect(out, `${req.id}: ${question(req.hint)}`).toEqual({ kind: "opened", reqId: req.id });
    }
  });

  it("ことばが 重なる 札でも、話しかけて いる 人の 札を 先に 見る", () => {
    // 「機能・ほしい・どんな」は 先生（r6）にも 店長（r10）にも ある。田中に 聞けば 田中の 札
    const out = judgeAddressed({
      utterance: "どんな 機能が ほしいですか",
      reqs,
      openIds: new Set(),
      targetId: "tanaka",
    });
    expect(out).toEqual({ kind: "opened", reqId: "r10" });
    // 同じ 文を 先生に 聞けば 先生の 札（追い返さない）
    expect(
      judgeAddressed({
        utterance: "どんな 機能が ほしいですか",
        reqs,
        openIds: new Set(),
        targetId: "sasaki",
      }),
    ).toEqual({ kind: "opened", reqId: "r6" });
  });

  it("3人の 教材の 第一声は 攻略ひとことから（教訓の 考える 文を 拾わない）", () => {
    expect(buildOpeningLine(scenario)).toBe(
      "しつれいします。お久しぶりです。きょうは よろしく お願いします。",
    );
  });

  it("担当では ない 人に 聞くと、開かずに 担当を 教える", () => {
    const zaiko = reqs.find((r) => r.id === "r10")!;
    const out = judgeAddressed({
      utterance: question(zaiko.hint),
      reqs,
      openIds: new Set(),
      targetId: CLIENT_ID,
    });
    expect(out).toEqual({ kind: "wrongPerson", reqId: "r10", ownerId: "tanaka" });
  });

  it("あいさつでは 何も 開かない", () => {
    for (const line of [
      "お久しぶりです。きょうは よろしく お願いします。",
      "ありがとうございます",
      "すみません、もう一度 お願いします",
    ]) {
      for (const person of talkPeople(scenario)) {
        const out = judgeAddressed({
          utterance: line,
          reqs,
          openIds: new Set(),
          targetId: person.id,
        });
        expect(out.kind, `${line} → ${person.id}`).toBe("none");
      }
    }
  });
});
