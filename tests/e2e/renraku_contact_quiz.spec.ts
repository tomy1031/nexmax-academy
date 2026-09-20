import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot, submitAnswers, writeFillinIn } from "./helpers";

/**
 * 連絡文の 練習（メール・Slack）— **いつもの もんだい（全問1ページ）＋ AIの 見かた**
 *
 * 2026-09-20 の 指定「gemini-live による AIテキスト採点を 入れて」「別ページで 開くのでは
 * なく、問題コンポーネントとして」「AIが 評価する ボタンは 各問題に 設置し、模範解答の
 * 表示だけでなく、入力された 文章を ベースにした ブラッシュアップ回答も 見やすく」。
 *
 * 見張るのは 5つ:
 *  1. 古い URL（`/renraku/link-renraku_contact`）が もんだいへ 送られる
 *  2. 別ページ（iframe）では なく、20問が 1ページに 並ぶ
 *  3. メールの 型（宛先・件名・【 】）が 出て、打てる
 *  4. **AIの ボタンは 問いごと**に あり、書く 前は 押せない
 *  5. 鍵が 無い 端末でも 止まらない——押せば 理由を 言い、**お手本は 出す**
 *
 * AIの 返事その ものは ここでは 見ない（鍵と 通信が 要る。`*.ai.spec.ts` の 決めごと）。
 */

const QUIZ = "renraku_contact_quiz";
const PATH = `/renraku/quiz-${QUIZ}`;

async function seedUpToQuiz(context: BrowserContext) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((content) => content.ref === QUIZ);
  expect(at, "連絡ステージに 連絡文の もんだいが 無い").toBeGreaterThan(0);
  await seedCompleted(
    context,
    stage.contents.slice(0, at).map((content) => content.ref),
  );
}

test("連絡文: 古い 別ページの URL は もんだいへ 送る", async ({ page, context }) => {
  await seedUpToQuiz(context);
  await page.goto("/renraku/link-renraku_contact");
  await expect(page).toHaveURL(new RegExp(`${PATH}$`));
});

test("連絡文: 20問が 1ページに 出て、メールの 型を 打てて、出せる", async ({ page, context }) => {
  await seedUpToQuiz(context);
  await page.goto(PATH);
  await page.getByRole("button", { name: "はじめる" }).click();

  /* 2. 20問が 同時に 見えて いる。別ページ（iframe）は もう 無い。 */
  await expect(page.getByText("1/20", { exact: true })).toBeVisible();
  await expect(page.getByText("20/20", { exact: true })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  /* 3. 同僚の メモと メールの 型が 出て いる。しるしは 第1問に ある。 */
  const first = page.locator("#q-mail_1");
  await expect(first.getByText("💬")).toBeVisible();
  await expect(first.locator("mark").first()).toBeVisible();
  await expect(first.getByText("📧 メール作成")).toBeVisible();
  await expect(first.getByText(/【重要】システムエラー/)).toBeVisible();

  /* 4. 書く 前は AIの ボタンが 押せない（お手本を 先に 見せない ため）。 */
  const ask = first.getByRole("button", { name: /AIに 見/ });
  await expect(ask).toBeDisabled();
  await expect(first.getByRole("button", { name: /お手本/ })).toHaveCount(0);
  // ものさし（観点）は 答える 前から 見えて いる
  await expect(first.getByText(/AIが 見る ところ/)).toBeVisible();

  await writeFillinIn(page, "mail_1", {
    宛先: "システム管理部の 佐藤さん",
    問題: "ログインできない",
    原因: "サーバーの エラー",
    直る予定: "今日の 15:00",
  });
  await expect(ask).toBeEnabled();
  await shot(page, "renraku-contact-quiz-01-mail");

  /*
   * 5. 鍵の 無い 端末（この 通し検証は 鍵ゼロ）。押すと 理由を 言い、お手本を 出す。
   *    ——AIが 無くても 学習者は 手ぶらに ならない。
   */
  await ask.click();
  await expect(first.getByText(/AIの せっていが まだです/)).toBeVisible();
  await expect(first.getByText(/模範解答/)).toBeVisible();
  await expect(first.getByText("【原因】サーバーの エラー")).toBeVisible();
  await shot(page, "renraku-contact-quiz-02-model-answer");

  /* Slackの 問いにも 同じ ボタンが ある（問いごとに 1つ）。 */
  const slack = page.locator("#q-slack_1");
  await expect(slack.getByRole("button", { name: /AIに 見/ })).toBeDisabled();
  await slack.getByLabel("じゆうに 書く").fill("テストの URLが かわりました。");
  await expect(slack.getByRole("button", { name: /AIに 見/ })).toBeEnabled();

  /* 出せば 答え合わせ。まちがえた 欄だけ 正しい ことばが となりに 出る。 */
  await submitAnswers(page);
  await expect(page.getByText(/できた|もう一度/).first()).toBeVisible();
  await shot(page, "renraku-contact-quiz-03-result");
});

test("連絡文: 学習者の 幅（390px）で 読めて、裸の 漢字が 無い", async ({ page, context }) => {
  await seedUpToQuiz(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PATH);
  await page.getByRole("button", { name: "はじめる" }).click();

  await expect(page.locator("#q-mail_1")).toBeVisible();
  // 横に はみ出さない（メールの 型は 欄が 多い）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "renraku-contact-quiz-04-390");

  /* 画面の 漢字は ぜんぶ ふりがな つき（規律2）。 */
  expect(await bareKanjiTexts(page)).toEqual([]);
});
