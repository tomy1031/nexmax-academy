import { expect, test, type Locator, type Page } from "@playwright/test";
import { shot } from "./helpers";

/**
 * Renraku Master（連絡ステージの Slack の 練習・public/tools/hourensou/renraku_slack.html）の 正誤の 見せ方
 *
 * 2026-10-30 の 指定「正解不正解が分かりにくいので、もう少し間違いを強調したり、
 * 次のクリックをするのに間を置けるように」。前は 正解を 押すと 何も 出さずに 次の 問いへ 切り替わり、
 * 次の 問いの 選択肢が 同じ 場所に 出るので 続けて 押して しまって いた。見張るのは:
 *  1. まちがえた 選択肢に ❌ 不正解 と わけが 出て、点が 減る。ほかの 選択肢は 少しの あいだ 押せない
 *  2. 正解の 選択肢に ⭕ 正解 と わけが 出て、**「次へ」を 押すまで 次の 問いに 進まない**
 *  3. 「次へ」を 待って いる あいだに 開き直すと、次の 問いから（正解の 行は 下書きに 残る）
 *  4. 文の 中の URL は 青い 字（リンクには しない。パスは 青く しない）
 *  5. 100点で ない ときは、まちがえた 問いだけ やり直せる。ぜんぶ 正解したら 修了証（初回の 点も 書く）
 *  6. 答えは 1問ずつ 親の 画面（アプリ）へ 渡る（先生の 画面で 分析する ため）
 *
 * 静的な ページなので、アプリの 画面を 通さずに 直に 開く。
 */

const PAGE = "/tools/hourensou/renraku_slack.html";

async function openFirstQuestion(page: Page) {
  await page.goto(PAGE);
  await page.getByRole("button", { name: "了解です。対応します。" }).click();
  await page.locator("#channel-list button", { hasText: "project-a" }).click();
  await expect(page.locator(".option-card")).toHaveCount(3);
}

/** ルビの 読みを 外した 字（「不正解ふせいかい」に しない）。 */
async function plain(locator: Locator): Promise<string> {
  return locator.evaluate((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("rt").forEach((rt) => rt.remove());
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

test("まちがえると ❌ 不正解 と わけが 出て、ほかの 選択肢は 少し 押せない", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");

  await cards.nth(0).click();
  const wrong = cards.nth(0);
  expect(await plain(wrong.locator(".verdict"))).toBe("❌ 不正解");
  // わけの 文は 頭の「不正解。」を 外す（しるしと 2回 言わない）
  const reason = await plain(wrong.locator(".feedback-msg"));
  expect(reason).toContain("関係者全員");
  expect(reason).not.toMatch(/^不正解/);
  await expect(page.locator("#score-display")).toHaveText("95");

  // 押した すぐ あとは ほかの 選択肢も 押せない → 少し たつと 押せる。まちがえた 選択肢は 押せない まま
  await expect(cards.nth(1)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();
  await shot(page, "renraku-slack-01-wrong");
  await expect(cards.nth(1)).toBeEnabled({ timeout: 5_000 });
  await expect(cards.nth(2)).toBeEnabled();
  await expect(wrong).toBeDisabled();
  await expect(page.locator("#score-display")).toHaveText("95");
});

test("正解すると ⭕ 正解 と わけが 出て、「次へ」を 押すまで 進まない", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const step = page.locator("#action-area").getByText(/^Step \d\/3$/);
  await expect(step).toHaveText("Step 1/3");

  await cards.nth(1).click();
  const right = cards.nth(1);
  expect(await plain(right.locator(".verdict"))).toBe("⭕ 正解");
  const reason = await plain(right.locator(".feedback-msg"));
  expect(reason).toContain("@here か @channel");
  expect(reason).not.toMatch(/^正解/);
  // 正解の 行は すぐ 入力欄に 入る（札の 説明は 送らない）。点は 減らない
  await expect(page.locator("#draft-text")).toContainText("@here");
  await expect(page.locator("#draft-text")).not.toContainText("オンラインのメンバー");
  await expect(page.locator("#score-display")).toHaveText("100");
  // ほかの 選択肢は 押せない
  await expect(cards.nth(0)).toBeDisabled();
  await expect(cards.nth(2)).toBeDisabled();

  const next = page.getByRole("button", { name: "次へ" });
  await expect(next).toBeVisible();
  await shot(page, "renraku-slack-02-correct");
  // 待っても 勝手に 進まない（前は すぐ 次の 問いに 切り替わって いた）
  await page.waitForTimeout(2_000);
  await expect(step).toHaveText("Step 1/3");

  await next.click();
  await expect(step).toHaveText("Step 2/3");
  await expect(page.locator(".verdict")).toHaveCount(0);
  await expect(cards.nth(0)).toBeEnabled();
});

test("最後の 問いの「次へ」で 送信の ボタンが 出る", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  // ミッション1の 正解は 2番め・3番め・2番め
  for (const at of [1, 2, 1]) {
    await cards.nth(at).click();
    await next.click();
  }
  await expect(page.getByRole("button", { name: "送信する (Send)" })).toBeVisible();
});

test("「次へ」を 待って いる ときに 開き直すと、次の 問いから", async ({ page }) => {
  await openFirstQuestion(page);
  await page.locator(".option-card").nth(1).click();
  await expect(page.getByRole("button", { name: "次へ" })).toBeVisible();

  await page.reload();
  await expect(page.locator("#action-area").getByText(/^Step \d\/3$/)).toHaveText("Step 2/3");
  await expect(page.locator("#draft-text")).toContainText("@here");
  await expect(page.locator(".verdict")).toHaveCount(0);
});

test("URL は 選択肢・入力欄・送った メッセージで 青い 字。パスは 青く しない", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  // ミッション1の 3つめの 問い（ファイルの 場所）まで 進む
  for (const at of [1, 2]) {
    await cards.nth(at).click();
    await next.click();
  }
  const url = "https://file-server/docs/user-reg-spec";
  const blue = "rgb(18, 100, 163)";
  const inCard = cards.nth(1).locator(".url-text");
  await expect(inCard).toHaveText(url);
  await expect(inCard).toHaveCSS("color", blue);
  await expect(cards.nth(1).locator("a")).toHaveCount(0);
  // 「パスは \\192.168…」は リンクに ならない ことを 教える 選択肢なので 青く しない
  await expect(cards.nth(2).locator(".url-text")).toHaveCount(0);
  await shot(page, "renraku-slack-03-url");

  await cards.nth(1).click();
  await expect(page.locator("#draft-text .url-text")).toHaveText(url);
  await next.click();
  await page.getByRole("button", { name: "送信する (Send)" }).click();
  const sent = page.locator("#messages-container .url-text").last();
  await expect(sent).toHaveText(url);
  await expect(sent).toHaveCSS("color", blue);
});

