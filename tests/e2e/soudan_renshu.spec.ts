import { expect, test, type Frame, type FrameLocator, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 相談の 練習問題（public/tools/hourensou/soudan_renshu.html・2026-11-17 の 依頼）
 *
 * 見張るのは:
 *  1. はじめに → レベル1 → 絵の 説明 → 伝える こと → 席の 絵（3秒ごと）→ 相談 → 結果 が 最後まで 通る
 *  2. 席の 絵が 大丈夫そうで ない ときに 押すと ✖ と 理由（何中か）が 出る。絵は 3秒ごとに 変わる
 *  3. 足りない ときは ✖ もう 一度・足りない 要素・ヘンディさんの 反応。合格すると 星と 加点
 *  4. ヒントを うめた だけ（自分で 足して いない）の 人には「こう 言うと もっと 伝わります」
 *  5. ヘンディさんの 答えは 学生が 選んだ 方法に 合わせる
 *  6. **Gemini を 自分で 呼ばない**——聞き取りと 判定は 親の 画面に 頼む（注意事項「Gemini は Live だけ」）。
 *     親の いない ところで 開くと AI は 使えず、お手本を 書けば 星 1つ
 *  7. ステージの 中で 開くと、進み具合が アプリの 学習の 記録（→ Supabase）に 入る
 *
 * 1〜6 は ツールを **にせの 親の ページ**（同じ 置き場・下の HARNESS）に 埋めて 見る。
 * 親は アプリの 橋（`src/components/link/link-voice-bridge.tsx`）と 同じ 合図で 答える。
 */

const TOOL = "/tools/hourensou/soudan_renshu.html";
const HARNESS = "/__soudan_renshu_harness.html";
const BEFORE = ["soudan_lecture", "soudan_skit", "soudan_listening", "soudan_quiz"];

type Reply = Record<string, unknown>;

const ALL = { jokyo: true, mondai: true, kakunin: false, kangae: true, soudan: true };
const FLAGS = { decided_alone: false, off_topic: false, unclear: false };

/**
 * にせの 親の ページ。聞き取りの 文（`__heard`）と 判定の 返事（`__replies`）を 順に 返し、
 * ツールから 届いた 合図を `__msgs` に ためる。
 */
const HARNESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head>
<body><iframe id="f" src="${TOOL}"></iframe><script>
window.__msgs = []; window.__heard = []; window.__replies = []; window.__connect = "live";
const f = document.getElementById("f");
const send = (m) => f.contentWindow.postMessage(Object.assign({ id: "soudan_renshu" }, m), location.origin);
window.addEventListener("message", (e) => {
  if (e.source !== f.contentWindow) return;
  const d = e.data || {}; window.__msgs.push(d);
  if (d.type === "nexmax:link-progress-request") send({ type: "nexmax:link-progress-restore", owner: "", status: null, position: null });
  if (d.type === "nexmax:link-certificate") send({ type: "nexmax:link-certificate-ack", tier: d.tier });
  if (d.type !== "nexmax:link-voice") return;
  const reply = (m) => send(Object.assign({ type: "nexmax:link-voice-reply" }, m));
  if (d.op === "connect") { reply({ op: "status", status: "connecting", talking: false }); setTimeout(() => reply({ op: "status", status: window.__connect, talking: false }), 200); }
  if (d.op === "talk-start") reply({ op: "status", status: "live", talking: true });
  if (d.op === "talk-stop") { reply({ op: "status", status: "live", talking: false }); setTimeout(() => reply({ op: "heard", text: window.__heard.shift() || "" }), 200); }
  if (d.op === "judge") { const args = window.__replies.length > 1 ? window.__replies.shift() : window.__replies[0]; setTimeout(() => reply({ op: "judged", reqId: d.reqId, ok: true, args }), 200); }
});
</script></body></html>`;

/** Google へ 出た 通信（ツールが 自分で Gemini を 呼んだら ここに 入る）。 */
async function watchGoogle(page: Page): Promise<string[]> {
  const google: string[] = [];
  await page.route("https://generativelanguage.googleapis.com/**", (route) => {
    google.push(route.request().url());
    return route.abort();
  });
  return google;
}

async function openHarness(
  page: Page,
  heard: string[],
  replies: Reply[],
  connect: "live" | "error" = "live",
): Promise<FrameLocator> {
  await page.route(`**${HARNESS}`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: HARNESS_HTML }),
  );
  await page.addInitScript(() => window.localStorage.setItem("nexmax.geminiKey", "e2e-dummy-key"));
  await page.goto(HARNESS);
  await page.evaluate(
    ([h, r, c]) => {
      const w = window as unknown as { __heard: string[]; __replies: unknown[]; __connect: string };
      w.__heard.push(...h);
      w.__replies.push(...r);
      w.__connect = c;
    },
    [heard, replies, connect] as const,
  );
  return page.frameLocator("#f");
}

function toolFrame(page: Page): Frame {
  const frame = page.frames().find((one) => one.url().includes(TOOL));
  if (!frame) throw new Error("ツールの iframe が 無い");
  return frame;
}

async function bare(page: Page): Promise<string[]> {
  return bareKanjiTexts(toolFrame(page) as unknown as Page);
}

async function next(scope: FrameLocator | Page): Promise<void> {
  await scope.locator('.caption [data-act="next"]').click();
}

/** マイクで 話す（押して 録音 → もう 一度 押して 止める）。録音中の ⏹ は 脈打つので force で 押す。 */
async function speak(tool: FrameLocator): Promise<void> {
  const consult = tool.getByTestId("consult");
  await tool.getByTestId("mic").click();
  await expect(consult).toHaveAttribute("data-phase", "recording");
  await tool.getByTestId("mic").click({ force: true });
  await expect(tool.getByTestId("heard")).toBeVisible();
  await tool.getByTestId("send").click();
}

/** 席の 絵が 大丈夫そうに なるのを 待って 押す。 */
async function callWhenOk(scope: FrameLocator | Page): Promise<void> {
  const call = scope.getByTestId("desk-call");
  await expect(call).toHaveAttribute("data-desk-state", "ok", { timeout: 20_000 });
  await call.click();
}

test("レベル1を 最後まで: 席の 絵を 見て 話しかけ、マイクで 相談して、ヘンディさんの 答えを 聞く", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const google = await watchGoogle(page);
  const tool = await openHarness(
    page,
    [
      "お店の 一覧画面を 作って います。並べる 順番が 決まって いません。",
      "お店の 一覧画面を 作って います。並べる 順番が 決まって いません。近い 順に しても いいですか。",
      /* 合格の あと、お手本を 声に 出して 読む（1回目は 途中まで・2回目は 最後まで） */
      "お店の 一覧画面を 作って います。",
      "お店の 一覧画面を 作って います。しかし、お店を 並べる 順番が 決まって いません。今週中に 画面を 完成させたいです。私は、使う 人から 近い 順が いいと 思います。近くの お店を 探す 人が 多いからです。近い 順に しても いいですか。",
    ],
    [
      {
        ...ALL,
        soudan: false,
        own_words: false,
        bonus: [],
        choice: "none",
        ...FLAGS,
        heard_ruby: "",
      },
      { ...ALL, own_words: false, bonus: ["deadline"], choice: "B", ...FLAGS, heard_ruby: "" },
    ],
  );

  /* はじめに（4枚）。ふりがなの ない 漢字が 1つも ない */
  for (let i = 0; i < 4; i += 1) {
    await expect(tool.locator(".caption")).toBeVisible();
    expect(await bare(page), `はじめに ${i + 1}`).toEqual([]);
    if (i === 1) await shot(page, "soudan-renshu-01-parts");
    if (i === 2) await shot(page, "soudan-renshu-02-desk-guide");
    await next(tool);
  }

  /* タイトル → レベル1（表紙と 説明 4枚） */
  await tool.getByTestId("level-1").click();
  for (let i = 0; i < 5; i += 1) {
    expect(await bare(page), `レベル1 ${i}`).toEqual([]);
    if (i === 4) await shot(page, "soudan-renshu-03-options");
    await next(tool);
  }
  /* 伝える こと（3つ ＋ 言えたら ボーナスの「どんな 方法が いいか」）。メモを 書ける */
  await expect(tool.locator(".check")).toHaveCount(4);
  await expect(tool.locator(".check").nth(2)).toContainText("方法");
  await tool.getByTestId("memo-1").fill("おみせの いちらんがめん");
  await shot(page, "soudan-renshu-03-checklist");
  await next(tool);

  /* 席の 絵: はじめは かならず 大丈夫そうで ない。押すと ✖ と 何中か */
  const call = tool.getByTestId("desk-call");
  await expect(call).toBeEnabled({ timeout: 20_000 });
  const first = await call.getAttribute("data-desk-state");
  expect(first).not.toBe("ok");
  await call.click();
  await expect(tool.locator("#deskWrong")).toBeVisible();
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-04-desk-wrong");
  /* 絵は 3秒ごとに 変わる（まちがえた あとの 2秒の 待ちを 過ぎて から 測る） */
  await expect(call).not.toHaveAttribute("data-desk-state", first ?? "", { timeout: 6_000 });
  const changedAt = Date.now();
  const second = await call.getAttribute("data-desk-state");
  await expect(call).not.toHaveAttribute("data-desk-state", second ?? "", { timeout: 6_000 });
  const gap = Date.now() - changedAt;
  expect(gap).toBeGreaterThan(2_200);
  expect(gap).toBeLessThan(4_500);
  await callWhenOk(tool);

  /* 相談: マイクは 自動で つながる（文字の 欄は 出ない）→ 話す → 止める → 聞き取った 文 → 伝える */
  await expect(tool.getByTestId("mic")).toBeVisible();
  await expect(tool.getByTestId("typed")).toHaveCount(0);
  /* お手本は 合格する まで 出さない（2026-11-18「答えのようなもので棒読みできてしまう」→「合格したあとだけ」） */
  await expect(tool.locator(".model")).toHaveCount(0);
  /* 場面の メモは 出さない（答えに なる・2026-11-18 要望 #775） */
  await expect(tool.getByTestId("facts")).toHaveCount(0);
  /* マイクの ボタンの 🎤 は 1つ だけ（要望 #776） */
  expect(((await tool.getByTestId("mic").textContent()) ?? "").match(/🎤/gu)).toHaveLength(1);
  /* 画面の 文は 選べず、コピーも できない（要望 #770） */
  const copyBlocked = await tool.locator("body").evaluate((body) => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    body.querySelector(".bubble")?.dispatchEvent(event);
    return { prevented: event.defaultPrevented, select: getComputedStyle(body).userSelect };
  });
  expect(copyBlocked).toEqual({ prevented: true, select: "none" });
  await expect(tool.getByTestId("memo-read-1")).toContainText("おみせの いちらんがめん");
  await shot(page, "soudan-renshu-05-mic");
  /* 相談の とちゅうで 説明の 絵を 見返せる（めくって 閉じると 相談の まま） */
  await tool.getByTestId("review-open").click();
  await expect(tool.getByTestId("review")).toBeVisible();
  await tool.getByTestId("review-next").click();
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-05r-review");
  await tool.getByTestId("review-close").click();
  await expect(tool.getByTestId("review")).toHaveCount(0);
  await expect(tool.getByTestId("memo-read-1")).toBeVisible();
  await speak(tool);

  /* 足りない（相談したい こと）→ ✖ と ヘンディさんの 反応 */
  await expect(tool.getByTestId("verdict-retry")).toBeVisible();
  await expect(tool.locator(".check.miss")).toHaveCount(1);
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-05b-retry");

  /* 2回目は ヒントを 開いて マイクで 話す → 合格（ヒントを うめた だけ）→ 星・ボーナス・もっと 伝わる 言い方 */
  await tool.getByTestId("hint-btn").click();
  await expect(tool.getByTestId("hints")).toBeVisible();
  /* ヒントは 型ごと（要望 #777）。合格に 要らない「自分の 考え」は 言えたら ボーナス */
  for (const part of ["jokyo", "mondai", "kangae", "soudan"])
    await expect(tool.getByTestId(`hint-${part}`)).toBeVisible();
  await expect(tool.getByTestId("hint-kangae")).toContainText("ボーナス");
  await shot(page, "soudan-renshu-05c-hints");
  await speak(tool);
  await expect(tool.getByTestId("verdict-pass")).toBeVisible();
  await expect(tool.getByTestId("bonus")).toBeVisible();
  await expect(tool.getByTestId("better")).toBeVisible();
  /* お手本に ボーナスの 文が 2つ（いつまでか・考えと 理由）。印が 付く（要望 #778） */
  await expect(tool.getByTestId("model-bonus")).toHaveCount(2);
  /* お手本は 最初から 開いて いる（要望 #783） */
  await expect(tool.getByTestId("model")).toHaveAttribute("open", "");
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-06-pass");

  /* お手本を 声に 出して 読む（要望 #784）。途中までだと ✖、最後まで 読むと ⭕ */
  await tool.getByTestId("read-model").click();
  await tool.getByTestId("read-stop").click({ force: true });
  await expect(tool.getByTestId("read-result")).toHaveAttribute("data-ok", "0");
  await tool.getByTestId("read-model").click();
  await tool.getByTestId("read-stop").click({ force: true });
  await expect(tool.getByTestId("read-result")).toHaveAttribute("data-ok", "1");
  expect(await bare(page)).toEqual([]);
  await tool.getByTestId("read-result").scrollIntoViewIfNeeded();
  await shot(page, "soudan-renshu-06b-read-model");

  /* 親へ: 進み具合（星 2・加点 1）と 先生の 記録（2回 ぶんの ことば）・判定の 頼み */
  const msgs = (await page.evaluate(
    () => (window as unknown as { __msgs: Reply[] }).__msgs,
  )) as Reply[];
  const progress = msgs.filter((m) => m.type === "nexmax:link-progress").pop();
  expect(progress?.position).toMatchObject({ s1: 2, p1: 1, open: 2 });
  const answers = msgs.filter((m) => m.type === "nexmax:link-answers").pop();
  expect(JSON.stringify(answers)).toContain("1回目✖");
  expect(msgs.some((m) => m.type === "nexmax:link-voice" && m.op === "judge")).toBe(true);

  /* ヘンディさんの 答え（B を 選んだ）→ つぎの レベルへ */
  await tool.getByTestId("to-reply").click();
  await expect(tool.locator(".reply")).toContainText("進すすめて");
  await expect(tool.getByTestId("next-level")).toBeVisible();
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-07-reply");
  expect(google).toEqual([]);
});

test("勝手に 決めて 言うと やり直し（許可を 聞く ことを 教える）", async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "nexmax:soudan_renshu:v1",
      JSON.stringify({
        v: 1,
        introSeen: true,
        levels: {},
        worksheet: { cells: {}, thoughts: {} },
        at: { level: 0, page: 7 },
      }),
    ),
  );
  const tool = await openHarness(
    page,
    ["近い 順に します。"],
    [
      {
        ...ALL,
        own_words: true,
        bonus: [],
        choice: "B",
        ...FLAGS,
        decided_alone: true,
        heard_ruby: "",
      },
    ],
  );
  /* 相談の 途中から 開き直すと、席の 絵から やり直す */
  await callWhenOk(tool);
  await speak(tool);
  await expect(tool.getByTestId("verdict-retry")).toBeVisible();
  await expect(tool.locator(".bubble")).toContainText("待まって");
});

test("マイクに 2回 つながらない ときだけ、文を 書いて 送れる", async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "nexmax:soudan_renshu:v1",
      JSON.stringify({
        v: 1,
        introSeen: true,
        levels: {},
        worksheet: { cells: {}, thoughts: {} },
        at: { level: 0, page: 6 },
      }),
    ),
  );
  const tool = await openHarness(
    page,
    [],
    [{ ...ALL, own_words: true, bonus: [], choice: "B", ...FLAGS, heard_ruby: "" }],
    "error",
  );
  await callWhenOk(tool);
  /* 1回目は 自動で つなぐ → つながらない。押して もう 一度 → つながらない → 文の 欄 */
  await expect(tool.getByTestId("mic-connect")).toBeEnabled();
  await expect(tool.getByTestId("typed")).toHaveCount(0);
  await tool.getByTestId("mic-connect").click();
  await expect(tool.getByTestId("typed")).toBeVisible();
  /* 文の 欄にも 貼り付けは できない（要望 #770） */
  const pasteBlocked = await tool.getByTestId("typed").evaluate((area) => {
    const event = new Event("paste", { bubbles: true, cancelable: true });
    area.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pasteBlocked).toBe(true);
  await tool.getByTestId("typed").fill("ちかい じゅんに しても いいですか。");
  await tool.getByTestId("send-typed").click();
  await expect(tool.getByTestId("verdict-pass")).toBeVisible();
});

test("アプリの 外（べつの タブ）で 開くと、アプリの 中の 教材へ 移る（説明は 出さない）", async ({
  page,
}) => {
  const google = await watchGoogle(page);
  await page.goto(TOOL);
  /* `/link/soudan_renshu` は アプリが ステージの 中の 本来の URL（`/soudan/link`）へ 送る */
  await expect(page).toHaveURL(/\/(?:link\/soudan_renshu|soudan\/link)$/u);
  expect(google).toEqual([]);
});

test("ステージの 中で 開くと、進み具合が 学習の 記録に 入る（Supabase へ 送る 元）", async ({
  page,
  context,
}) => {
  await seedCompleted(context, BEFORE);
  await page.goto("/soudan/link");
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".caption")).toBeVisible();
  for (let i = 0; i < 4; i += 1) await next(frame);
  await expect(frame.getByTestId("level-1")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(window.localStorage.getItem("nexmax:v1:content:soudan_renshu") ?? "null"),
      ),
    )
    .toMatchObject({ status: "started", position: { intro: 1, open: 1 } });
});

/* ------------------------------------------------------------------ *
 * レベル4までで 修了証と ✅・レベル5は 金の 特別課題（2026-11-20）
 * ------------------------------------------------------------------ */

type Msg = { type?: string; tier?: string; levels?: unknown; status?: string };

async function messages(page: Page): Promise<Msg[]> {
  return (await page.evaluate(() => (window as unknown as { __msgs: Msg[] }).__msgs)) as Msg[];
}

function seed(page: Page, value: unknown): Promise<void> {
  return page.addInitScript(
    (v) => window.localStorage.setItem("nexmax:soudan_renshu:v1", JSON.stringify(v)),
    value,
  );
}

const PASS_ALL = {
  jokyo: true,
  mondai: true,
  kakunin: true,
  kangae: true,
  soudan: true,
  own_words: true,
  bonus: [],
  ...FLAGS,
  heard_ruby: "",
};

test("レベル4に 合格すると ✅ と 修了証の 頼み（レベル1〜4・はじめて 合格した 回の やり直し）。つぎは 金の 特別課題", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seed(page, {
    v: 1,
    introSeen: true,
    levels: {
      l1: { stars: 3, bonus: 1, firstFails: 0 },
      l2: { stars: 3, bonus: 0, firstFails: 0 },
      l3: { stars: 2, bonus: 0, firstFails: 1 },
    },
    worksheet: { cells: {}, thoughts: {} },
    at: { level: 3, page: 10 },
  });
  const tool = await openHarness(
    page,
    ["明日の デモに ついて 相談が あります。ログインを 先に 調べても いいでしょうか。"],
    [{ ...PASS_ALL, choice: "login" }],
  );
  await callWhenOk(tool);
  await speak(tool);
  await expect(tool.getByTestId("verdict-pass")).toBeVisible();

  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === "nexmax:link-certificate"))
    .toEqual([
      {
        type: "nexmax:link-certificate",
        id: "soudan_renshu",
        tier: "main",
        levels: [
          { no: 1, stars: 3, fails: 0 },
          { no: 2, stars: 3, fails: 0 },
          { no: 3, stars: 2, fails: 1 },
          { no: 4, stars: 3, fails: 0 },
        ],
      },
    ]);
  const msgs = await messages(page);
  expect(msgs.some((m) => m.type === "nexmax:link-done")).toBe(true);
  expect(msgs.filter((m) => m.type === "nexmax:link-progress").pop()?.status).toBe("completed");
  /* 親が 出したと 知らせたら、端末に 残す（次から 頼まない） */
  await expect
    .poll(() =>
      page
        .frameLocator("#f")
        .locator("body")
        .evaluate(
          () => JSON.parse(window.localStorage.getItem("nexmax:soudan_renshu:v1") ?? "{}").certAck,
        ),
    )
    .toEqual({ main: true });

  /* ヘンディさんの 答え → 終わった ことと、金の「特別課題へ」 */
  await tool.getByTestId("to-reply").click();
  await expect(tool.getByTestId("required-done")).toBeVisible();
  await expect(tool.getByTestId("next-level")).toContainText("レベル5");
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-08-level4-done");

  /* タイトル: レベル5は 金の 特別な カード */
  await tool.locator('[data-act="home"]').first().click();
  await expect(tool.getByTestId("special-badge")).toBeVisible();
  await expect(tool.getByTestId("level-5")).toHaveClass(/special/u);
  expect(await bare(page)).toEqual([]);
  await shot(page, "soudan-renshu-09-title-special");
});

test("修了証が できる 前に レベル4まで 終えた 人にも、開いた ときに ✅ と 修了証を 1回だけ 頼む", async ({
  page,
}) => {
  await seed(page, {
    v: 1,
    introSeen: true,
    levels: {
      l1: { stars: 3, bonus: 0 },
      l2: { stars: 2, bonus: 0 },
      l3: { stars: 3, bonus: 0 },
      l4: { stars: 3, bonus: 0 },
    },
    worksheet: { cells: {}, thoughts: {} },
  });
  await openHarness(page, [], []);
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === "nexmax:link-certificate"))
    .toEqual([
      {
        type: "nexmax:link-certificate",
        id: "soudan_renshu",
        tier: "main",
        levels: [
          { no: 1, stars: 3, fails: null },
          { no: 2, stars: 2, fails: null },
          { no: 3, stars: 3, fails: null },
          { no: 4, stars: 3, fails: null },
        ],
      },
    ]);
  const msgs = await messages(page);
  expect(msgs.some((m) => m.type === "nexmax:link-done")).toBe(true);
});

test("レベル5（特別課題）に 合格すると 特別課題の 修了証を 頼む", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, {
    v: 1,
    introSeen: true,
    levels: {
      l1: { stars: 3, bonus: 0, firstFails: 0 },
      l2: { stars: 3, bonus: 0, firstFails: 0 },
      l3: { stars: 3, bonus: 0, firstFails: 0 },
      l4: { stars: 3, bonus: 0, firstFails: 0 },
    },
    certAck: { main: true },
    worksheet: { cells: {}, thoughts: {} },
    at: { level: 4, page: 15 },
  });
  const tool = await openHarness(
    page,
    [
      "OCRアプリに 使う APIに ついて 相談が あります。まず Claudeで テストしても よろしいでしょうか。",
    ],
    [{ ...PASS_ALL, choice: "claude" }],
  );
  await callWhenOk(tool);
  await speak(tool);
  await expect(tool.getByTestId("verdict-pass")).toBeVisible();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === "nexmax:link-certificate"))
    .toEqual([
      {
        type: "nexmax:link-certificate",
        id: "soudan_renshu",
        tier: "special",
        levels: [{ no: 5, stars: 3, fails: 0 }],
      },
    ]);
});
