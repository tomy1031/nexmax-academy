import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
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

test("もんだい: こたえを 見た あと 開き直して「はじめる」から 全問 正解しても パーフェクトに ならない", async ({
  page,
  context,
}) => {
  await seedBefore(context, QUIZ);
  await page.goto(`/${STAGE}/quiz-${QUIZ}`);
  await page.getByRole("button", { name: "はじめる" }).click();
  const answers = quizAnswers();
  // 1回目は 白紙に 近い まま 出して、けっかの 画面で こたえを 見る
  await answerQuiz(
    page,
    answers.map((at) => (at + 1) % 2),
  );
  await expect(page.locator('[data-certificate="ready"]')).toBeVisible();

  // 開き直して はじめから（端末の 印が「前に こたえを 見た」を 覚えて いる）
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).click();
  await answerQuiz(page, answers);
  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toHaveAttribute("data-perfect", "false");
  await expect(page.locator('[data-certificate="reasons"]')).toContainText("やりなおし");
});

test("もんだい: 発行の 途中で 閉じた 回は、次に 開くと「もう一度 ためす」から 出し直せる", async ({
  page,
  context,
}) => {
  await seedBefore(context, QUIZ);
  const total = quizAnswers().length;
  await context.addInitScript(
    ([key, total]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          startedAt: "2026-10-06T05:00:00.000Z",
          pending: {
            attemptId: "00000000-0000-4000-8000-000000000001",
            result: {
              kind: "quizset",
              contentId: "houkoku_kanryou_quiz",
              title: "作業完了の 報告の もんだい",
              perfect: true,
              score: total,
              maxScore: total,
              misses: 0,
              detail: { questions: total, percent: 100, passed: true },
            },
          },
        }),
      );
    },
    [`nexmax.cert-run.v1:${QUIZ}`, total] as const,
  );
  await page.goto(`/${STAGE}/quiz-${QUIZ}`);
  await expect(page.locator('[data-certificate="error"]')).toBeVisible();
  await page.getByRole("button", { name: /ためす/ }).click();
  const cert = page.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-perfect", "true");
});

/* ---- 第2段: 単語テスト（2026-10-06 の 回答「何回目でも満点なら金」） ---- */

/** 8語の 小さな セット（`kotoba_marubatsu.spec.ts` と 同じ）。 */
const WORD_SET = "hajimari_kotoba";

/** 遊べる ことば（対訳の 1語と 誤答3つが そろった 語。アプリの `gameWordsOf` と 同じ 条件）。 */
const WORDS: readonly { term: string; reading: string; meaning: string; wrong: string }[] = (() => {
  const set = JSON.parse(
    readFileSync(join("content", "wordstages", `${WORD_SET}.json`), "utf8"),
  ) as { wordIds: string[] };
  const vocab = JSON.parse(readFileSync(join("content", "vocab", "vocabulary.json"), "utf8")) as {
    words: {
      id: string;
      term: string;
      reading: string;
      englishTerm?: string;
      wrongMeanings?: string[];
    }[];
  };
  const byId = new Map(vocab.words.map((word) => [word.id, word]));
  return set.wordIds.flatMap((id) => {
    const word = byId.get(id);
    if (!word?.englishTerm || word.wrongMeanings?.length !== 3) return [];
    return [
      {
        term: word.term,
        reading: word.reading,
        meaning: word.englishTerm,
        wrong: word.wrongMeanings[0]!,
      },
    ];
  });
})();

/**
 * テストを 最後まで 通す。よみの あいだ ことばは 3D の 中にしか 無い（DOM で 読めない）ので、
 * **セットの よみを 順に 打つ**——外しても 時間まで 何度でも 打ち直せる（kotoba_marubatsu.spec.ts）。
 * 4択では 画面の 用語（`ruby.mcq-term`）から こたえを 引く。
 */
/** `locator` が `ms` の うちに 見えたか（`isVisible` は 待たない ので 使わない）。 */
async function visibleWithin(locator: Locator, ms: number): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true)
    .catch(() => false);
}

