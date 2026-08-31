import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingSchema, quizSetSchema } from "@/content/schema";
import { ALWAYS_POINTS, FOCUS_POINT, pointsTable } from "@/lib/talkgame/affinity";

/**
 * 社長の しつもんは、**学習者が 準備して きた ことと そろって いるか**
 *
 * ## 何が 起きて いたか（2026-08-31 の 指摘）
 * 準備の フォームは 5問。社長の 出だしの しつもんは 10本 あって、
 * **そろって いたのは はじめの 4本だけ**だった。5本目から 先は
 *（Japanese IT Pathway・卒業後の 仕事・今の 勉強・日本に 行くまでに・
 * 大学の いい ところ・Khmersabai）準備に 無い ことを 聞いて いた——
 * 学習者は 書いて 来た メモを 開いても 答えが どこにも 無い、という 場面に 入る。
 *
 * 直しは **準備を 7問に 増やして、しつもんを 6本に 絞る**（本人の 指定）。
 * ①〜⑥ が 出だしの しつもんと 1対1、⑦ は 聞く ばん（学生が しつもんする ばん）の ぶん。
 * 7本目から 先の しつもんは 消し、そこから 先は AIが 学習者の ことばから 深掘りを 作る。
 *
 * 文章では 守れない ので、**対応を 機械で 見張る**。しつもんを 1本 足した ときに
 * 準備を 足し忘れたら、ここで 止まる。
 *
 * ## 「見る ところ」も ここで 見る
 * 採点の ものさし（`focus`）は 答える前に 学習者へ 予告する。予告した 表と
 * 実際に 加点する 表が ちがっては いけないので、**1ターンの 最大が そろって いる**ことも
 * ここで 確かめる（`applyTurn` の「話す ばんを 出る ときの 好感度は openAt + 11 を
 * 超えない」という 見立てが これに 乗って いる）。
 */

const ROOT = join(__dirname, "..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

const matsui = meetingSchema.parse(read("content/meetings/kaisha_matsui.json"));
const junbi = quizSetSchema.parse(read("content/quizsets/kaisha_omoshiroi.json"));

describe("松井社長の 出だしの しつもん", () => {
  const openers = matsui.talkGame?.openers ?? [];

  it("ぜんぶ 準備フォームの 設問に つながって いる", () => {
    const ids = new Set(junbi.questions.map((one) => one.id));
    const orphans = openers.filter((one) => !one.from || !ids.has(one.from));
    expect(orphans.map((one) => one.ask)).toEqual([]);
  });

  it("同じ 準備の 設問を 2回 聞かない", () => {
    const froms = openers.map((one) => one.from);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it("聞く ばんの ぶんの 準備が ちょうど 1問 残って いる", () => {
    /*
     * **片むきだけでは 足りない。** 聞かれるのに 準備が 無いのも、準備したのに
     * まったく 使われないのも、どちらも 学習者から すると「書いた ものが 使われない」に なる。
     *
     * ただし さいごの 1問（「松井社長に 何を 聞きたい？」）だけは 別で、
     * **聞く ばんで 学生が 自分から 出す ため**の もの。ここを 出だしの しつもんに
     * 割り当てて しまうと、聞く ばんの 手もとが 空に なる。
     *
     * 深掘り（出だしを 使いきった あと）は AIが 学習者の ことばから 作るので、
     * 準備が 無くて よい——そこは 学習者が いま 言った ことの つづきだから。
     */
    const used = new Set(openers.map((one) => one.from));
    const spare = junbi.questions.filter((one) => !used.has(one.id));
    expect(spare.map((one) => one.id)).toEqual(["t7"]);
  });

  it("1本ごとに 見る ところが 決まって いて、1ターンの 最大は そろう", () => {
    expect(openers.length).toBeGreaterThan(0);
    const always = Object.values(ALWAYS_POINTS).reduce((sum, one) => sum + one, 0);
    for (const opener of openers) {
      expect(opener.focus.length).toBe(2);
      const table = pointsTable("talk", opener.focus);
      const max = Object.values(table).reduce((sum, one) => sum + one, 0);
      expect(max).toBe(always + FOCUS_POINT * 2);
    }
  });
});

describe("前からの 書き方（ただの 文字列）", () => {
  it("文字列で 書いた しつもんも 読めて、共通の 観点に なる", () => {
    const parsed = meetingSchema.parse({
      ...read("content/meetings/kaisha_matsui.json"),
      talkGame: {
        ...read("content/meetings/kaisha_matsui.json").talkGame,
        openers: ["どんな 会社だと 思いましたか。"],
      },
    });
    const opener = parsed.talkGame?.openers[0];
    expect(opener?.ask).toBe("どんな 会社だと 思いましたか。");
    expect(opener?.from).toBeUndefined();
    expect(opener?.focus).toEqual(["concrete", "reason"]);
  });
});
