import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rescueWord, seedCompleted } from "./helpers";

/**
 * 関所の あいことば（リスニング）
 *
 * 表示率が 目標に 届かない 学習者は、先生から 聞いた あいことばで つぎへ 進める。
 * 守りたい ことは 2つ:
 *
 *  1. **先生が 言った とおりに 打てば 開く**
 *  2. **ソースを 見ても 読めない** — client component の props は 作りおきの HTML に
 *     そのまま 載る ので、語を 渡すと Ctrl+U で 一発で 分かる。2026-09-22 の 検収で
 *     実際に `"rescueWord":"…"` が 配信HTMLに 出て いた（いまは 指紋だけを 送る）。
 */

const STAGE = "houkoku";
const LISTENING = "houkoku_listening";

function itemsBeforeListening(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  const refs = stage.contents.map((item) => item.ref);
  return refs.slice(0, refs.indexOf(LISTENING));
}

test("あいことばは ページの ソースに 出て こない", async ({ page }) => {
  const response = await page.request.get(`/${STAGE}/listening`);
  const html = await response.text();

  // 「これが あいことば」と 名札の ついた 形では 載って いない
  expect(html).not.toContain("rescueWord");
  // 代わりに 指紋（16桁の 16進）が 載って いる
  expect(html).toMatch(/rescue\\?":\\?\[\\?"[0-9a-f]{16}/u);

  /*
   * **語そのものは 消せない。** 台本と さがす ことばは 聞き取りチェックの ために
   * ブラウザへ 送る ので、教材の 中の ことばを あいことばに する かぎり、
   * どこかには 必ず ある（`正直` は さがす ことばの 1つでも ある）。
   * ここで 止めたいのは「どれが あいことばか が 一目で 分かる」形の ほう。
   */
});

test("先生の あいことばで 関所が 開き、ちがう ことばでは 開かない", async ({ page, context }) => {
  await seedCompleted(context, itemsBeforeListening());
  await page.goto(`/${STAGE}/listening`);
  await page.getByRole("button", { name: /はじめる/ }).click();

  // 1語だけ 入れて、表示率は 目標（30%）に 届かせない
  const input = page.getByLabel("聞こえた ことばを 入力する");
  await input.fill("問題");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "こたえあわせに すすむ" })).toHaveCount(0);

  await page.getByText("どうしても すすめない ときは").click();
  const word = page.getByLabel("あいことば");

  await word.fill("ちがうことば");
  await page.getByRole("button", { name: "ひらく" }).click();
  await expect(page.getByText("ちがう ようです")).toBeVisible();
  await expect(page.getByRole("button", { name: "こたえあわせに すすむ" })).toHaveCount(0);

  await word.fill(rescueWord(LISTENING));
  await page.getByRole("button", { name: "ひらく" }).click();
  await expect(page.getByRole("button", { name: "こたえあわせに すすむ" })).toBeVisible();
});