test("わけは しるしの すぐ 下に 出る（改行の ある 長い 札でも 隠れない）", async ({ page }) => {
  await openFirstQuestion(page);
  const card = page.locator(".option-card").nth(0);
  await card.click();
  const reason = await card.locator(".feedback-msg").boundingBox();
  const text = await card.locator(".option-body > span").first().boundingBox();
  expect(reason?.y ?? 0).toBeLessThan(text?.y ?? 0);
});

test("選択肢の 改行は 画面でも 改行に なる", async ({ page }) => {
  await openFirstQuestion(page);
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  // ミッション1の 3つめの 問い（「ファイルのURLはこちらです。」の 次の 行に URL が ある）
  for (const at of [1, 2]) {
    await cards.nth(at).click();
    await next.click();
  }
  const text = cards.nth(1).locator(".option-body > span").first();
  const url = cards.nth(1).locator(".url-text");
  await expect(text).toHaveCSS("white-space", "pre-wrap");
  // URL は 文の 続きでは なく、次の 行の 左の 端から 始まる
  const textBox = await text.boundingBox();
  const urlBox = await url.boundingBox();
  expect(urlBox?.x).toBeCloseTo(textBox?.x ?? 0, 0);
  expect(urlBox?.y ?? 0).toBeGreaterThan(textBox?.y ?? 0);
});

/*
 * まちがえた 問いの やり直しと 答えの 記録（2026-11-02 の 指定
 *「全問正解でなかった場合に、間違えた問題をやり直す」「回答データも後で分析できるように」）。
 */

/** ミッションごとの 正解の 選択肢と、送る チャンネル（教材の データと 同じ 並び）。 */
const MISSIONS = [
  { channel: "project-a", answers: [1, 2, 1] },
  { channel: "project-a", answers: [0, 1] },
  { channel: "dev-team", answers: [2, 0] },
  { channel: "project-a", answers: [0, 2] },
  { channel: "dev-team", answers: [1, 0, 2] },
];
const STORE_KEY = "nexmax:renraku_slack:v1";
const ATTEMPT = "0b0c7a1e-3f7d-4c5a-9d2e-1a2b3c4d5e6f";

