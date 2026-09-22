import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot, submitAnswers, writeFillinIn } from "./helpers";

/**
 * 連絡文の 練習（メール・Slack）— **こたえの チェックで 1問ずつ 開く**
 *
 * 2026-09-21 の 指定:
 *  「AIに見てもらう→こたえのチェック」
 *  「入力項目に直接エラーメッセージのように正解不正解と、項目ごとにその下に
 *   何が良かったか（正解時）何がだめなのか（不正解時）書いて」
 *  「終わらない限り次の問題に進んではいけないとわかるようにUIを作ってください」
 *  「全てAIがOKなら提出できます」
 *  「模範解答は答え合わせの時だけでいいです」
 *
 * 見張るのは 6つ:
 *  1. 古い URL（`/renraku/link-renraku_contact`）が もんだいへ 送られる
 *  2. 別ページ（iframe）では なく、10問が 1ページに 並ぶ（初級・上級は **別の 教材**）
 *  3. **答える 前に お手本も 観点も 出さない**（写せない）
 *  4. 欄の となりに ⭕✗が 出る。**⭕に なるまで つぎの もんだいは 閉じて いる**
 *  5. ぜんぶ ⭕に なるまで「こたえを 出す」が 出ない
 *  6. お手本（模範解答）は **答え合わせの ときだけ**——Slack（上級）にも 出る
 *
 * AIの 返事その ものは ここでは 見ない（鍵と 通信が 要る。`*.ai.spec.ts` の 決めごと）。
 * 鍵ゼロの この 通し検証では、**欄に 正解の ある メールは アプリの ⭕✗で 開き**、
 * **書けば よい Slackは 書けて いれば 開く**——鍵の 無い 端末で 学習が 止まらない こと
 * その ものが ここの 検査に なる。
 */

const QUIZ = "renraku_contact_quiz";
const SLACK_QUIZ = "renraku_contact_slack_quiz";
const PATH = `/renraku/quiz-${QUIZ}`;
const SLACK_PATH = `/renraku/quiz-${SLACK_QUIZ}`;

type Head = { kind: "fixed"; text: string } | { kind: "write"; label: string; answer: string };
type Mail = {
  id: string;
  type: "fillin";
  head: Head[];
  blanks: { label: string; answer: string }[];
};
type Slack = { id: string; type: "free"; minLength: number };
type Question = Mail | Slack;

function questionsOf(id: string): Question[] {
  return (
    JSON.parse(readFileSync(join("content", "quizsets", `${id}.json`), "utf8")) as {
      questions: Question[];
    }
  ).questions;
}
const QUESTIONS = questionsOf(QUIZ);
const SLACK_QUESTIONS = questionsOf(SLACK_QUIZ);

/** その もんだいの 欄に **正解を そのまま** 書く（⭕を 通して つぎを 開く ため）。 */
async function fillRight(page: Page, mail: Mail) {
  const values: Record<string, string> = {};
  for (const row of mail.head) if (row.kind === "write") values[row.label] = row.answer;
  for (const blank of mail.blanks) values[blank.label] = blank.answer;
  await writeFillinIn(page, mail.id, values);
}

/** 1問を ⭕に して つぎを 開く。 */
async function passOne(page: Page, question: Question) {
  const box = page.locator(`#q-${question.id}`);
  if (question.type === "fillin") {
    await fillRight(page, question);
  } else {
    await box.getByLabel("じゆうに 書く").fill("お疲れさまです。".padEnd(question.minLength, "あ"));
  }
  await box.getByRole("button", { name: /こたえの チェック/ }).click();
  // ルビが 語の 中に 入る（「次つぎの」）ので、ふりがなの 入らない ところで さがす
  await expect(box.getByText(/OKです/)).toBeVisible();
}

/**
 * ステージ クリアの 板を 閉じる。
 *
 * この 教材は **関門では ない**（元の 別ページと 同じ `gates: false`）ので、
 * 前の 7本を 終えた 時点で ステージは クリア扱いに なる。開いた 瞬間に
 * お祝いの 板が 出るのは 差し替え前と 同じ 動き——ここでは 閉じて 先へ 進む。
 */
async function closeClearDialog(page: Page, { first = true } = {}) {
  const stay = page.getByRole("button", { name: "ここに のこる" });
  if (!first) {
    /*
     * **2回目からは 出ない**。板は「この 画面を 開いた 時点で もう クリア済みか」を
     * 見て いて（`clearedOnArrival`）、1回目に 付いた 印で 2回目は 黙る。
     * それでも 出た ときの ために、待たずに 押すだけ 試す。
     */
    await stay.click({ timeout: 2_000 }).catch(() => undefined);
    return;
  }
  /*
   * 板は **進み具合を 読んだ あと**に 出る（`celebrating` は 画面の 側の 状態）。
   * 開いた 瞬間に 数えると まだ 0件で、その あと 出て きた 板が
   * 「はじめる」の クリックを 受け止めて しまう——待ってから 閉じる。
   */
  await expect(stay).toBeVisible({ timeout: 15_000 });
  await stay.click();
  await expect(page.getByRole("dialog", { name: "ステージ クリア" })).toHaveCount(0);
}

