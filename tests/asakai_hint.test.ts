import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hintOf } from "../src/lib/meeting/asakai-hint";

/*
 * 言えて いない 札の ヒント（2026-09-19 の 指定「数値など 正しく 言えて いない 場合は
 * 答えは 出さず、…の ように ヒントに する」）。
 */
describe("hintOf — 聞き返しから 型文を 取る", () => {
  it("◯ の ある 型文を「…。」で 返す", () => {
    expect(
      hintOf([
        "進捗を、パーセントで お願いします。自分の 担当の 進捗です。",
        "「今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です」の 形で お願いします。カードの 付せんを 見て ください。",
      ]),
    ).toBe("「今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です。」");
  });

  it("◯ が 無い ときは いちばん 長い「…」（言い方の 形）", () => {
    expect(
      hintOf([
        "問題は ありましたか。",
        "無ければ「ありません」では なく「今の ところ 問題は ありません」と 言って ください。",
      ]),
    ).toBe("「今の ところ 問題は ありません。」");
  });

  it("「…」が 無い ときは 聞き返しの 文 そのもの", () => {
    expect(
      hintOf([
        "今日 行ったことを、もう一度 お願いします。",
        "作業記録を そのまま 読まずに、まとめて 話して ください。大きな 作業から 2つか 3つで けっこうです。",
      ]),
    ).toBe(
      "作業記録を そのまま 読まずに、まとめて 話して ください。大きな 作業から 2つか 3つで けっこうです。",
    );
  });

  it("2つめが 空なら 1つめ、どちらも 空なら 空", () => {
    expect(hintOf(["きのう した ことを、もう いちど お願いします。", ""])).toBe(
      "きのう した ことを、もう いちど お願いします。",
    );
    expect(hintOf(["", " "])).toBe("");
    expect(hintOf([])).toBe("");
  });

  /*
   * **ヒントは 答えを 出さない**。教材の 見本（`example`）の 数字が
   * ヒントに 入って いたら、数を まちがえた 人に 正解を 見せる ことに なる。
   */
  it("朝礼・夕礼の ぜんぶの 札で、進捗の ヒントに 正解の 数字が 入って いない", () => {
    for (const file of ["asakai_kantan", "asakai_muzukashii"]) {
      const meeting = JSON.parse(
        readFileSync(join(process.cwd(), "content/meetings", `${file}.json`), "utf8"),
      ) as {
        asakai: {
          scenes: {
            day: string;
            panels: { id: string; followups: { text: string }[]; example: { text: string } }[];
          }[];
        };
      };
      for (const scene of meeting.asakai.scenes) {
        for (const panel of scene.panels) {
          const hint = hintOf(panel.followups.map((one) => one.text));
          expect(hint, `${file} ${scene.day} ${panel.id}`).not.toBe("");
          const percent = /(\d+)\s*[%％]/u.exec(panel.example.text)?.[1];
          if (percent) {
            expect(hint, `${file} ${scene.day} ${panel.id} に 正解の ${percent}%`).not.toMatch(
              new RegExp(`${percent}\\s*[%％]`, "u"),
            );
          }
        }
      }
    }
  });
});