/**
 * ミッション1〜5を 通しで 遊ぶ。`wrong` に ある 問い（`m1-q3`）は、まず まちがえてから 正解する
 *（まちがえるのは 0番めの 選択肢。`wrong` には 0番めが 不正解の 問いだけを 渡す）。
 */
async function playAll(page: Page, wrong: readonly string[]) {
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  for (const [m, mission] of MISSIONS.entries()) {
    await page.getByRole("button", { name: "了解です。対応します。" }).click();
    await page.locator("#channel-list button", { hasText: mission.channel }).click();
    for (const [q, at] of mission.answers.entries()) {
      if (wrong.includes(`m${m + 1}-q${q + 1}`)) {
        await cards.nth(0).click();
        await expect(cards.nth(at)).toBeEnabled({ timeout: 5_000 });
      }
      await cards.nth(at).click();
      await next.click();
    }
    await page.getByRole("button", { name: "送信する (Send)" }).click();
    await page.locator('[onclick="nextScenario()"]').click({ timeout: 15_000 });
  }
}

/** おわった ところから 始める（まちがえた 問いが 分かって いる 保存）。 */
async function openCompleted(page: Page, score: number, misses: string[]) {
  await page.goto(PAGE);
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [
    STORE_KEY,
    JSON.stringify({
      scenarioIndex: 4,
      phase: "completed",
      currentViewId: "dev-team",
      stepsDone: 0,
      score,
      wrongPicks: [],
      times: { finishedOn: "2026-11-2" },
      attemptId: ATTEMPT,
      misses,
    }),
  ] as const);
  await page.reload();
}

test("まちがえた 問いだけ やり直して、ぜんぶ 正解すると 修了証（初回の 点も 書く）", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(PAGE);
  await playAll(page, ["m1-q3", "m4-q2"]);

  // おわりの 画面: 点と、まちがえた 問いの 一覧と「やり直す」
  const retryCard = page.locator("#retry-card");
  await expect(retryCard).toBeVisible();
  await expect(page.locator("#final-score")).toHaveText("90");
  const items = page.locator("#retry-items li");
  await expect(items).toHaveCount(2);
  expect(await plain(items.nth(0))).toContain("Doc Update 3. ファイルの場所を共有します");
  expect(await plain(items.nth(1))).toContain("DB Reset Notice 2. チームへの影響を伝えます");
  const retry = page.getByRole("button", { name: "まちがえた問いだけやり直す" });
  expect(await plain(retry)).toContain("（2問）");
  await expect(page.getByRole("button", { name: "最初から" })).toBeVisible();
  await shot(page, "renraku-slack-04-misses");

  // やり直し: Slack の 画面で その 問いだけ（右の 欄は その ミッションの 指示・入力欄は 前の 行まで）
  await retry.click();
  await expect(page.locator("#completion-screen")).toBeHidden();
  const label = page.locator("#action-area .step-head span").first();
  expect(await plain(label)).toBe("やり直し 1/2");
  await expect(page.locator("#task-sidebar-content")).toContainText("Doc Update");
  await expect(page.locator("#draft-text")).toContainText("@here");
  // 送った メッセージ（正解の 行が 見える）は 出さない
  await expect(page.locator("#messages-container")).not.toContainText("ファイルのURLはこちらです");
  await expect(page.getByRole("button", { name: "送信する (Send)" })).toHaveCount(0);
  await shot(page, "renraku-slack-05-retry");

  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  await cards.nth(1).click();
  await next.click();
  expect(await plain(label)).toBe("やり直し 2/2");
  await expect(page.locator("#task-sidebar-content")).toContainText("DB Reset Notice");
  // やり直しでは 点は 変わらない
  await expect(page.locator("#score-display")).toHaveText("90");
  await cards.nth(2).click();
  await next.click();

  // ぜんぶ 正解 → 修了証。点は 100、初回の 点も 書く
  await expect(page.locator("#diploma-card")).toBeVisible();
  await expect(page.locator("#diploma-score")).toHaveText("100");
  expect(await plain(page.locator("#diploma-first"))).toBe("初回 90点（やり直しで ぜんぶ 正解）");
  await shot(page, "renraku-slack-06-diploma");

  // 開き直しても 修了証
  await page.reload();
  await expect(page.locator("#diploma-card")).toBeVisible();
  await expect(page.locator("#diploma-first")).toBeVisible();
});

