import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * 調査（リサーチ）：日本の 会社の 階級 — **出して はじめて つぎへ 行ける**
 *
 * 2026-09-11 の 指定「ここはシートじゃなくて、何か入力できるツールがあると
 * 嬉しいです。階級順に入力と並べ替えができるなにかいいものつくれますか？
 * 提出して初めて次の画面に行けます」。
 *
 * 見張るのは 3つ。どれも **通しでは 気づけない** 壊れ方を する:
 *
 *  1. **手で 押す「おわりました」が 出て いない**。出て いると、何も 書かずに
 *     押すだけで 関門が 開く（＝出す ことに 意味が 無くなる）。ページが
 *     `nexmax:link-owns-done` を 名乗り、アプリが それを 受けて 引っこめる、
 *     という 2段の 仕掛けなので、どちらが 欠けても 静かに 元に もどる。
 *  2. **入力と ならべ替えが できる**。↑で 動かした 順が、そのまま 出した ものに なる。
 *  3. **出すと アプリ側が ✅ に なる**（iframe → 親への 合図が 届いて いる）。
 */

const PATH = "/houkoku/link";

/**
 * 手前の 教材を「おわった」ことに してから 開く。
 *
 * この ステージは 順路（関門）が 効いて いるので、そのまま 行くと
 * 「まだ この きょうざいの じゅんばんでは ありません」で 止まる。
 * 順路そのものは 別の テストが 見る（`junro.spec.ts`）。
 */
async function openTool(page: Page, context: BrowserContext) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const before = stage.contents
    .slice(
      0,
      stage.contents.findIndex((content) => content.ref === "houkoku_search"),
    )
    .map((content) => content.ref);
  await seedCompleted(context, before);
  await page.goto(PATH);
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  return page.frameLocator("iframe");
}

/** 学習者が 調べて 入れる ことば（並びは わざと ちがえて 入れる）。 */
const TYPED = ["社長", "部長", "取締役", "課長", "社員"];
/** 3ばんめの 取締役を ↑で 2ばんめへ 動かした あとの 並び。 */
const MOVED = ["社長", "取締役", "部長", "課長", "社員"];

test("調査（リサーチ）: 入れて ならべて 出すと、はじめて ✅ に なる", async ({ page, context }) => {
  const tool = await openTool(page, context);
  await expect(tool.getByLabel("1ばんめ")).toBeVisible();

  /* 1. 出す 前に、手で 押せる「おわりました」が 無い。 */
  await expect(page.getByRole("button", { name: "おわりました", exact: true })).toHaveCount(0);

  /* 2. 入れて、↑で ならべ替える。 */
  for (const [index, word] of TYPED.entries()) {
    await tool.getByLabel(`${index + 1}ばんめ`).fill(word);
  }
  await tool.locator("li.row").nth(2).getByRole("button", { name: "上へ" }).click();
  for (const [index, word] of MOVED.entries()) {
    await expect(tool.getByLabel(`${index + 1}ばんめ`)).toHaveValue(word);
  }

  const areas = tool.locator("textarea");
  await areas.nth(0).fill("In my country: CEO, manager, staff.");
  await areas.nth(1).fill("We report only when there is a problem.");
  await areas.nth(2).fill("The boss is closer than in Japan.");

  await shot(page, "houkoku-search-01-form");

  /* 3. 出すと、出した 順が 出て、アプリ側が ✅ に なる。 */
  await tool.getByRole("button", { name: /出す/ }).click();
  await expect(tool.locator("#doneList li")).toHaveText(MOVED);
  await expect(page.getByRole("button", { name: /おわりました/ })).toBeVisible();
  await shot(page, "houkoku-search-02-done");
});

test("調査（リサーチ）: 足りない ものを 数で 言う（ぼかさない）", async ({ page, context }) => {
  const tool = await openTool(page, context);
  const note = tool.locator("#note");

  // 何も 書いて いない とき: 階級が 5つ 足りない
  await expect(note).toContainText("5つ");

  await tool.getByLabel("1ばんめ").fill("社長");
  await expect(note).toContainText("4つ");

  // 出しても、まだ 出せない（画面は 入力の まま）
  await tool.getByRole("button", { name: /出す/ }).click();
  await expect(tool.getByLabel("1ばんめ")).toBeVisible();
});
