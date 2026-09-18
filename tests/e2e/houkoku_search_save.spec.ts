import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type FrameLocator, type Page } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * 調査（リサーチ）の こたえが **DB に とどくまで 送り直され、空の 端末では 戻る**
 *
 * 2026-09-18 の 指定「調査（リサーチ）で送信したデータがデータベースに保管されて
 * いませんでした。入力したデータも消えてしまっています」。
 *
 * 調べたら DB の こたえは **0件**で、書き込みの 要求すら 1度も 届いて いなかった。
 * ツールは 出した 瞬間に 1回だけ 親へ 渡し、その 場で「送った」印を 付けて いた
 * ——受け手が いない とき（別の タブ・保存の 仕組みが 入る 前）に 出した こたえは
 * 二度と 送られなかった。そして 書いた ものは ツールの URL と 端末ごとの
 * localStorage にしか 無く、別の URL で 開くと 空に 見えた。
 *
 * 控えは **学習者ごとの 置き場**に 分けて ある（教室の PC を 何人かで 使うため）。
 * ここでは アプリの 役（いまの 学習者を 教える・DB に 入れて 返事を する）を テストが
 * 代わりに 務める。デモモード（鍵ゼロ）の アプリは DB に 書けないので、
 * 本物の 受け口には 合図を 渡さない（`stopImmediatePropagation`）。
 */

const PATH = "/houkoku/link";
const LINK = "houkoku_search";
/** 持ち主の 分からない 書きかけの 置き場（古い 版・べつの タブ）。 */
const SHARED_KEY = "nexmax:houkoku_search:v1";
/** いま ログインして いる ことに する 学習者。 */
const ME = "e2e-learner-b";
/** 前に この 端末を 使った 学習者。 */
const OTHER = "e2e-learner-a";
const slotOf = (owner: string) => `nexmax:houkoku_search:v2:${owner}`;

async function seedUpToTool(context: BrowserContext) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const before = stage.contents
    .slice(
      0,
      stage.contents.findIndex((content) => content.ref === LINK),
    )
    .map((content) => content.ref);
  await seedCompleted(context, before);
}

/** DB に ある ことに する こたえ（テストの 中の「前に 出した もの」）。 */
const STORED = [
  { id: "kaikyuu_order", text: "社長　取締役　部長　課長　社員" },
  { id: "kaikyuu", text: "In my country: CEO, manager, staff." },
  { id: "houkoku", text: "We report only when there is a problem." },
  { id: "joushi", text: "The boss is closer than in Japan." },
];
const STORED_ATTEMPT = "3f0c2b1e-8a4d-4c6e-9b7a-1d2e3f4a5b6c";

interface Received {
  readonly answers: { id: string; text: string }[];
  readonly key: string;
  readonly owner: string;
}

/**
 * アプリの 役を する。**親の 窓だけ**で 動く（init script は iframe の 中でも 走る）。
 *
 * - 「いま だれ？」に 答える。`who` が "me" なら `ME`、"nobody" なら だれか 分からない
 *   （ログインの 情報が 読めない）、"silent" なら 返事を しない（アプリが 古い・こわれた）
 * - `stored` は DB に ある ことに する 最後の こたえ
 * - 届いた こたえを `window.__answers` に ためる（開き直した 窓ごとに 数え直す）
 * - `e2e:ack` が "1" の ときだけ「DB に 入った」を 返す（途中で 切り替える ため localStorage で 持つ）
 */
async function actAsApp(
  context: BrowserContext,
  {
    stored = null,
    who = "me",
  }: {
    stored?: readonly { id: string; text: string }[] | null;
    who?: "me" | "nobody" | "silent";
  } = {},
): Promise<void> {
  await context.addInitScript(
    ({ storedAnswers, storedAttempt, linkId, me, mode }) => {
      if (window.top !== window) return;
      const box: unknown[] = [];
      (window as unknown as { __answers: unknown[] }).__answers = box;
      window.addEventListener("message", (event) => {
        const data = event.data as {
          type?: string;
          id?: string;
          key?: string;
          owner?: string;
          answers?: unknown;
        };
        if (!data || data.id !== linkId || !event.source) return;
        const source = event.source as Window;
        if (data.type === "nexmax:link-hello") {
          event.stopImmediatePropagation();
          if (mode === "silent") return;
          source.postMessage(
            {
              type: "nexmax:link-state",
              id: linkId,
              owner: mode === "me" ? me : null,
              demo: false,
              answers: storedAnswers ?? [],
              attemptId: storedAnswers ? storedAttempt : null,
            },
            window.location.origin,
          );
        }
        if (data.type === "nexmax:link-answers") {
          event.stopImmediatePropagation();
          box.push({ answers: data.answers, key: data.key, owner: data.owner });
          if (window.localStorage.getItem("e2e:ack") === "1") {
            source.postMessage(
              { type: "nexmax:link-answers-saved", id: linkId, key: data.key },
              window.location.origin,
            );
          }
        }
      });
    },
    {
      storedAnswers: stored ? [...stored] : null,
      storedAttempt: STORED_ATTEMPT,
      linkId: LINK,
      me: ME,
      mode: who,
    },
  );
}