test("やり直しでも まちがえた 問いは 残り、もう一度 やり直せる", async ({ page }) => {
  await openCompleted(page, 85, ["m1-q3", "m4-q2", "m5-q3"]);
  await page.getByRole("button", { name: "まちがえた問いだけやり直す" }).click();
  const cards = page.locator(".option-card");
  const next = page.getByRole("button", { name: "次へ" });
  // 1問め（m1-q3）は まちがえてから 正解。ほかは 1回目で 正解
  await cards.nth(0).click();
  await expect(cards.nth(1)).toBeEnabled({ timeout: 5_000 });
  await cards.nth(1).click();
  await next.click();
  await cards.nth(2).click();
  await next.click();
  await cards.nth(2).click();
  await next.click();

  await expect(page.locator("#retry-card")).toBeVisible();
  expect(await plain(page.locator("#retry-result"))).toBe("やり直し: 3問中 2問 正解");
  await expect(page.locator("#retry-items li")).toHaveCount(1);
  await page.getByRole("button", { name: "まちがえた問いだけやり直す" }).click();
  await cards.nth(1).click();
  await next.click();
  await expect(page.locator("#diploma-card")).toBeVisible();
  expect(await plain(page.locator("#diploma-first"))).toContain("初回 85点");
});

test("やり直しの 途中で 開き直すと、同じ 問いから", async ({ page }) => {
  await openCompleted(page, 90, ["m1-q3", "m4-q2"]);
  await page.getByRole("button", { name: "まちがえた問いだけやり直す" }).click();
  await page.locator(".option-card").nth(0).click();
  await page.reload();
  const label = page.locator("#action-area .step-head span").first();
  expect(await plain(label)).toBe("やり直し 1/2");
  // まちがえた 選択肢は 赤い まま
  await expect(page.locator(".option-card").nth(0).locator(".verdict")).toBeVisible();
});

test("100点の ときは やり直しを 出さずに 修了証（初回の 点は 書かない）", async ({ page }) => {
  await openCompleted(page, 100, []);
  await expect(page.locator("#diploma-card")).toBeVisible();
  await expect(page.locator("#diploma-first")).toBeHidden();
});

test("答えは 1問ずつ アプリへ 渡る（1回目の 正誤・押した 順・回の 鍵）", async ({ page }) => {
  // アプリの リンク教材と 同じく、同じ 置き場の ページに iframe で 埋める
  await page.goto("/tools/hourensou/gengou.html");
  await page.evaluate((src) => {
    const box = window as unknown as { __sent: unknown[] };
    box.__sent = [];
    window.addEventListener("message", (event) => box.__sent.push(event.data));
    document.body.innerHTML = `<iframe src="${src}" style="width:1280px;height:880px"></iframe>`;
  }, PAGE);
  const frame = page.frameLocator("iframe");
  await frame.getByRole("button", { name: "了解です。対応します。" }).click();
  await frame.locator("#channel-list button", { hasText: "project-a" }).click();
  const cards = frame.locator(".option-card");
  const next = frame.getByRole("button", { name: "次へ" });
  await cards.nth(0).click();
  await expect(cards.nth(1)).toBeEnabled({ timeout: 5_000 });
  await cards.nth(1).click();
  await next.click();
  await cards.nth(2).click();

  const sent = () => page.evaluate(() => (window as unknown as { __sent: unknown[] }).__sent);
  await expect.poll(async () => (await sent()).length).toBe(2);
  const [first, second] = (await sent()) as {
    type: string;
    id: string;
    attemptId: string;
    fullSet: boolean;
    answers: { id: string; text: string; correct: boolean }[];
  }[];
  expect(first).toMatchObject({ type: "nexmax:link-answers", id: "renraku_slack", fullSet: true });
  expect(first?.attemptId).toMatch(/^[0-9a-f-]{36}$/);
  expect(first?.answers).toEqual([
    {
      id: "m1-q1",
      text: "@Hendy Senpai (ヘンディ先輩) → @here (オンラインのメンバー)",
      correct: false,
    },
  ]);
  expect(second?.attemptId).toBe(first?.attemptId);
  expect(second?.answers[0]).toMatchObject({ id: "m1-q2", correct: true });
});
