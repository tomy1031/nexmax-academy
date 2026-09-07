import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpeningLine } from "../src/components/listening/live-mode";
import { contentSchema, type Scenario } from "../src/content/schema";

/**
 * 「はじめの 一言」— つないだ 直後の「何を 言えば いいか わからない」を 越えさせる 型文。
 *
 * ここは **押すと 相手役へ そのまま 送られる**（`live.send(openingLine)`）。だから
 * 出す 以上は 文に なって いなければ ならない。2026-09-07 の R4 検収では、
 * お客さまインタビュー 5話で「しつれいします。ところで、〜は どうですか？。」
 * 「しつれいします。会社で 調べて、ご連絡します。」（帰りぎわの 文が 第一声）に なって いた。
 *
 * 5話は 旧アプリと 同じ 固定の 第一声を 使うので `buildOpeningLine` を 通らないが、
 * **通る 教材が 増えた ときに 同じ 事故を 繰り返さない** ように、ここで 形を 見張る。
 */

const DIR = join(import.meta.dirname, "..", "content", "scenarios");

function scenarios(): Scenario[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => contentSchema.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))))
    .filter((c): c is Scenario => c.kind === "scenario");
}

describe("はじめの 一言（buildOpeningLine）", () => {
  it("教材が 1本以上 ある（テストが 空回りして いない）", () => {
    expect(scenarios().length).toBeGreaterThan(0);
  });

  it("出す ときは 文に なって いる（穴あき・問い切りの 記号を 残さない）", () => {
    for (const scenario of scenarios()) {
      const line = buildOpeningLine(scenario);
      if (line === null) continue; // 拾える 引用が 無ければ カードは goal と tip だけ
      expect(line, `${scenario.id} の 第一声`).toMatch(/。$/u);
      expect(
        /[〜～？?！!]/u.test(line),
        `${scenario.id} の 第一声「${line}」に 穴あき・問い切りの 記号`,
      ).toBe(false);
      // 「？。」「、。」のような 句読点の 重なりを 作らない
      expect(
        /[。、][。、]/u.test(line),
        `${scenario.id} の 第一声「${line}」に 句読点の 重なり`,
      ).toBe(false);
    }
  });

  it("いまの 2本は これまでどおりの 一言を 出す（非退行）", () => {
    const byId = new Map(scenarios().map((s) => [s.id, s]));
    expect(buildOpeningLine(byId.get("youken_aoba")!)).toBe(
      "しつれいします。まず、この ページの 目的は 何ですか。",
    );
    expect(buildOpeningLine(byId.get("talk-asakai-report")!)).toBe(
      "おはようございます。相談が あります。",
    );
  });

  it("こわれた 引用しか 無い 教材は null を 返す（変な 文を 送らせない）", () => {
    for (const id of ["bakery", "salon", "farm", "juku", "guesthouse"]) {
      const scenario = scenarios().find((s) => s.id === id);
      if (!scenario) continue;
      const line = buildOpeningLine(scenario);
      if (line === null) continue;
      expect(/[〜～？?！!]/u.test(line), `${id} の 第一声「${line}」`).toBe(false);
    }
  });
});