/** この 端末に 控えを 置いて おく（前の 学習者・古い 版 などを 作る）。1回だけ 置く。 */
async function seedToolState(context: BrowserContext, key: string, state: Record<string, unknown>) {
  await context.addInitScript(
    ({ storageKey, value }) => {
      const flag = `e2e:seeded:${storageKey}`;
      if (window.localStorage.getItem(flag)) return;
      window.localStorage.setItem(flag, "1");
      window.localStorage.setItem(storageKey, value);
    },
    { storageKey: key, value: JSON.stringify(state) },
  );
}

async function openTool(page: Page): Promise<FrameLocator> {
  await page.goto(PATH);
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  return page.frameLocator("iframe");
}

/** この 窓で 親に 届いた こたえ。 */
async function received(page: Page): Promise<Received[]> {
  return page.evaluate(() => (window as unknown as { __answers?: Received[] }).__answers ?? []);
}

async function readSlot(page: Page, key: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? "null"), key);
}

async function fillAll(tool: FrameLocator | Page) {
  const ranks = STORED[0]!.text.split("　");
  for (const [index, word] of ranks.entries()) {
    await tool.getByLabel(`${index + 1}ばんめ`).fill(word);
  }
  const areas = tool.locator("textarea");
  for (const [index, answer] of STORED.slice(1).entries()) {
    await areas.nth(index).fill(answer.text);
  }
}

/** 前の 学習者（OTHER）が 出した ままの 控え。 */
const PREVIOUS = {
  v: 2,
  rows: ["Aさんの 社長", "Aさんの 部長", "Aさんの 課長", "Aさんの 係長", "Aさんの 社員"],
  answers: { kaikyuu: "A の 文", houkoku: "A の 文", joushi: "A の 文" },
  submitted: true,
  editing: false,
  attempt: null,
  saved: "",
};

test("調査（リサーチ）: 先生に とどいたと 返事が 来るまで、同じ 1回の id で 送り直す", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);

  let tool = await openTool(page);
  await fillAll(tool);
  await tool.getByRole("button", { name: /出す/ }).click();

  /* 1. 出すと 親へ 渡る（持ち主つき）。返事が まだ 無いので「とどいた」とは 言わない。 */
  await expect.poll(async () => (await received(page)).length).toBe(1);
  const first = (await received(page))[0]!;
  expect(first.answers).toEqual(STORED);
  expect(first.owner).toBe(ME);
  expect(first.key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(tool.locator("#savedNote")).toContainText("おくって います");

  /*
   * 2. 返事が 来ない まま 開き直すと、**もう一度 送る**（以前は ここで 黙って 止まった）。
   *    id は 同じ——DB の 一意索引が 2回目を 捨てるので、先生の 画面に 行が 増えない。
   */
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#doneList li")).toHaveCount(5);
  await expect.poll(async () => (await received(page)).map((one) => one.key)).toEqual([first.key]);

  /* 3. アプリが DB に 入れて 返事を すると「とどきました」。 */
  await page.evaluate(() => window.localStorage.setItem("e2e:ack", "1"));
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
  await shot(page, "houkoku-search-save-01-saved");

  /* 4. とどいた あとは 開き直しても 送らない。 */
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
  // 送るなら 返事を 受けた 直後に 送る。少し 待っても 0件の ままで ある ことを 見る
  await page.waitForTimeout(1500);
  expect(await received(page)).toEqual([]);
});

