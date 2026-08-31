import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingSchema, quizSetSchema } from "@/content/schema";
import { ALWAYS_POINTS, FOCUS_POINT, pointsTable } from "@/lib/talkgame/affinity";

/**
 * 社長の しつもんは、**学習者が 準備して きた ことと そろって いるか**
 *
 * ## 何が 起きて いたか（2026-08-31 の 指摘）
 * 準備の フォーム（`kaisha_omoshiroi`）は 3問。社長の 出だしの しつもんは 10本 あって、
 * **そろって いたのは はじめの 3本だけ**だった。4本目から 先は
 *（カンボジアの いい ところ・Japanese IT Pathway・卒業後の 仕事・今の 勉強・
 * 日本に 行くまでに・大学の いい ところ・Khmersabai）準備に 無い ことを 聞いて いた——
 * 学習者は 書いて 来た メモを 開いても 答えが どこにも 無い、という 場面に 入る。
 *
 * 直しは **しつもんの ほうを 3本に そろえる**。4本目から 先は 消し、そこから 先は
 * AIが 学習者の ことばから 深掘りを 作る（同じ日の 願い #266 で 準備が 5問→3問に
 * なった ばかりなので、**準備を 増やす 向きには 直さない**）。
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

  it("準備した のに 聞かれない 設問も 無い（両むきに 1対1）", () => {
    /*
     * **片むきだけでは 足りない。** 聞かれるのに 準備が 無いのも、準備したのに
     * 聞かれないのも、どちらも 学習者から すると「書いた ものが 使われない」に なる。
     *
     * 深掘り（出だしを 使いきった あと）は AIが 学習者の ことばから 作るので、
     * 準備が 無くて よい——そこは 学習者が いま 言った ことの つづきだから。
     */
    const used = new Set(openers.map((one) => one.from));
    const unasked = junbi.questions.filter((one) => !used.has(one.id));
    expect(unasked.map((one) => one.id)).toEqual([]);
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
