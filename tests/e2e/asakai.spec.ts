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

/**
 * 各日の「司会の れい」を つないだ 1本の 報告。
 *
 * `tests/asakai_data.test.ts` が **れいを そのまま 言えば ⭕ に なる**ことを
 * 保証して いる ので、ここでは それを 足場どおりに 話した 人の 入力として 使う。
 */
function exampleUtterances(): string[] {
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "meetings", "asakai_kantan.json"), "utf8"),
  ) as { asakai: { scenes: { panels: { example: { text: string } }[] }[] } };
  return meeting.asakai.scenes.map((scene) =>
    scene.panels.map((panel) => panel.example.text).join(" "),
  );
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

test("ステージの トップに 5本 並ぶ", async ({ page }) => {
  await page.goto("/asakai");
  await expectOnScreen(page, "報連相：報告（朝礼と 夕礼）");
  await expectOnScreen(page, "朝礼と 夕礼");
  await expectOnScreen(page, "朝礼メモ");
  /* 前ばなしの ページ（台帳 #387 の 7〜9）。朝礼の 前に 場面と 役を 渡す。 */
  await expectOnScreen(page, "チームと アプリ");
  await shot(page, "asakai-00-stage");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * 前ばなしの ページ — **朝礼の 前に「何を 作って いるか」と「あなたの 担当」**
 *（台帳 #387 の 7〜9「そもそも何のアプリを作っているのか説明が一切ない」）。
 */
test("前ばなしの ページに アプリと 担当が 書いて ある", async ({ page }) => {
  await page.goto("/asakai/article-asakai_team");
  const skip = page.getByText("それでも 見る");
  if (await skip.count()) await skip.first().click();
  await expectOnScreen(page, "Khmersabai");
  await expectOnScreen(page, "旅行アプリ");
  await expectOnScreen(page, "あなたは ログインの 担当です");
  /* 4人の しょうかいカード（絵は 人物カードから 引く）。 */
  await expectOnScreen(page, "ヘンディ");
  await expectOnScreen(page, "ニャム");
  await shot(page, "asakai-01-team");

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

  /* **見かたは モーダルで 出る。閉じてから 司会と メンバーが 話す**（2026-09-11 の 指定）。 */
  await expect(page.getByRole("dialog", { name: "報告の 見かた" })).toBeVisible();
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();

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
  await expect(page.getByRole("dialog", { name: "報告の 見かた" })).toBeVisible();
  await page.getByRole("button", { name: "つづける" }).click();
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await shot(page, "asakai-07-muzukashii-probe");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **入った ところで、カードの 板と マイクが 同時に 見える**（2026-09-11 の 再発防止）
 *
 * 板（`sticky top-0`）は Zoom の 枠の 中に あり、親に `overflow-hidden` が あると
 * **そこが スクロールの 器に なって** 画面の 外へ 流れて いく。
 * 既存の ミーティングと 同じ 並びに した ので、入った 直後は
 * 「枠 → 板 → 報告パネル（マイク）」が 1画面に 収まる はず。数で 見る。
 */
test("390px で 板 → マイク → チャット の 順に 並ぶ", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  await seedCompleted(context, refs.slice(0, at - 1));
  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  const board = await page.getByRole("group", { name: "カードの 板" }).boundingBox();
  const mic = await page
    .getByRole("button", { name: /マイク|話す/ })
    .first()
    .boundingBox();
  const chat = await page.getByText("テキストチャット").first().boundingBox();

  expect(board).not.toBeNull();
  expect(mic).not.toBeNull();
  expect(chat).not.toBeNull();

  /*
   * 既存の ミーティングと 同じ 並び: 枠（板）→ 報告パネル（マイク）→ 会話の 記録。
   * 前は 場面カードと メモ 10行が あいだに 入り、**チャットが 1500px 下**に あった
   *（2026-09-11 の 指摘「テキストチャットのUIが下にいったら混乱する」）。
   */
  expect(board!.y, "板が いちばん 上").toBeLessThan(mic!.y);
  expect(mic!.y, "マイクが チャットより 上").toBeLessThan(chat!.y);
  /* チャットまでの 高さ。**画面 3つぶんを 超えない**こと。 */
  expect(chat!.y).toBeLessThan(PHONE.height * 3);
  await shot(page, "asakai-08-order-390");
});

/**
 * **途中で 閉じても 月曜に 戻さない**（2026-09-11 の 再発防止）
 *
 * 5日で 30分を 超える ので、1回の 授業で 終わらない ことが ふつうに ある。
 * しおりが 無かった ころは、開き直すたびに 月曜から やり直しだった。
 */
test("月曜を 終えて 開き直すと、火曜から つづく", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await page
    .locator("#asakai-answer")
    .fill(
      "先週の 金曜日は、ログインの 画面を 作りました。ぜんぶ できました。" +
        "きょうは テストの 一覧を 書いて、テストを 始めます。20こ ぐらいです。" +
        "一覧の 書き方が 分からなくて、こまって います。",
    );
  await page.getByRole("button", { name: "報告する" }).click();
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
  await page.getByRole("button", { name: /けっかを 見る/ }).click();
  await expectOnScreen(page, "月曜日の 朝礼 おわり");

  /* ここで 回線が 切れた ことに する。 */
  await page.reload();
  await joinCall(page);
  await expectOnScreen(page, "火曜日");
  await expectOnScreen(page, "2日目");
  await shot(page, "asakai-09-resume-tue");
});

/**
 * **週の けっかが 読める**（2026-09-11 の 再発防止）
 *
 * 「おわった」を けっかを 見せる **前**に 書いて いた ころ、ステージの
 * 「クリア」の 板が けっかの 上に かぶさり、合格か 不合格かが 読めなかった（規律1）。
 * 5日 通して、合否の 字と 数が 画面に 出る ことを 見る。
 */
test("5日 通すと、合否と 数が 読める", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));
  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);

  /* 5日とも、その日の 司会の れいを ぜんぶ つないで 話す（足場どおりに 話した 人）。 */
  for (const [day, utterance] of exampleUtterances().entries()) {
    await page.locator("#asakai-answer").fill(utterance);
    await page.getByRole("button", { name: "報告する" }).click();
    await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
    await page.getByRole("button", { name: /けっかを 見る/ }).click();
    if (day < 4) await page.getByRole("button", { name: /つづけます/ }).click();
  }

  await expectOnScreen(page, "合格");
  await expectOnScreen(page, "以上で 合格");
  await expectOnScreen(page, "聞き返し");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-10-week-result");

  /* 読み終えてから おわりに する（ここまで「クリア」の 板は かぶさらない）。 */
  await page.getByRole("button", { name: "けっかを 読みました" }).click();
});