test("調査（リサーチ）: 「直す」の とちゅうで 閉じても、書きかけは 送らない（出した 1回を 送る）", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);

  let tool = await openTool(page);
  await fillAll(tool);
  await tool.getByRole("button", { name: /出す/ }).click();
  await expect.poll(async () => (await received(page)).length).toBe(1);
  const first = (await received(page))[0]!;

  /* 「直す」で 1行 消して、出さずに 閉じる */
  await tool.getByRole("button", { name: /直す/ }).click();
  await tool.locator("li.row").nth(4).getByRole("button", { name: "消す" }).click();

  await page.evaluate(() => window.localStorage.setItem("e2e:ack", "1"));
  await page.reload();
  tool = await openTool(page);

  /* 送り直すのは 出した ときの 中身と 1回の id。書きかけの 4行では ない。 */
  await expect.poll(async () => (await received(page)).length).toBe(1);
  const again = (await received(page))[0]!;
  expect(again.key).toBe(first.key);
  expect(again.answers).toEqual(STORED);

  /* 欄には 直して いる とちゅうの 書きかけが 残って いる（消えて いない）。 */
  await expect(tool.getByLabel("4ばんめ")).toHaveValue("課長");
  await expect(tool.getByLabel("5ばんめ")).toHaveCount(0);
});

test("調査（リサーチ）: 端末が 空なら、DB に ある 前の こたえを 戻す", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context, { stored: STORED });

  const tool = await openTool(page);

  /* 1. 出した 順が 戻り、先生に とどいて いる ことが 出る。 */
  await expect(tool.locator("#doneList li")).toHaveText(STORED[0]!.text.split("　"));
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
  await shot(page, "houkoku-search-save-02-restored");

  /* 2. 戻した ものは もう DB に ある。送り直さない。 */
  await page.waitForTimeout(1500);
  expect(await received(page)).toEqual([]);

  /* 3. 「直す」で 開くと、書いた 文も 戻って いる。 */
  await tool.getByRole("button", { name: /直す/ }).click();
  const areas = tool.locator("textarea");
  for (const [index, answer] of STORED.slice(1).entries()) {
    await expect(areas.nth(index)).toHaveValue(answer.text);
  }

  /* 4. 何も 変えずに もう一度 出しても、戻した 1回と 同じ（送らない）。 */
  await tool.getByRole("button", { name: /出す/ }).click();
  await page.waitForTimeout(1000);
  expect(await received(page)).toEqual([]);

  /* 5. 前に 出した 人なので、この 端末でも つぎの ページが 開く（関門）。 */
  await page.goto("/houkoku/article-houkoku_hierarchy");
  await expect(page.getByText("じゅんばんでは ありません")).toHaveCount(0);
});

test("調査（リサーチ）: 書き始めて いる ときは、前の こたえで 上書きしない", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context, { stored: STORED });
  await seedToolState(context, slotOf(ME), {
    v: 2,
    rows: ["わたしの 書きかけ", "", "", "", ""],
    answers: { kaikyuu: "", houkoku: "", joushi: "" },
    submitted: false,
    editing: false,
    attempt: null,
    saved: "",
  });

  const tool = await openTool(page);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("わたしの 書きかけ");
  await page.waitForTimeout(1500);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("わたしの 書きかけ");
  await expect(tool.locator("#doneCard")).toBeHidden();
});

test("調査（リサーチ）: べつの タブでは 出せない。書いた ものは アプリで 書きかけと して 出る", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);
  // 前の 学習者の 置き場。べつの タブでは だれか 分からないので、見えては いけない
  await seedToolState(context, slotOf(OTHER), PREVIOUS);

  /*
   * 「べつの タブで ひらく」＝ 親の いない 1枚。以前は 出した ことに なるのに
   * 送り先が 無く、黙って 捨てて いた（出した つもりで DB には 何も 無い）。
   * いまは だれが 書いたかを アプリに 聞けない ので、ここでは 出させない。
   */
  await page.goto("/tools/hourensou/houkoku_search.html");
  await expect(page.getByLabel("1ばんめ")).toHaveValue("");
  await fillAll(page);
  await page.getByRole("button", { name: /出す/ }).click();

  /* 1. 出せない ことと、書いた ものが 残る ことを はっきり 言う（規律1）。 */
  await expect(page.locator("#note")).toContainText("ここでは");
  await expect(page.locator("#note")).toContainText("のこって います");
  await expect(page.locator("#doneCard")).toBeHidden();
  await shot(page, "houkoku-search-save-03-newtab");

  /* 2. アプリの 中で 開くと、書きかけと して 出る。**自動では 送らない。** */
  await page.evaluate(() => window.localStorage.setItem("e2e:ack", "1"));
  const tool = await openTool(page);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("社長");
  await expect(tool.locator("#doneCard")).toBeHidden();
  await page.waitForTimeout(1000);
  expect(await received(page)).toEqual([]);

  /* 3. 自分で「出す」を 押すと、いま 開いた 人の ものと して 送り、とどいたら そう 出る。 */
  await tool.getByRole("button", { name: /出す/ }).click();
  await expect.poll(async () => (await received(page)).map((one) => one.owner)).toEqual([ME]);
  expect((await received(page))[0]!.answers).toEqual(STORED);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
});