async function seedUpToQuiz(context: BrowserContext, ref: string = QUIZ) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "renraku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((content) => content.ref === ref);
  expect(at, `連絡ステージに ${ref} が 無い`).toBeGreaterThan(0);
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

test("連絡文: 1問ずつ ⭕に して 進み、ぜんぶ ⭕で 出せる", async ({ page, context }) => {
  test.slow(); // 10問を 順に ⭕に する 通し
  await seedUpToQuiz(context);
  await page.goto(PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  /* 2. 初級の 10問が 同時に 見えて いる。別ページ（iframe）は もう 無い。 */
  await expect(page.getByText("1/10", { exact: true })).toBeVisible();
  await expect(page.getByText("10/10", { exact: true })).toBeVisible();
  // 上級（Slack）は この 教材には もう 無い（2026-09-21 の 指定で 分けた）
  await expect(page.locator("#q-slack_1")).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);

  /* 3. 同僚の メモと メールの 型が 出て いる。しるしは 第1問に ある。 */
  const first = page.locator("#q-mail_1");
  await expect(first.getByText("💬")).toBeVisible();
  await expect(first.locator("mark").first()).toBeVisible();
  await expect(first.getByText("📧 メール作成")).toBeVisible();
  // ルビが 語の 中に 入る（「重要じゅうよう」）ので、ふりがなの 入らない ところで さがす
  await expect(first.getByText(/システムエラーに ついて/)).toBeVisible();

  /* 3. 答える 前に お手本も 観点も 出さない（写せない）。ボタンも まだ 押せない。 */
  const ask = first.getByRole("button", { name: /こたえの チェック/ });
  await expect(ask).toBeDisabled();
  await expect(page.getByText(/模範解答/)).toHaveCount(0);
  await expect(page.getByText(/AIが 見る ところ/)).toHaveCount(0);

  /* 4. つぎの もんだいは 閉じて いて、その 理由が 書いて ある。 */
  const second = page.locator("#q-mail_2");
  await expect(second.getByText(/もんだいが ⭕に なると/)).toBeVisible();
  // たたんで ある（欄その ものが 無い）。行は 残る ので「あと 何問」は 見える
  await expect(second.getByLabel("宛先を 入力する")).toHaveCount(0);
  await expect(second.getByText("2/10", { exact: true })).toBeVisible();

  /* 5. ぜんぶ ⭕に なるまで「こたえを 出す」は 出ない。 */
  await expect(page.getByRole("button", { name: /こたえを 出/ })).toHaveCount(0);
  await expect(page.getByText(/ぜんぶ ⭕に なると/)).toBeVisible();
  await shot(page, "renraku-contact-quiz-01-locked");

  /* 4. 欄を まちがえて 書くと、その 欄の となりに ✗が 出る（ページの 上では ない）。 */
  await writeFillinIn(page, "mail_1", {
    宛先: "システム管理部の 佐藤さん",
    問題: "こわれた",
    原因: "サーバーの エラー",
    直る予定: "今日の 15:00",
  });
  await expect(ask).toBeEnabled();
  await ask.click();
  await expect(first.getByText("✗ なおす").first()).toBeVisible();
  await expect(first.getByText(/なおす ところが/)).toBeVisible();
  // まちがえても 正解は 出さない（答え合わせまで 見せない）
  await expect(page.getByText(/模範解答/)).toHaveCount(0);
  // 閉じた ままで、つぎへは 進めない
  await expect(second.getByLabel("宛先を 入力する")).toHaveCount(0);
  await shot(page, "renraku-contact-quiz-02-naosu");

  /* 4. 直して もう いちど 押すと ⭕。つぎの もんだいが 開く。 */
  await writeFillinIn(page, "mail_1", { 問題: "ログインできない" });
  await ask.click();
  await expect(first.getByText(/OKです/)).toBeVisible();
  await expect(second.getByLabel("宛先を 入力する")).toBeEnabled();
  await shot(page, "renraku-contact-quiz-03-ok");

  /* 5. のこりを ぜんぶ ⭕に すると「こたえを 出す」が 出る。 */
  for (const question of QUESTIONS.slice(1)) await passOne(page, question);
  const submit = page.getByRole("button", { name: /こたえを 出/ });
  await expect(submit).toBeVisible();
  await expect(page.getByText(/ぜんぶ ⭕に なりました/)).toBeVisible();

  /* 6. 答え合わせで はじめて お手本が 出る——Slack（上級）にも。 */
  await submitAnswers(page);
  await expect(page.getByText(/できた|もう一度/).first()).toBeVisible();
  await expect(page.getByText(/模範解答/).first()).toBeVisible();
  await shot(page, "renraku-contact-quiz-04-result");
});

