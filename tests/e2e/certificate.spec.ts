import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  bareKanjiTexts,
  choiceButtons,
  goNext,
  goToConfirm,
  seedCompleted,
  shot,
  submitAnswers,
} from "./helpers";

/**
 * 修了証（2026-10-06 の 指定・願い #562）
 *
 * 1. タイピングを 最後まで 終えると、その 瞬間に パーフェクト（金）の 修了証が 出る
 * 2. ❌ が あっても パーフェクト（❌ では 分けない。数は 成績に 出す。同日の 指定
 *    「間違いがないよりもちゃんと終わらせることが大切」）
 * 3. リスニングで 原稿を 100% 開いた 瞬間に 修了証が 出る（こたえあわせの 前・あいことば なし＝パーフェクト）
 * 4. 「画像で 保存」で PNG が 落ちる（ファイル名に 教材ID と ICT の 時刻）
 *
 * デモモード（鍵ゼロ）は ログインが 無いので **見本**（番号なし・「正式では ない」）に なる。
 * 正式な 発行（DB が 時刻・名前・番号を 押す）は 移行SQLと RLS で 決まる ので、ここでは 見ない。
 */

const STAGE = "houkoku-kiku";

/**
 * 修了証の 中だけの 裸の 漢字（`bareKanjiTexts` を 修了証の わくに 絞った もの）。
 * リスニングの 画面には 前から ある 部品の 文（聞き取りの 入力欄の 案内）と 学習者が 打った
 * ことばが 出る ので、この 検査は 修了証の 中に 絞る。
 */
async function bareKanjiIn(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluate((root) => {
    const KANJI = /[々一-鿿]/;
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue ?? "";
      if (!KANJI.test(text)) continue;
      let element = node.parentElement;
      let covered = false;
      while (element && element !== root.parentElement) {
        if (element.tagName === "RUBY") {
          covered = true;
          break;
        }
        element = element.parentElement;
      }
      if (!covered) found.push(text.trim());
    }
    return [...new Set(found)];
  });
}

function stageRefs(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  return stage.contents.map((item) => item.ref);
}

async function seedBefore(context: BrowserContext, ref: string) {
  const all = stageRefs();
  await seedCompleted(context, all.slice(0, all.indexOf(ref)));
}

const TYPING = "houkoku_kanryou_typing";

function sentences(): { text: string }[] {
  return JSON.parse(readFileSync(join("content", "typing", `${TYPING}.json`), "utf8")).sentences;
}

async function typeAndJudge(page: Page, text: string) {
  await page.getByLabel("お手本と 同じ 文を 入力する").fill(text);
  await page.getByRole("button", { name: "判定", exact: true }).click();
}

async function finishTyping(page: Page, missFirst: boolean) {
  const list = sentences();
  for (const [i, sentence] of list.entries()) {
    if (i === 0 && missFirst) {
      await typeAndJudge(page, "あいうえお");
      await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "false");
    }
    await typeAndJudge(page, sentence.text);
    await expect(page.locator('[data-typing="verdict"]')).toHaveAttribute("data-ok", "true");
    if (i < list.length - 1) await page.getByRole("button", { name: "つぎの 文へ" }).click();
  }
}

test("タイピング: 最後まで 終えると パーフェクトの 修了証（見本）が 出て、画像で 保存できる", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedBefore(context, TYPING);
  await page.goto(`/${STAGE}/typing-${TYPING}`);
  await finishTyping(page, false);

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "true");
  await expect(cert).toHaveAttribute("data-official", "false");
  await expect(page.locator('[data-certificate="badge"]')).toHaveText("★ PERFECT");
  await expect(page.locator('[data-certificate="sample"]')).toBeVisible();
  await expect(page.locator('[data-certificate="time"]')).toContainText("（ICT）");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-typing-perfect-390");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "修了証を 画像で 保存" }).click();
  expect((await download).suggestedFilename()).toMatch(
    new RegExp(`^nexmax-certificate_${TYPING}_\\d{8}-\\d{4}\\.png$`),
  );
  // 画像そのものも 画面写真と 一緒に 残す（目で 見る ため）
  await (await download).saveAs("e2e-screens/certificate-typing-perfect.png");
});

test("タイピング: ❌ が あっても 最後まで 終えれば パーフェクト（❌ の 回数は 成績に 出す）", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedBefore(context, TYPING);
  await page.goto(`/${STAGE}/typing-${TYPING}`);
  await finishTyping(page, true);

  const total = sentences().length;
  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toHaveAttribute("data-perfect", "true");
  await expect(page.locator('[data-certificate="badge"]')).toHaveText("★ PERFECT");
  await expect(page.locator('[data-certificate="reasons"]')).toHaveCount(0);
  const valueOf = (label: string) =>
    cert.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
  await expect(valueOf("❌")).toContainText("1回");
  await expect(valueOf("正解")).toContainText(`${total - 1} / ${total}`);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-typing-with-miss-390");
});

