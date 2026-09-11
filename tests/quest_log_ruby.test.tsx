import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestLogBox } from "../src/components/quest/quest-play";
import { questSchema, type Quest } from "../src/content/schema";
import { questLogOpening } from "../src/lib/quest/log";

/**
 * ログの 箱が **本当に 2つの 辞書で 描いて いる**ことを 画面の 側から 固定する
 *
 * `tests/quest_log.test.ts` は 索引を 自分で 組み直して 読みを 数えるので、
 * **画面が その 索引を 使って いるか**までは 見て いない。
 * e2e（`tests/e2e/furigana.spec.ts`）も 裸の 漢字しか 数えないので、
 * **読みが まちがった ルビ**は 素通りする——2026-09-11 の 検収の 指摘。
 *
 * つまり 直す 前の 書き方（教材の 索引だけで 描く）に 戻しても、この 2本では
 * 気づけなかった。ここが その 配線を 見張る。
 */

const quest: Quest = questSchema.parse(
  JSON.parse(
    readFileSync(join(__dirname, "..", "content", "quests", "waterfall_quest.json"), "utf8"),
  ),
);

const render = (text: string) =>
  renderToStaticMarkup(
    <QuestLogBox quest={quest} lines={[{ id: 1, text, tone: "critical" }]} show />,
  );

describe("ログの 箱の ルビ", () => {
  it("「レベルが 上がった！」は 上が=あが（教材の 上=うえ に 負けない）", () => {
    const html = render("ソカは レベルが 上がった！");
    expect(html).toContain("<ruby>上が<rt>あが</rt></ruby>");
    expect(html).not.toContain("うえ");
  });

  it("「【警告】N個の…」は ぜんぶ ルビが 付く", () => {
    const html = render("【警告】3個の 大きな バグが 見つかった！");
    expect(html).toContain("<ruby>警告<rt>けいこく</rt></ruby>");
    expect(html).toContain("<ruby>個<rt>こ</rt></ruby>");
    expect(html).toContain("<ruby>大<rt>おお</rt></ruby>");
    expect(html).toContain("<ruby>見<rt>み</rt></ruby>");
  });

  it("教材の 字（解説の 文）も 同じ 箱で 読める", () => {
    const html = render("【いちばん いい 手】お客様の希望を正しく理解できた！");
    expect(html).toContain("<ruby>手<rt>て</rt></ruby>");
    expect(html).toContain("<ruby>客様<rt>きゃくさま</rt></ruby>");
    expect(html).toContain("<ruby>希望<rt>きぼう</rt></ruby>");
  });

  it("1行も 無い ときの「〜が 始まった！」にも ルビが 付く", () => {
    const html = renderToStaticMarkup(<QuestLogBox quest={quest} lines={[]} show />);
    expect(html).toContain(quest.title);
    expect(html).toContain("<ruby>始<rt>はじ</rt></ruby>");
    expect(questLogOpening(quest)).toContain(quest.title);
  });

  it("ふりがな OFF の ときは ルビを 出さない", () => {
    const html = renderToStaticMarkup(
      <QuestLogBox
        quest={quest}
        lines={[{ id: 1, text: "ソカは レベルが 上がった！", tone: "critical" }]}
        show={false}
      />,
    );
    expect(html).not.toContain("<ruby>");
    expect(html).toContain("上がった");
  });
});