/*
 * 教室の PC は 1台を 何人かで 使う。ツールの 控えは ログアウトでは 消えない
 *（`clearNexmaxCache` が 消すのは `nexmax.` で 始まる 鍵だけ）。
 * 前の 人の 控えを 次の 人の 名前で 送ると、先生の 名簿が 静かに 嘘に なり、
 * 次の 人の 関門まで 開く。捨てると、前の 人の まだ 届いて いない こたえが 消える
 *（どちらも 2026-09-18 の 検収で 見つかった）。
 */
test("調査（リサーチ）: ほかの 学習者の 控えは、見せず・送らず・関門も 開けず・消しも しない", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);
  await seedToolState(context, slotOf(OTHER), PREVIOUS);

  const tool = await openTool(page);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("");
  await expect(tool.locator("textarea").first()).toHaveValue("");
  await expect(tool.locator("#doneCard")).toBeHidden();
  await expect(tool.getByText("Aさんの 社長")).toHaveCount(0);

  await page.waitForTimeout(1500);
  expect(await received(page)).toEqual([]);
  // 前の 人の 控えは その 人の 置き場に 残って いる（次に その 人が 開けば 送られる）
  expect(await readSlot(page, slotOf(OTHER))).toMatchObject({ rows: PREVIOUS.rows });

  // 出して いない 人なので、つぎの ページは まだ 閉じて いる
  await page.goto("/houkoku/article-houkoku_hierarchy");
  await expect(page.getByText("じゅんばんでは ありません")).toBeVisible();
});

test("調査（リサーチ）: 持ち主の 分からない 古い 控えは、書きかけに 戻す（捨てない・送らない・関門も 開けない）", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);
  // この 直しの 前の 形（版も 持ち主も 無い）。自分の スマホで 出した 人の たった 1つの 控えかも しれない
  await seedToolState(context, SHARED_KEY, {
    rows: PREVIOUS.rows,
    answers: PREVIOUS.answers,
    submitted: true,
    sent: "",
  });

  const tool = await openTool(page);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("Aさんの 社長");
  await expect(tool.locator("#doneCard")).toBeHidden();

  await page.waitForTimeout(1500);
  expect(await received(page)).toEqual([]);

  await page.goto("/houkoku/article-houkoku_hierarchy");
  await expect(page.getByText("じゅんばんでは ありません")).toBeVisible();
});

for (const [label, who] of [
  ["アプリから 返事が 来ない", "silent"],
  ["ログインして いる 人が 分からない", "nobody"],
] as const) {
  test(`調査（リサーチ）: ${label} ときは、何も 見せず・出させない`, async ({ page, context }) => {
    await seedUpToTool(context);
    await actAsApp(context, { who });
    await seedToolState(context, SHARED_KEY, { ...PREVIOUS, v: 2 });

    const tool = await openTool(page);
    // だれの 控えか 確かめられない。できる ことを 1つ 言い、中身は 見せない
    await expect(tool.locator("#waitNote")).toContainText("うまく ひらけません", {
      timeout: 15_000,
    });
    await expect(tool.getByLabel("1ばんめ")).toBeHidden();
    await expect(tool.getByRole("button", { name: /出す/ })).toBeHidden();
    expect(await received(page)).toEqual([]);

    await page.goto("/houkoku/article-houkoku_hierarchy");
    await expect(page.getByText("じゅんばんでは ありません")).toBeVisible();
  });
}

test("調査（リサーチ）: 行の 中の 全角スペースで、戻した 行が 割れない", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);

  const tool = await openTool(page);
  const ranks = ["代表　取締役", "社長", "部長", "課長", "社員"];
  for (const [index, word] of ranks.entries()) {
    await tool.getByLabel(`${index + 1}ばんめ`).fill(word);
  }
  const areas = tool.locator("textarea");
  for (let i = 0; i < 3; i++) await areas.nth(i).fill("Cambodia is different.");
  await tool.getByRole("button", { name: /出す/ }).click();

  await expect.poll(async () => (await received(page)).length).toBe(1);
  const order = (await received(page))[0]!.answers.find((one) => one.id === "kaikyuu_order");
  // 行の 区切りは 全角スペース。行の 中は 半角に なって いるので、分けると 5行に もどる
  expect(order?.text.split("　")).toEqual(["代表 取締役", "社長", "部長", "課長", "社員"]);
});
