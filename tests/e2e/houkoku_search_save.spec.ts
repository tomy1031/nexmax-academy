import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
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
 * ここでは アプリの 役（DB に 入れて 返事を する）を テストが 代わりに 務める。
 * デモモード（鍵ゼロ）の アプリは DB に 書けないので 返事を しない——それが そのまま
 * 「とどかなかった」ときの 形に なる。
 */

const PATH = "/houkoku/link";
const LINK = "houkoku_search";

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

/**
 * アプリの 役を する。**親の 窓だけ**で 動く（init script は iframe の 中でも 走る）。
 *
 * - 届いた こたえを `window.__answers` に ためる（開き直した 窓ごとに 数え直す）
 * - `e2e:ack` が "1" の ときだけ「DB に 入った」を 返す（途中で 切り替える ため localStorage で 持つ）
 * - `restore` を 渡すと、ツールの「前の こたえを ください」に それを 返す
 */
async function actAsApp(
  context: BrowserContext,
  restore?: readonly { id: string; text: string }[],
): Promise<void> {
  await context.addInitScript(
    ({ restoreAnswers, linkId }) => {
      if (window.top !== window) return;
      const box: unknown[] = [];
      (window as unknown as { __answers: unknown[] }).__answers = box;
      window.addEventListener("message", (event) => {
        const data = event.data as { type?: string; id?: string; key?: string; answers?: unknown };
        if (!data || data.id !== linkId || !event.source) return;
        const source = event.source as Window;
        if (data.type === "nexmax:link-answers") {
          box.push(data.answers);
          if (window.localStorage.getItem("e2e:ack") === "1") {
            source.postMessage(
              { type: "nexmax:link-answers-saved", id: linkId, key: data.key },
              window.location.origin,
            );
          }
        }
        if (data.type === "nexmax:link-restore-request" && restoreAnswers) {
          source.postMessage(
            { type: "nexmax:link-restore", id: linkId, answers: restoreAnswers },
            window.location.origin,
          );
        }
      });
    },
    { restoreAnswers: restore ? [...restore] : null, linkId: LINK },
  );
}

async function openTool(page: Page) {
  await page.goto(PATH);
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  return page.frameLocator("iframe");
}

/** この 窓で 親に 届いた こたえ。 */
async function received(page: Page): Promise<{ id: string; text: string }[][]> {
  return page.evaluate(
    () => (window as unknown as { __answers?: { id: string; text: string }[][] }).__answers ?? [],
  );
}

test("調査（リサーチ）: 先生に とどいたと 返事が 来るまで、開くたびに 送り直す", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);

  let tool = await openTool(page);
  const ranks = STORED[0]!.text.split("　");
  for (const [index, word] of ranks.entries()) {
    await tool.getByLabel(`${index + 1}ばんめ`).fill(word);
  }
  const areas = tool.locator("textarea");
  for (const [index, answer] of STORED.slice(1).entries()) {
    await areas.nth(index).fill(answer.text);
  }
  await tool.getByRole("button", { name: /出す/ }).click();

  /* 1. 出すと 親へ 渡る。返事が まだ 無いので「とどいた」とは 言わない。 */
  await expect.poll(() => received(page)).toEqual([STORED]);
  await expect(tool.locator("#savedNote")).toContainText("おくって います");
  await expect(tool.locator("#savedNote")).not.toContainText("とどきました");

  /* 2. 返事が 来ない まま 開き直すと、**もう一度 送る**（以前は ここで 黙って 止まった）。 */
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#doneList li")).toHaveCount(ranks.length);
  await expect.poll(() => received(page)).toEqual([STORED]);

  /* 3. アプリが DB に 入れて 返事を すると「とどきました」。 */
  await page.evaluate(() => window.localStorage.setItem("e2e:ack", "1"));
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
  await expect.poll(() => received(page)).toEqual([STORED]);
  await shot(page, "houkoku-search-save-01-saved");

  /* 4. とどいた あとは 開き直しても 送らない（先生の 画面に 同じ 行を 増やさない）。 */
  await page.reload();
  tool = await openTool(page);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
  // 送るなら 開いた 直後に 送る。少し 待っても 0件の ままで ある ことを 見る
  await page.waitForTimeout(1500);
  expect(await received(page)).toEqual([]);
});

test("調査（リサーチ）: 端末が 空なら、DB に ある 前の こたえを 戻す", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context, STORED);

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

  /* 4. 前に 出した 人なので、この 端末でも つぎの ページが 開く（関門）。 */
  await page.goto("/houkoku/article-houkoku_hierarchy");
  await expect(page.getByText("じゅんばんでは ありません")).toHaveCount(0);
});

test("調査（リサーチ）: 書き始めて いる ときは、前の こたえで 上書きしない", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context, STORED);
  // この 端末で 書きかけ（まだ 出して いない）
  await context.addInitScript(() => {
    if (window.top === window) return;
    if (window.localStorage.getItem("nexmax:houkoku_search:v1")) return;
    window.localStorage.setItem(
      "nexmax:houkoku_search:v1",
      JSON.stringify({
        rows: ["わたしの 書きかけ", "", "", "", ""],
        answers: { kaikyuu: "", houkoku: "", joushi: "" },
        submitted: false,
        saved: "",
      }),
    );
  });

  const tool = await openTool(page);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("わたしの 書きかけ");
  await page.waitForTimeout(1500);
  await expect(tool.getByLabel("1ばんめ")).toHaveValue("わたしの 書きかけ");
  await expect(tool.locator("#doneCard")).toBeHidden();
});

test("調査（リサーチ）: べつの タブで 出した ものは、アプリで 開いた ときに 送る", async ({
  page,
  context,
}) => {
  await seedUpToTool(context);
  await actAsApp(context);

  /*
   * 「べつの タブで ひらく」＝ 親の いない 1枚。送り先が 無いので、
   * 以前は 黙って 捨てて いた（出した つもりで DB には 何も 無い）。
   */
  await page.goto("/tools/hourensou/houkoku_search.html");
  const ranks = STORED[0]!.text.split("　");
  for (const [index, word] of ranks.entries()) {
    await page.getByLabel(`${index + 1}ばんめ`).fill(word);
  }
  const areas = page.locator("textarea");
  for (const [index, answer] of STORED.slice(1).entries()) {
    await areas.nth(index).fill(answer.text);
  }
  await page.getByRole("button", { name: /出す/ }).click();

  /* 1. とどいて いない ことを はっきり 言う（規律1）。 */
  await expect(page.locator("#savedNote")).toContainText("とどいて いません");
  await shot(page, "houkoku-search-save-03-newtab");

  /* 2. アプリの 中で 開くと、端末に 残って いた ものを 送り、とどいたら そう 出る。 */
  await page.evaluate(() => window.localStorage.setItem("e2e:ack", "1"));
  const tool = await openTool(page);
  await expect.poll(() => received(page)).toEqual([STORED]);
  await expect(tool.locator("#savedNote")).toContainText("とどきました");
});
