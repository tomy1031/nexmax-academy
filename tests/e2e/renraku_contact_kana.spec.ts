import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot, writeFillinIn } from "./helpers";

/**
 * 連絡文の 練習（初級：メール）— **かなで 書いても ⭕・✗の わけが 分かる**
 *
 * 2026-11-27 の 指定:
 *  「連絡文の練習のclaudeの判定が厳密すぎます。もう少しひらがなを使っていたりカタカナを
 *   使っているものは許容して欲しいです。何が間違っているのか明確になるようなメッセージを
 *   表示するようにしてください。」
 *
 * 見張るのは 3つ（鍵ゼロ＝アプリの ⭕✗だけで 動く 形。AIの 返事は 見ない）:
 *  1. 漢字の ことばを ひらがな・カタカナで 書いた メールが ⭕に なる
 *  2. ✗の 欄には【欄の 名前】と わけ（数字が ちがう・ことばが 足りない）が 出る
 *  3. その わけの 文にも 裸の 漢字が 無い（規律2）
 */

const QUIZ = "renraku_contact_quiz";
const PATH = `/renraku/quiz-${QUIZ}`;

async function seedUpToQuiz(context: BrowserContext) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((content) => content.ref === QUIZ);
  expect(at, `連絡ステージに ${QUIZ} が 無い`).toBeGreaterThan(0);
  await seedCompleted(
    context,
    stage.contents.slice(0, at).map((content) => content.ref),
  );
}

/** 開いた ときの ステージ クリアの 板を 閉じる（この 教材は 関門では ない）。 */
async function closeClearDialog(page: Page) {
  const stay = page.getByRole("button", { name: "ここに のこる" });
  await expect(stay).toBeVisible({ timeout: 15_000 });
  await stay.click();
  await expect(page.getByRole("dialog", { name: "ステージ クリア" })).toHaveCount(0);
}

test("連絡文: かなで 書いても ⭕、✗の ときは 何が ちがうかを 出す", async ({ page, context }) => {
  await seedUpToQuiz(context);
  await page.goto(PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  const first = page.locator("#q-mail_1");
  const ask = first.getByRole("button", { name: /こたえの チェック/ });

  /* 2. まちがえた 欄には【欄の 名前】と わけが 出る。 */
  await writeFillinIn(page, "mail_1", {
    宛先: "さとうさん",
    問題: "ろぐいんできない",
    原因: "さーばーのえらー",
    直る予定: "きょうの16じ",
  });
  await ask.click();
  await expect(first.getByText(/なおす ところが/)).toBeVisible();
  const card = first.getByRole("region", { name: "AIの ひょうか" });
  // ルビが 語の 中に 入るので、ふりがなの 入らない ところで さがす
  await expect(card.getByText(/ところの ことばが/)).toBeVisible();
  await expect(card.getByText(/が メモと ちがいます。メモの/)).toBeVisible();
  // かなで 書いた 欄（問題・原因）は ⭕なので、✗の しるしは 2つだけ
  await expect(first.getByText("✗ なおす", { exact: true })).toHaveCount(2);
  await expect(first.getByText("⭕ OK", { exact: true })).toHaveCount(2);
  /* 3. わけの 文も ふりがな つき。 */
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "renraku-contact-kana-01-reason");

  /* 1. ぜんぶ かなで 書いた メールは ⭕。 */
  await writeFillinIn(page, "mail_1", {
    宛先: "しすてむかんりぶの サトウさん",
    直る予定: "きょうの 15じ",
  });
  await ask.click();
  await expect(first.getByText(/OKです/)).toBeVisible();
  await shot(page, "renraku-contact-kana-02-ok");
});
