import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { bareKanjiTexts, joinCall, seedCompleted, shot } from "./helpers";

/**
 * 朝礼・夕礼ステージ（台帳 #366）の 通し — **390px の 実機幅で 撮る**
 *
 * ## なぜ 幅を 固定して 撮るのか
 * この 画面は 1つの 列に **カードの 板（上に 貼りつく）・場面カード・
 * 入力欄（下に 貼りつく）**の 3つを 積む。手もとの 広い 窓では 3つとも 見えるが、
 * 学習者の スマホでは 真ん中の メモ 10行が 板と 入力欄の あいだに 挟まれる。
 * 折返しの 崩れは **撮って はじめて 見つかる**（2026-08-16 の 実例）。
 *
 * ## ルビが 入るので、字では さがせない
 * 画面の 字は ほとんどが `RubyText` を 通るので、`getByText("話すと 開きます")` は
 * 当たらない（`<rt>` の かなが 字の あいだに 挟まる）。だから
 * **`rt` を 外した 字**（`readingFreeText`）で 突き合わせる。
 * ボタンは かなの ところ（「つづけます」「けっかを 見る」）か、
 * 正規表現（`/報告する/` は ルビの かなを またがない 短い 語）で さがす。
 */

const PHONE = { width: 390, height: 844 };

interface Stage {
  contents: { ref: string }[];
}

function stageRefs(): string[] {
  const stage = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "stages", "asakai.json"), "utf8"),
  ) as Stage;
  return stage.contents.map((item) => item.ref);
}

/** ふりがな（`rt`）を 外した 画面の 字。空白は ぜんぶ 落として 比べる。 */
async function readingFreeText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
    return (clone.textContent ?? "").replace(/\s+/gu, "");
  });
}

async function expectOnScreen(page: Page, text: string): Promise<void> {
  expect(await readingFreeText(page)).toContain(text.replace(/\s+/gu, ""));
}

test.use({ viewport: PHONE });

test("ステージの トップに 4本 並ぶ", async ({ page }) => {
  await page.goto("/asakai");
  await expectOnScreen(page, "毎日の 朝礼と 夕礼");
  await expectOnScreen(page, "朝礼と 夕礼");
  await expectOnScreen(page, "朝礼メモ");
  await shot(page, "asakai-00-stage");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

test("朝礼（かんたん）— 報告すると カードが 開く", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  expect(at, "朝礼が ステージに ある").toBeGreaterThan(0);
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await shot(page, "asakai-01-kantan-lobby");
  await joinCall(page);

  /* 板の 上の 1行が「この 4枚は 何か」を 言っている。 */
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expectOnScreen(page, "報告すると 開きます");
  await expectOnScreen(page, "担当");
  await shot(page, "asakai-02-kantan-mon");

  await page
    .locator("#asakai-answer")
    .fill(
      "先週の 金曜日は、ログインの 画面を 作りました。ぜんぶ できました。" +
        "きょうは テストの 一覧を 書いて、テストを 始めます。20こ ぐらいです。" +
        "一覧の 書き方が 分からなくて、こまって います。",
    );
  await page.getByRole("button", { name: "報告する" }).click();

  /* 4枚 そろったので 聞き返しが 無く、その 場面は おわる。 */
  await expect(page.getByText("（4 / 4）")).toBeVisible();
  const owari = page.getByRole("button", { name: /けっかを 見る/ });
  await expect(owari).toBeVisible();
  await shot(page, "asakai-03-kantan-opened");

  expect(await bareKanjiTexts(page)).toEqual([]);

  /* 時間カード → 火曜日へ。 */
  await owari.click();
  await expectOnScreen(page, "月曜日の 朝礼 おわり");
  await shot(page, "asakai-04-kantan-timecard");
  expect(await bareKanjiTexts(page)).toEqual([]);

  await page.getByRole("button", { name: /つづけます/ }).click();
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await shot(page, "asakai-05-kantan-tue");
});

test("夕礼（むずかしい）— メモと カードが 同じ 画面に 並ぶ", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  expect(at, "夕礼が ステージに ある").toBeGreaterThan(0);
  /*
   * 手前を **1本 残して** 開く。ぜんぶ 埋めると ステージが クリアに なり、
   * 「ステージ クリア」の 板が 画面に かぶさって 何も 押せなくなる
   *（`gates: false` の 教材に 先に 当たる、「はじめに」の かくにんテストと 同じ 形）。
   */
  await seedCompleted(context, refs.slice(0, at - 1));

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expectOnScreen(page, "きょうの メモ");
  await expectOnScreen(page, "やること");
  await shot(page, "asakai-06-muzukashii-mon");

  /* 1行では 開かない（`openAt` は 2）。司会が 聞き返す。 */
  await page
    .locator("#asakai-answer")
    .fill("一覧に 日づけと 先生の 名前が 出るように なりました。");
  await page.getByRole("button", { name: "報告する" }).click();
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await shot(page, "asakai-07-muzukashii-probe");

  expect(await bareKanjiTexts(page)).toEqual([]);
});