test("リスニング: 原稿を 100% 開いた 瞬間に 修了証が 出る（こたえあわせの 前・あいことば なし）", async ({
  page,
  context,
}) => {
  const listening = "houkoku_shougai_listening";
  const script: { text: string }[] = JSON.parse(
    readFileSync(join("content", "listening", `${listening}.json`), "utf8"),
  ).script;
  const lines = script.map((line) => line.text);
  await seedBefore(context, listening);
  /*
   * 最後の 1行の 手前まで 当てた ところから 始める（ぜんぶ 打つと 長い）。
   * **この 端末で 始めた 回の 記録も 置く**——記録が 無い まま 原稿が 途中まで 開いて いると
   * 「前の 回の 続き」と 見て パーフェクトに しない（それは 下の テストで 見る）。
   */
  await context.addInitScript(
    ([key, inputs, runKey]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({ inputs, revealPercent: 90, keywordsLeft: 0 }),
      );
      window.localStorage.setItem(
        runKey as string,
        JSON.stringify({ startedAt: new Date().toISOString(), misses: 0 }),
      );
    },
    [
      `nexmax:v1:listening:${listening}`,
      lines.slice(0, -1),
      `nexmax.cert-run.v1:${listening}`,
    ] as const,
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/${STAGE}/listening-${listening}`);
  await page.getByRole("button", { name: "はじめる" }).click();
  await expect(page.locator('[data-certificate="ready"]')).toHaveCount(0);

  const input = page.getByLabel("聞こえた ことばを 入力する");
  await input.fill(lines.at(-1)!);
  await input.press("Enter");

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "true");
  expect(await bareKanjiIn(page, '[data-certificate="ready"]')).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-listening-perfect-390");
});

test("リスニング: 100%の 前に こたえあわせを 見て 戻ると、パーフェクトに ならない。貼り付けも できない", async ({
  page,
  context,
}) => {
  const listening = "houkoku_shougai_listening";
  const lines: string[] = JSON.parse(
    readFileSync(join("content", "listening", `${listening}.json`), "utf8"),
  ).script.map((line: { text: string }) => line.text);
  await seedBefore(context, listening);
  await context.addInitScript(
    ([key, inputs]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({ inputs, revealPercent: 90, keywordsLeft: 0 }),
      );
    },
    [`nexmax:v1:listening:${listening}`, lines.slice(0, -1)] as const,
  );
  await page.goto(`/${STAGE}/listening-${listening}`);
  await page.getByRole("button", { name: "はじめる" }).click();

  // 貼り付けは 止める（原稿を 写して 貼れば 100% に できて しまう）
  const input = page.getByLabel("聞こえた ことばを 入力する");
  await input.focus();
  const prevented = await input.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  }, lines.at(-1)!);
  expect(prevented).toBe(true);
  await expect(page.locator('[data-listening="paste"]')).toBeVisible();

  // 100% の 前に こたえあわせへ → もういちど 聞く → 最後の 行を 打つ
  await page.getByRole("button", { name: /こたえあわせに すすむ/ }).click();
  await page.getByRole("button", { name: /もういちど/ }).click();
  await page.getByLabel("聞こえた ことばを 入力する").fill(lines.at(-1)!);
  await page.getByLabel("聞こえた ことばを 入力する").press("Enter");

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(page.locator('[data-certificate="reasons"]')).toContainText("こたえあわせ");
});

/* ---- 第2段: もんだい（2026-10-06 の 回答「満点」） ---- */

const QUIZ = "houkoku_kanryou_quiz";

function quizAnswers(): number[] {
  return JSON.parse(
    readFileSync(join("content", "quizsets", `${QUIZ}.json`), "utf8"),
  ).questions.map((q: { answer: number }) => q.answer);
}

/** 1問ずつ えらんで（まとめて 出す）、さいごに 出す。 */
async function answerQuiz(page: Page, picks: readonly number[]) {
  for (const [i, at] of picks.entries()) {
    await choiceButtons(page).nth(at).click();
    if (i < picks.length - 1) await goNext(page);
    else await goToConfirm(page);
  }
  await submitAnswers(page);
}

test("もんだい: 全問 正解で 出すと パーフェクト。「もう一度」は こたえを 見た あとの やりなおし", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedBefore(context, QUIZ);
  await page.goto(`/${STAGE}/quiz-${QUIZ}`);
  await page.getByRole("button", { name: "はじめる" }).click();
  const answers = quizAnswers();
  await answerQuiz(page, answers);

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "true");
  await expect(page.locator('[data-certificate="badge"]')).toHaveText("★ PERFECT");
  await expect(cert).toContainText(`${answers.length} / ${answers.length}`);
  expect(await bareKanjiIn(page, '[data-certificate="ready"]')).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-quiz-perfect-390");

  // けっかの 画面で こたえを 見た → 「もう一度」は 満点でも パーフェクトに しない
  await page.getByRole("button", { name: "もう一度 やる" }).click();
  await expect(page.locator('[data-certificate="ready"]')).toHaveCount(0);
  for (let i = 0; i < answers.length - 1; i++) await goNext(page);
  await goToConfirm(page);
  await submitAnswers(page);
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(page.locator('[data-certificate="reasons"]')).toContainText("やりなおし");
});

test("もんだい: 1問 まちがえると パーフェクトで ない（まちがえた 数と 合否を 書く）", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await seedBefore(context, QUIZ);
  await page.goto(`/${STAGE}/quiz-${QUIZ}`);
  await page.getByRole("button", { name: "はじめる" }).click();
  const answers = quizAnswers();
  // 1問目だけ ちがう 選択肢を えらぶ
  await answerQuiz(page, [(answers[0]! + 1) % 2, ...answers.slice(1)]);

  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(page.locator('[data-certificate="reasons"]')).toContainText("1問");
  await expect(cert).toContainText(`${answers.length - 1} / ${answers.length}`);
  expect(await bareKanjiIn(page, '[data-certificate="ready"]')).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "certificate-quiz-not-perfect-390");
});
