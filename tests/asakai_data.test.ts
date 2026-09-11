import { describe, expect, it } from "vitest";

import kantan from "../content/meetings/asakai_kantan.json";
import muzukashii from "../content/meetings/asakai_muzukashii.json";
import { meetingSchema } from "@/content/schema";
import {
  applyUtterance,
  hasNumber,
  initialPanelStates,
  type PanelState,
} from "@/lib/meeting/panels";

/**
 * 朝礼・夕礼の **実データ**を そのまま 見る（台帳 #366）。
 *
 * `tests/meeting_panels.test.ts` は 手で 写した 4枚で 数え方だけを 見る。
 * それだけだと、**教材の 側を 直した ときに 気づけない**——パネルを 1枚 足す・
 * `openAt` を 変えるだけで 合格の 線が 届かなく なっても、あちらは 20件 緑の まま。
 * ここは 教材の JSON を 読んで、**分母と 合格の 線が 合って いるか**を 見る。
 */

const MEETINGS = [
  { name: "かんたん（朝礼）", raw: kantan },
  { name: "むずかしい（夕礼）", raw: muzukashii },
] as const;

describe("スキーマを 通る", () => {
  for (const { name, raw } of MEETINGS) {
    it(`${name} は meetingSchema に 合う`, () => {
      expect(meetingSchema.safeParse(raw).success).toBe(true);
    });
  }
});

describe("合格の 線が 届く ところに ある", () => {
  for (const { name, raw } of MEETINGS) {
    const meeting = meetingSchema.parse(raw);
    const asakai = meeting.asakai!;

    it(`${name} は 5日ぶん ある`, () => {
      expect(asakai.scenes).toHaveLength(5);
    });

    it(`${name} の 合格の 線は 満点を 超えない`, () => {
      const hard = asakai.level === "hard";
      /* かんたん＝開いた カードの 数、むずかしい＝こまりごと以外で 言えた 行の 数。 */
      const unitTotal = asakai.scenes.reduce((sum, scene) => {
        if (!hard) return sum + scene.panels.length;
        return (
          sum +
          scene.panels
            .filter((panel) => panel.id !== "komari")
            .reduce((n, panel) => n + panel.facts.length, 0)
        );
      }, 0);
      expect(asakai.pass.units).toBeLessThanOrEqual(unitTotal);
      /* 5日 まじめに やれば 届く 線か（満点の 6割は 超えて いない ことも 見る）。 */
      expect(asakai.pass.units / unitTotal).toBeGreaterThan(0.5);

      const komariTotal = asakai.scenes.reduce(
        (sum, scene) =>
          sum + (scene.panels.find((panel) => panel.id === "komari")?.facts.length ?? 0),
        0,
      );
      if (asakai.pass.komariBoxes !== undefined) {
        expect(asakai.pass.komariBoxes).toBeLessThanOrEqual(komariTotal);
      }
      if (asakai.pass.komariDays !== undefined) {
        expect(asakai.pass.komariDays).toBeLessThanOrEqual(asakai.scenes.length);
      }
    });

    it(`${name} の 当たりの ことばは すべて 2字 以上`, () => {
      /* `matchAllLocally` は 1字の 語を 当てない（誤爆が 多すぎる）。
         1字を 書くと **その 行は 永久に 立たない**——黙って 難しくなる。 */
      const short: string[] = [];
      for (const scene of asakai.scenes) {
        for (const panel of scene.panels) {
          for (const fact of panel.facts) {
            for (const word of fact.keywords) {
              if (word.length < 2) short.push(`${scene.day}/${panel.id}/${fact.id}: ${word}`);
            }
          }
        }
      }
      expect(short).toEqual([]);
    });

    it(`${name} は どの日も 司会の れいで カードが ぜんぶ 開く`, () => {
      /* れいは「2回 聞いても 開かない とき」の 最後の 足場。
       **それを そのまま 言っても 開かない** なら、足場に なって いない。 */
      for (const scene of asakai.scenes) {
        const panels = scene.panels.map((panel) => ({
          id: panel.id,
          label: panel.label,
          openAt: panel.openAt,
          rule: panel.rule,
          facts: panel.facts.map((fact) => ({
            id: fact.id,
            box: fact.box,
            keywords: fact.keywords,
            minHits: fact.minHits,
            allOf: fact.allOf,
          })),
        }));
        let states: readonly PanelState[] = initialPanelStates(panels);
        for (const panel of scene.panels) {
          states = applyUtterance({ utterance: panel.example.text, panels, states }).states;
        }
        const shut = panels
          .filter((panel) => !states.find((s) => s.id === panel.id)?.full)
          .map((panel) => `${scene.day}/${panel.id}`);
        expect(shut).toEqual([]);
      }
    });
  }
});

describe("数字の 見かた", () => {
  it("「十分」は 数では ない（足りて いる の 意味）", () => {
    expect(hasNumber("まだ 十分 できて いません。")).toBe(false);
  });
  it("漢数字の 数え方は 数える", () => {
    expect(hasNumber("三回 ためしました。")).toBe(true);
    expect(hasNumber("五個 のこって います。")).toBe(true);
  });
  it("「一覧」は 数では ない", () => {
    expect(hasNumber("一覧を 書きました。")).toBe(false);
  });
});