async function playWordTest(page: Page, missMeanings: number) {
  const result = page.getByRole("heading", { name: /^(合格|不合格)$/ });
  const reading = page.getByLabel("よみを ひらがなで 入力する");
  const choices = page.getByRole("group", { name: "いみの こたえ" });
  const next = reading.or(choices).or(result);
  let missed = 0;
  for (let step = 0; step < 40; step += 1) {
    // つぎに 出る ものを 待つ（よみの 欄・4択・けっか の どれか）
    await next.first().waitFor({ state: "visible", timeout: 20_000 });
    if (await result.isVisible()) return;
    if (await reading.isVisible()) {
      for (const word of WORDS) {
        const typed = await reading
          .fill(word.reading, { timeout: 2_000 })
          .then(() => reading.press("Enter", { timeout: 2_000 }))
          .then(() => true)
          .catch(() => false);
        if (!typed) break;
        // 当たれば 4択に 進む。外れたら 欄が 空に なって 打ち直せる
        if (await visibleWithin(choices, 400)) break;
      }
      continue;
    }
    if (await visibleWithin(choices, 1_000)) {
      const term = await page
        .locator("ruby.mcq-term")
        .first()
        .evaluate((el) =>
          [...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join(""),
        );
      const word = WORDS.find((w) => w.term === term);
      if (!word) throw new Error(`こたえ表に ない ことば: ${term}`);
      const pick = missed < missMeanings ? word.wrong : word.meaning;
      if (pick === word.wrong) missed += 1;
      await choices.getByRole("button", { name: pick, exact: true }).click({ timeout: 5_000 });
      // 解説カードを 押して つぎへ（自動送りと 競走する ので、押せなくても よい）
      await page
        .getByRole("button", { name: /おす／Enter で つぎへ/ })
        .click({ timeout: 3_000 })
        .catch(() => {});
    }
  }
  await expect(result).toBeVisible({ timeout: 20_000 });
}

async function startWordTest(page: Page) {
  await page.goto(`/wordtest/${WORD_SET}`);
  await page
    .getByRole("button", { name: /テスト/ })
    .first()
    .click();
  const check = page.getByLabel("ひらがなで 入力する");
  for (const word of ["あいうえお", "ようけんていぎ"]) {
    await check.click();
    await check.fill(word);
    await page.keyboard.press("Enter");
  }
}

test.describe("単語テスト", () => {
  // 指の きかい（ふつうの 入力欄）に して、よみを ひらがなで そのまま 入れる
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("テストを 満点で 終えると パーフェクトの 修了証が 出る", async ({ page }) => {
    await startWordTest(page);
    await playWordTest(page, 0);
    const cert = page.locator('[data-certificate="ready"]');
    await expect(cert).toBeVisible();
    await expect(cert).toHaveAttribute("data-perfect", "true");
    await expect(page.locator('[data-certificate="badge"]')).toHaveText("★ PERFECT");
    expect(await bareKanjiIn(page, '[data-certificate="ready"]')).toEqual([]);
    await cert.scrollIntoViewIfNeeded();
    await shot(page, "certificate-wordtest-perfect-390");
  });

  test("まちがえると 青。「まちがえた ことばだけ」で 満点でも パーフェクトに ならない", async ({
    page,
  }) => {
    await startWordTest(page);
    await playWordTest(page, 1);
    const cert = page.locator('[data-certificate="ready"]');
    await expect(cert).toHaveAttribute("data-perfect", "false");
    await expect(page.locator('[data-certificate="reasons"]')).toContainText("1つ");
    await cert.scrollIntoViewIfNeeded();
    await shot(page, "certificate-wordtest-not-perfect-390");

    await page.getByRole("button", { name: "まちがえた ことばだけ" }).click();
    await expect(cert).toHaveCount(0);
    await playWordTest(page, 0);
    await expect(cert).toHaveAttribute("data-perfect", "false");
    await expect(page.locator('[data-certificate="reasons"]')).toContainText("ことばだけ");
  });

  test("もんだいだけ では 修了証を 出さない（テストでは ない）", async ({ page }) => {
    await page.goto(`/wordtest/${WORD_SET}`);
    await page.getByRole("button", { name: /もんだいだけ/ }).click();
    await playWordTest(page, 0);
    await expect(page.locator("[data-certificate]")).toHaveCount(0);
  });
});
