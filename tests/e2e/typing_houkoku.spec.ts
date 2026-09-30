import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 報告の リスニングの あとの タイピング（2026-09-30 の 指定・願い #550）
 *
 * 1. お手本の 文を **かなだけでも 漢字まじりでも** 打って 当たる
 * 2. 正解して はじめて **英語訳と ことばの 意味（N4以上）**が 出る（外れたら 出ない）
 * 3. 外れたら ❌ と はっきり 言う（規律1）。リセット・つぎの 文へ が 動く
 * 4. ぜんぶ 正解すると 済みに なる（関門）
 * 5. 出て くる 字に 裸の 漢字が 無い（判定の あとに 出る 札・カードも 含めて）
 */

const STAGE = "houkoku-kiku";
const TYPING = "houkoku_kanryou_typing";
const PATH = `/${STAGE}/typing-${TYPING}`;

function stageRefs(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  return stage.contents.map((item) => item.ref);
}

function sentences(): { text: string; en: string; wordIds: string[] }[] {
  return JSON.parse(readFileSync(join("content", "typing", `${TYPING}.json`), "utf8")).sentences;
}

/** 順番の 関門を 出さない ために、この 教材より 前を 済みに する。 */
async function open(page: Page, context: Parameters<typeof seedCompleted>[0]) {
  const all = stageRefs();
  await seedCompleted(context, all.slice(0, all.indexOf(TYPING)));
  await page.goto(PATH);
  await expect(page.locator('[data-typing="model"]')).toBeVisible();
}

async function type(page: Page, text: string) {
  const input = page.getByLabel("お手本と 同じ 文を 入力する");
  await input.fill(text);
  await page.getByRole("button", { name: "判定", exact: true }).click();
}

test("かなだけで 打っても 当たり、英語訳と ことばの 意味が 出る", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, context);
  await expect(page.locator('[data-typing="progress"]')).toHaveText(`1 / ${sentences().length}`);
  // 正解の 前は 英語訳を 見せない
  await expect(page.locator('[data-typing="translation"]')).toHaveCount(0);

  await type(page, "たかはしさん、いま、おじかん よろしいでしょうか。");
  await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
  await expect(page.locator('[data-typing="translation"]')).toContainText(sentences()[0]!.en);
  await expect(page.locator('[data-typing="words"] li')).toHaveCount(
    sentences()[0]!.wordIds.length,
  );
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "typing-houkoku-kanryou-ok-390");
});

test("ちがう 文は ❌ で、英語訳は 出ない。リセットで 消える", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, context);
  await type(page, "たかはしさん、いま、じかん");
  const verdict = page.locator('[data-typing="verdict"]');
  await expect(verdict).toHaveAttribute("data-ok", "false");
  await expect(verdict).toContainText("❌");
  // どこまで 合って いたかを 返す
  await expect(verdict).toContainText("「たかはしさん、いま」");
  await expect(page.locator('[data-typing="translation"]')).toHaveCount(0);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "typing-houkoku-kanryou-ng-390");

  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.getByLabel("お手本と 同じ 文を 入力する")).toHaveValue("");
  await expect(verdict).toHaveCount(0);
});

test("漢字まじりで ぜんぶ 打つと 済みに なる（つぎの 文へ で 進む）", async ({ page, context }) => {
  await open(page, context);
  const list = sentences();
  for (const [i, sentence] of list.entries()) {
    await expect(page.locator('[data-typing="progress"]')).toHaveText(`${i + 1} / ${list.length}`);
    // つぎの 文へ は 正解の あとしか 押せない
    if (i < list.length - 1) {
      await expect(page.getByRole("button", { name: "つぎの 文へ" })).toBeDisabled();
    }
    // 空白と 句読点は 打たなくて よい
    await type(page, sentence.text.replace(/[\s、。]/g, ""));
    await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
    if (i < list.length - 1) await page.getByRole("button", { name: "つぎの 文へ" }).click();
  }
  await expect(page.locator('[data-typing="finished"]')).toBeVisible();
  const saved = await page.evaluate(
    (id) => window.localStorage.getItem(`nexmax:v1:content:${id}`),
    TYPING,
  );
  expect(JSON.parse(saved ?? "{}")).toMatchObject({ status: "completed" });
});

test("Enter でも 判定できる（IME の 確定の Enter では 判定しない）", async ({ page, context }) => {
  await open(page, context);
  const input = page.getByLabel("お手本と 同じ 文を 入力する");
  await input.fill(sentences()[0]!.text);
  await input.press("Enter");
  await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
});