test("連絡文: 学習者の 幅（390px）で 読めて、裸の 漢字が 無い", async ({ page, context }) => {
  await seedUpToQuiz(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  await expect(page.locator("#q-mail_1")).toBeVisible();
  // 横に はみ出さない（メールの 型は 欄が 多い）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, "renraku-contact-quiz-05-390");

  /* 画面の 漢字は ぜんぶ ふりがな つき（規律2）。 */
  expect(await bareKanjiTexts(page)).toEqual([]);
});

test("連絡文: 欄を 2つだけ 書いて 開き直しても 消えない", async ({ page, context }) => {
  /*
   * メールの 型は **欄が ぜんぶ うまって はじめて「こたえた」**。保存を その ものさしで
   * 決めて いた ころは、2欄だけ 書いて 開き直すと **書いた ものが ぜんぶ 消えて いた**
   *（2026-09-20 の 通しプレイ検収）。はじめの 画面は「行き来しても 消えません」と
   * 言って いる ので、言った とおりに 動く ことを ここで 固定する。
   */
  await seedUpToQuiz(context);
  await page.goto(PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  await writeFillinIn(page, "mail_1", {
    宛先: "システム管理部の 佐藤さん",
    問題: "ログインできない",
  });
  await expect(page.locator("#q-mail_1").getByLabel("宛先を 入力する")).toHaveValue(
    "システム管理部の 佐藤さん",
  );

  await page.reload();
  await closeClearDialog(page, { first: false });
  // しおりが あれば「つづきから」、無ければ「はじめる」——どちらでも 中へ 入る
  const resume = page.getByRole("button", { name: /つづきから/ });
  await ((await resume.count()) > 0
    ? resume.click()
    : page.getByRole("button", { name: "はじめる" }).click());

  const first = page.locator("#q-mail_1");
  await expect(first.getByLabel("宛先を 入力する")).toHaveValue("システム管理部の 佐藤さん");
  await expect(first.getByLabel("問題を 入力する")).toHaveValue("ログインできない");
});

test("連絡文: ⭕に した ところは 開き直しても 開いた まま", async ({ page, context }) => {
  /*
   * 関門を 付けた 日に いちばん こわいのは **やり直しの 強制**——開き直す たびに
   * 1問目から 見て もらい直しに なると、10問の 教材は 終わらない。
   * ⭕は 文と セットで 端末に 残す（`resume.checked`）。
   */
  await seedUpToQuiz(context);
  await page.goto(PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  await passOne(page, QUESTIONS[0]!);
  await expect(page.locator("#q-mail_2").getByLabel("宛先を 入力する")).toBeEnabled();

  await page.reload();
  await closeClearDialog(page, { first: false });
  const resume = page.getByRole("button", { name: /つづきから/ });
  await ((await resume.count()) > 0
    ? resume.click()
    : page.getByRole("button", { name: "はじめる" }).click());

  await expect(page.locator("#q-mail_2").getByLabel("宛先を 入力する")).toBeEnabled();
  await expect(page.locator("#q-mail_3").getByLabel("宛先を 入力する")).toHaveCount(0);
});

/**
 * 上級（Slack）は **別の 教材**（2026-09-21 の 指定「上級は別な教材として分けてください」）。
 *
 * 元の 別ページも 初級／上級の **タブ 2つ**だったので、その 形に 戻した ことに なる。
 * 見るのは 3つ:
 *  1. 初級とは 別の URL で 開き、10問が 並ぶ（メールの 型は 1つも 無い）
 *  2. 関門は こちらでも 効く（書いて チェックすると つぎが 開く）
 *  3. お手本は 答え合わせだけ
 */
test("連絡文（上級）: 別の 教材として 開き、書いて 進み、答え合わせで お手本が 出る", async ({
  page,
  context,
}) => {
  test.slow();
  await seedUpToQuiz(context, SLACK_QUIZ);
  await page.goto(SLACK_PATH);
  await closeClearDialog(page);
  await page.getByRole("button", { name: "はじめる" }).click();

  /* 1. 上級だけの 10問。メールの 型（宛先の 欄）は 1つも 無い。 */
  await expect(page.getByText("1/10", { exact: true })).toBeVisible();
  await expect(page.getByText("10/10", { exact: true })).toBeVisible();
  await expect(page.getByLabel("宛先を 入力する")).toHaveCount(0);
  await expect(page.locator("#q-mail_1")).toHaveCount(0);
  // 解いて いる 途中に お手本は 出さない
  await expect(page.getByText(/模範解答/)).toHaveCount(0);

  /* 2. 2問目は 閉じて いる。1問目を ⭕に すると 開く。 */
  const second = page.locator(`#q-${SLACK_QUESTIONS[1]!.id}`);
  await expect(second.getByText(/もんだいが ⭕に なると/)).toBeVisible();
  await passOne(page, SLACK_QUESTIONS[0]!);
  await expect(second.getByLabel("じゆうに 書く")).toBeEnabled();
  await shot(page, "renraku-slack-quiz-01-ok");

  /* 3. ぜんぶ ⭕に して 出すと、答え合わせで はじめて お手本が 出る。 */
  for (const question of SLACK_QUESTIONS.slice(1)) await passOne(page, question);
  await submitAnswers(page);
  await expect(page.getByText(/模範解答/).first()).toBeVisible();
  await shot(page, "renraku-slack-quiz-02-result");
});
