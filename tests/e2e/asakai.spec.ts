import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

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
 * 正規表現（`/けっかを 見る/` は ルビの かなを またがない 短い 語）で さがす。
 *
 * 入力欄と ➤ は **ミーティングと 同じ 部品**（`ChatPanel`）に なった ので、
 * 名前も 同じ（「こたえを 入力する」「おくる」）。2026-09-15 の 指定
 *「極力 同じ 環境を そのまま データのみ 差し替えで 使えるように」。
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
function exampleUtterances(id: "asakai_kantan" | "asakai_muzukashii" = "asakai_kantan"): string[] {
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "meetings", `${id}.json`), "utf8"),
  ) as { asakai: { scenes: { panels: { example: { text: string } }[] }[] } };
  return meeting.asakai.scenes.map((scene) =>
    scene.panels.map((panel) => panel.example.text).join(" "),
  );
}

/**
 * ふりがな（`rt`）を 外した **画面の 字**。空白は ぜんぶ 落として 比べる。
 *
 * `<script>` は 落とす。Next.js は 本文の おわりに **教材の JSON を そのまま**
 * 積む（`self.__next_f.push(...)`）ので、`textContent` を そのまま 読むと
 * **画面に 出て いない 字まで 当たる**。「これは 出て いる」を 見る ぶんには
 * 気づかないが、「これは 出て いない」を 見る ときに 黙って 嘘に なる
 *（2026-09-15 に 呼び名の 検査で 実際に 引っかかった）。
 */
async function readingFreeText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const hidden of Array.from(clone.querySelectorAll("script, style, template"))) {
      hidden.remove();
    }
    for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
    return (clone.textContent ?? "").replace(/\s+/gu, "");
  });
}

/**
 * 1つの ポップアップの **画面の 字**（ふりがな `rt` を 外し、空白は ぜんぶ 落とす）。
 *
 * チャットには 司会の 同じ ことばが 残る ので、「ポップアップの 中に だけ 出る／出ない」を
 * 見る ときは `readingFreeText`（ページ ぜんぶ）では なく こちらを 使う。
 */
async function dialogText(dialog: Locator): Promise<string> {
  return dialog.evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const rt of Array.from(copy.querySelectorAll("rt"))) rt.remove();
    return (copy.textContent ?? "").replace(/\s+/gu, "");
  });
}

/**
 * **入室した ときと 曜日が 変わった ときは、報告メモが 自動で 開く**
 *（2026-09-16 の 指定「曜日を クリックした ときや 画面を 開いた ときに、
 * モーダルが 出る ように して ください」）。読んだら 閉じて 先へ 進む。
 */
async function closeDuty(page: Page): Promise<void> {
  const memo = page.getByRole("dialog", { name: "報告メモ" });
  if (await memo.isVisible().catch(() => false)) {
    await memo.getByRole("button", { name: "とじる" }).click();
    await expect(memo).toBeHidden();
  }
}

/**
 * **その日の 評価（モーダル）**を 読んで 閉じる（2026-09-17 の 指定「全て モーダルが よい」）。
 *
 * 「きょうの けっかを 見る ▶」の あとに 出る。中身は 点・項目ごとの けっか・
 * しつもんの ふりかえり。閉じると これまでどおり 時間カードへ 進む。
 */
async function closeDayScore(page: Page): Promise<void> {
  const modal = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(modal).toBeVisible();
  /* 金曜は「みんなの 報告を 聞く」（週の けっかは 先輩の 報告の あとに ボタンで 開く・2026-09-28）。 */
  await modal
    .getByRole("button", { name: /へ 進む|今週の けっかを 見る|みんなの 報告を 聞く/ })
    .click();
  await expect(modal).toBeHidden();
}

async function expectOnScreen(page: Page, text: string): Promise<void> {
  expect(await readingFreeText(page)).toContain(text.replace(/\s+/gu, ""));
}

test.use({ viewport: PHONE });

test("ステージの トップに 教材が 並ぶ", async ({ page }) => {
  await page.goto("/asakai");
  await expectOnScreen(page, "報連相：報告（朝礼と 夕礼）");
  await expectOnScreen(page, "朝礼と 夕礼");
  /* 前ばなしの ページ（台帳 #387 の 7〜9）。朝礼の 前に 場面と 役を 渡す。 */
  await expectOnScreen(page, "KhmerSabaiの 朝礼");
  /* 夕礼の 前ばなし（Next Talent）。2026-09-14 に 足した。 */
  await expectOnScreen(page, "Next Talent");
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
  await expectOnScreen(page, "KhmerSabai");
  /* 決済開発編に なった（旧: 旅行アプリ）。いま 作って いるのは 決済の ところ。 */
  await expectOnScreen(page, "決済");
  /* 担当の カード 4枚（奥田・ニャム・あなた・ヘンディ）。 */
  await expectOnScreen(page, "決済：フロントエンド");
  await expectOnScreen(page, "ヘンディ");
  await expectOnScreen(page, "ニャム");
  await expectOnScreen(page, "奥田");
  /* 藤木さん（社長からの 依頼を 伝える 人）。 */
  await expectOnScreen(page, "藤木");
  /* 朝礼で 話す 4つ。 */
  await expectOnScreen(page, "きのう したこと");
  await expectOnScreen(page, "きょう すること");
  await shot(page, "asakai-01-team");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * 夕礼の 前ばなし — **Next Talent が 何で、あなたが 何を 担当するか**
 *（2026-09-14 の 指定。上級は 作業記録だけを 渡す ので、場面と 役は ここで 渡す）。
 */
test("夕礼の 前ばなしに Next Talent と 担当が 書いて ある", async ({ page }) => {
  await page.goto("/asakai/article-yuurei_nexttalent");
  const skip = page.getByText("それでも 見る");
  if (await skip.count()) await skip.first().click();
  await expectOnScreen(page, "Next Talent");
  await expectOnScreen(page, "学生検索・スキル可視化フロントエンド");
  /*
   * データの ながれ（ニャム → ヘンディ → あなた → 奥田 → あなた）。
   * 2026-09-20 の 指定で **5行の 文を 1枚の 絵に 置きかえた**（ユーザー承認）——
   * 同じ ことを 字と 絵で 二重に 出さない（constraints 2026-09-14）。
   * 画面に のこる 字は 見出しと、あなたの 担当が どこかを 言う ひとこと。
   */
  await expectOnScreen(page, "データは こう つながる");
  await expectOnScreen(page, "まん中の 学生詳細画面は 奥田さんの 担当です");
  /* 作業記録の 読み上げと 仕事の 報告の くらべ。 */
  await expectOnScreen(page, "作業記録の 読み上げ");
  await expectOnScreen(page, "仕事の 報告");
  /* 勤務時間と 夕礼の 時間。 */
  await expectOnScreen(page, "17:50");
  await shot(page, "asakai-05b-nexttalent");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * 朝礼ページ 7節 — 書きこみフォーム（2026-10-07 の 指定「入力フォームで朝礼の内容を
 * 埋めてもらいます。一度入れたものは入力フォームの下に本人が参照できるようにします」）。
 *
 * 型の 空いた ところを うめて 保存すると、すぐ 下の「あなたが 書いた 朝礼」に 出る。
 * デモモード（鍵ゼロ）では 端末に 置かれる ので、開き直しても 残る。
 * 欄は ルビで 名前が 引けない ので、`aria-label`（ルビ前の 字）で さがす。
 */
test("朝礼ページ 7節: フォームに 書いて 保存すると、すぐ 下に 出る", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/asakai/article-asakai_lecture");
  const skip = page.getByText("それでも 見る");
  if (await skip.count()) await skip.first().click();

  const form = page.getByTestId("article-form");
  await form.scrollIntoViewIfNeeded();
  const entries = page.getByTestId("article-form-entry");
  /* 見出しの「朝礼」は 辞書の ことば（押せる）なので、ボタンは 名前で さがす */
  const save = form.getByRole("button", { name: "保存する", exact: true });
  await expect(form.getByTestId("article-form-history")).toBeVisible();
  await expect(entries).toHaveCount(0);

  /* 空の まま 押すと 保存しない。4つの 欄 それぞれで、足りない ことを はっきり 言う。 */
  await save.click();
  await expect(form.getByRole("alert")).toHaveCount(4);
  await expect(entries).toHaveCount(0);

  await page.getByLabel("① きのう したこと（1つめの 書く ところ）").fill("商品名と 値段を 表示");
  await page.getByLabel("② 機能の 進捗（1つめの 書く ところ）").fill("商品一覧");
  /* ％の 欄は 0〜100 の 数字だけ。120 は 言い直しに なる。 */
  await page.getByLabel("② 機能の 進捗（2つめの 書く ところ）").fill("120");
  await page.getByLabel("③ きょう すること（1つめの 書く ところ）").fill("商品画像を 表示");
  await form.getByRole("checkbox").check();
  await save.click();
  await expect(form.getByRole("alert")).toHaveCount(1);
  await expect(entries).toHaveCount(0);

  /* 全角でも 受ける。④は「問題は ありません。」を えらんだ まま。 */
  await page.getByLabel("② 機能の 進捗（2つめの 書く ところ）").fill("６０");
  await save.click();
  await expect(entries).toHaveCount(1);

  const written = async () =>
    entries.first().evaluate((element) => {
      const clone = element.cloneNode(true) as HTMLElement;
      for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
      return (clone.textContent ?? "").replace(/\s+/gu, "");
    });
  expect(await written()).toContain("きのうは、商品名と値段を表示しました。");
  expect(await written()).toContain("商品一覧機能の進捗は、60％です。");
  expect(await written()).toContain("きょうは、商品画像を表示します。");
  expect(await written()).toContain("問題はありません。");
  /* 保存したら 欄は 空に もどる（つづけて もう1回 書ける）。 */
  await expect(page.getByLabel("① きのう したこと（1つめの 書く ところ）")).toHaveValue("");
  await shot(page, "asakai-lecture-form");
  expect(await bareKanjiTexts(page)).toEqual([]);

  /* 開き直しても 残る（本人の 端末の 写し）。 */
  await page.reload();
  const again = page.getByText("それでも 見る");
  if (await again.count()) await again.first().click();
  await expect(page.getByTestId("article-form-entry")).toHaveCount(1);
});

test("朝礼（かんたん）— 報告すると カードが 開く", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  expect(at, "朝礼が ステージに ある").toBeGreaterThan(0);
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await shot(page, "asakai-01-kantan-lobby");
  await joinCall(page);
  await closeDuty(page);

  /* 板の 上の 1行が「この 4枚は 何か」を 言っている。 */
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expectOnScreen(page, "報告すると 開きます");

  /*
   * **司会は 名指しで 呼ぶ**（2026-09-15 の 指定）。画面には ずっと
   *「では 次に ◯◯さん、お願いします。」と 目印の まま 出て いた。
   * この 通しは 端末に 呼び名を 置かずに 始める ので、呼びかけごと 落ちる
   *（「あなたさん」に しない）。名前が ある ときの 埋め方は
   * `tests/meeting_speech.test.ts` が 固定して いる。
   */
  const board = await readingFreeText(page);
  expect(board, "呼び名の 目印が 画面に 残って いない").not.toContain("◯◯さん");
  expect(board).toContain("では次にお願いします。");
  /* 型文の ◯◯（学習者が 埋める 空欄）は 消さない。 */
  await page.getByRole("button", { name: "ヒント" }).click();
  /* 月曜の 型文は「きのうは」では なく **先週の 金曜日**（2026-09-17 の 指定）——
     月曜の「きのう」が 金曜だと 覚えさせない。 */
  await expectOnScreen(page, "先週の 金曜日は ◯◯を しました");
  await page.getByRole("dialog").getByRole("button", { name: "とじる" }).click();

  /*
   * 担当・進捗・きょう する ことは **画面に 出しっぱなしに しない**
   *（2026-09-13 の 指定）。ボタンで 開き、読んだら 閉じる。
   * 入室ぶんは 上で 閉じて いる ので、ここは **ボタンで 開き直せる**ことを 見る。
   */
  await page.getByRole("button", { name: "報告メモを 見る" }).click();
  const dutyModal = page.getByRole("dialog", { name: "報告メモ" });
  await expect(dutyModal).toBeVisible();
  /* 2026-10-09 に 教材の 呼び名が「決済フロントエンド機能」→「決済フロントエンド」に そろった。 */
  await expectOnScreen(page, "決済フロントエンド");
  await expectOnScreen(page, "進捗");
  /*
   * **月曜は ACLEDA Pay が まだ 無い**（社長の 要望は 火曜の 午後）。
   * つなぐ 先も ABA だけ（2026-09-16 の 指定）。
   */
  /*
   * **並びは 報告の 4つの 型と 同じ**（2026-09-16 の 指定
   *「進捗を 昨日したことの 次に 入れて ください」）。メモを 上から 読めば
   * そのまま 報告の 順に なる——ここが 入れ替わると、板の 4枚の カードとも ずれる。
   */
  const memoOrder = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"] dt')).map((dt) => {
      const clone = dt.cloneNode(true) as HTMLElement;
      for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
      return (clone.textContent ?? "").replace(/\s+/gu, "");
    }),
  );
  expect(memoOrder).toEqual([
    "📅きのうしたこと（先週の金曜日・9/18）",
    "📊進捗",
    "▶きょうすること（9/21月曜日）",
    "❗問題・確認",
  ]);

  const memoText = await readingFreeText(page);
  expect(memoText).toContain("決済APIとつなぐ（ABA）");
  expect(memoText, "月曜に ACLEDA Pay が 出て いる").not.toContain("ACLEDAPayをえらぶ");
  await shot(page, "asakai-02-kantan-duty");
  /* ポップアップが 開いて いる あいだも 裸の 漢字は 0。 */
  expect(await bareKanjiTexts(page)).toEqual([]);
  /*
   * **中身は 写せない**（2026-09-16 の 指定「モーダルの コピペは 禁止に して ください」）。
   * そのまま 貼れると、報告を 一度も 作らずに カードが 開く 抜け道に なる。
   */
  const copyGuard = await page.evaluate(() => {
    const island = document.querySelector('[role="dialog"] .card-island') as HTMLElement | null;
    if (!island) return null;
    /* React は 根で 受ける ので **bubbles を 立てる**（立てないと 届かない）。 */
    const blocked = !island.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true }),
    );
    return { select: getComputedStyle(island).userSelect, blocked };
  });
  expect(copyGuard?.select).toBe("none");
  expect(copyGuard?.blocked, "コピーが 止まって いない").toBe(true);
  await dutyModal.getByRole("button", { name: "とじる" }).click();
  await expect(dutyModal).toBeHidden();
  await shot(page, "asakai-02-kantan-mon");

  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
        "今、決済フロントエンド機能の 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  /*
   * **1本で ぜんぶ 言えた 日は、まとめの 1枚だけ**（2026-09-18 の 指定
   *「一回で 全部 言えた 時の モーダルは 最後の まとめの ものに できますか？」）。
   * 前は「報告の 見かた」→（閉じる）→「きょうの 評価」と 同じ ことを 2枚 読ませて いた。
   * きょうの 評価は **自動で 開く**（押さなくて よい）。
   *
   * 数えるのは **開いて いる あいだ**（2026-09-15 の 通しプレイ検収）。
   * 閉じた あとの 検査は モーダルを 見て いない。
   */
  await expect(page.getByRole("dialog", { name: "報告の 見かた" })).toHaveCount(0);
  await expect(page.getByText("（4 / 4）")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "今日の 評価" })).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-03-kantan-opened");

  await expectOnScreen(page, "きょうの 評価");
  await expectOnScreen(page, "項目ごとの けっか");
  /*
   * **仕組みの ことば（AI・鍵・見かた）を 画面に 出さない**（2026-09-23 の 指定）。
   * 見て いない ものさしは 箱の「—」が そのまま 言う。
   */
  await expect(page.getByText("AIの 鍵が ある ときに 出ます")).toHaveCount(0);
  await expect(page.getByText("合格に 効くのは")).toHaveCount(0);
  /* **代わりに 何が 出るか**も 見る——「—」だけだと 0点に 見える（R5 検収）。 */
  await expectOnScreen(page, "まだ 見て いません");
  /*
   * **なぜ 出ないかを 名前で 言い、登録の 行き先まで 出す**（2026-09-23 の 指定）。
   * E2E は 鍵ゼロで 走る ので、ここに 出るのは いつも「キーが 無い」の 側。
   */
  await expectOnScreen(page, "APIキーが 登録されて いません");
  await expect(page.getByRole("link", { name: /せっていを ひらく/ })).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-03b-day-score");
  await closeDayScore(page);
  await expectOnScreen(page, "月曜日の 朝礼 おわり");
  await shot(page, "asakai-04-kantan-timecard");
  expect(await bareKanjiTexts(page)).toEqual([]);

  await page.getByRole("button", { name: /つづけます/ }).click();
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();

  /*
   * **済んだ 日は タブが 緑に なる**（2026-09-14 の 通し検収で「永久に 付かない」
   * ことが 分かった。`DayResult.day` は "月曜日"、`scene.day` は "mon" で
   * そのまま 比べて いた）。タブで 飛べる のに どこが 済んだか 読めないと、
   * 行き来できる ことが かえって 迷子を 作る。
   * ※ 時間カードの あいだ タブは 描かれない ので、火曜に 入ってから 見る。
   */
  await expect(page.getByRole("button", { name: /月曜日・報告 ずみ/ })).toBeVisible();
  await shot(page, "asakai-05-kantan-tue");
});

test("夕礼（むずかしい）— メモと カードが 同じ 画面に 並ぶ", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  expect(at, "夕礼が ステージに ある").toBeGreaterThan(0);
  /*
   * 手前を **ぜんぶ** 開く。夕礼に 関門（`gates`）を 戻した ので（2026-09-14 の R9 検収
   * 「ステージ最大の 産出が 素通りできる」）、1本 残すと 夕礼が 開かない。
   * 手前が ぜんぶ 済んでも **夕礼 自身が 未了**なので、ステージは クリアに ならない。
   */
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);
  await closeDuty(page);

  await expect(page.getByText("（0 / 4）")).toBeVisible();
  /* 上級の 4枚（初級と 同じ 型で、向きだけ ちがう）。 */
  await expectOnScreen(page, "今日 行ったこと");
  await expectOnScreen(page, "進捗率");
  await expectOnScreen(page, "明日 行うこと");

  /*
   * 上級は **作業記録（時間順）だけ**を 渡す。整理ずみの 報告文は 出さない
   *（2026-09-14 の 原本）。カードは ［報告メモ］の 中に ある。
   */
  await page.getByRole("button", { name: "報告メモを 見る" }).click();
  const yuureiDuty = page.getByRole("dialog", { name: "報告メモ" });
  await expect(yuureiDuty).toBeVisible();
  await expectOnScreen(page, "きょうの メモ");
  await expectOnScreen(page, "09:00");
  await expectOnScreen(page, "学生一覧API");
  await expectOnScreen(page, "やること");
  await shot(page, "asakai-06-muzukashii-duty");
  await yuureiDuty.getByRole("button", { name: "とじる" }).click();
  await expect(yuureiDuty).toBeHidden();
  await shot(page, "asakai-06-muzukashii-mon");

  /* 1行では 開かない（`openAt` は 2）。司会が 聞き返す。 */
  await page.getByLabel("こたえを 入力する").fill("学生一覧APIと 接続しました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(page.getByRole("dialog", { name: "報告の 見かた" })).toBeVisible();
  await page.getByRole("button", { name: "つづける" }).click();
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await shot(page, "asakai-07-muzukashii-probe");

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **作業記録を そのまま 読み上げても 開かない**（2026-09-14 の 再発防止）
 *
 * これが 無かった ころ、記録を 1文字も 変えずに 読み上げるだけで
 * **5日 とも 合格**して いた（21こ中 16こ・合格ラインは 11）。
 * 教材の あたまは「作業記録を そのまま 読み上げません」と 書いて いるのに、
 * 判定が 一度も そこを 見て いなかった。
 *
 * 鍵ゼロの まま 走る——止めて いるのは アプリ側の 決まった 見わけ方で、
 * AIの 見立ては そこに 重ねるだけ（`readsLog`）。
 */
test("夕礼 — 作業記録を そのまま 読み上げると 差し戻される", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();

  /* 月曜の 記録の 冒頭を 時刻ごと そのまま。中身の ことばは ぜんぶ 当たる はず。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "09:00 学生一覧APIの 仕様を 確認。09:30 学生一覧APIとの 接続開始。" +
        "10:30 AUPP・CADTの 学生データ 表示完了。11:00 キーワード検索UIを 作成。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  const judge = page.getByRole("dialog", { name: "報告の 見かた" });
  await expect(judge).toBeVisible();
  await expectOnScreen(page, "この ぶんは 数えて いません");
  await shot(page, "asakai-08-muzukashii-marumi");
  await page.getByRole("button", { name: "つづける" }).click();

  /* 1枚も 開いて いない。板は 入った ときと 同じ。 */
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  /* 司会は 教材と 同じ ことばで 言い直しを たのむ。 */
  await expectOnScreen(page, "大きな 作業を 2つか 3つに まとめて");

  /* まとめて 話せば ふつうに 開く（差し戻しが 正しい 報告を 巻き込まない）。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("今日は 学生一覧APIと つないで、キーワード検索と 大学フィルターを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(judge).toBeVisible();
  await expectOnScreen(page, "今日 行ったこと");
  await page.getByRole("button", { name: "つづける" }).click();
  await expect(page.getByText("（1 / 4）")).toBeVisible();

  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **夕礼も 同じ — 伝わらない 回は「もう一度報告」だけ**（2026-10-09 の 決定）
 *
 * 聞き返しの ポップアップは 朝礼と 夕礼で 同じ 部品。伝わらない 回の 道は
 *「もう一度報告」の 1つで、押すと 同じ しつもんの まま 答え直す（伝わるまで 何回でも）。
 *
 * **作業記録の 読み上げだけは 例外。** 司会が「大きな 作業を まとめて、もう いちど」と
 * 頼む いつもの 動きの まま（押し先は ポップアップを 閉じる）で、**回数も 数える**——
 * 3回 つづくと その 札は 聞けなかった ことに なる。打ち切りが 残る のは ここだけ。
 */
test("夕礼: 伝わらない 回は もう一度報告 だけ（作業記録の 読み上げは 打ち切りが 残る）", async ({
  page,
  context,
}) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);
  await closeDuty(page);

  const send = async (text: string) => {
    await page.getByLabel("こたえを 入力する").fill(text);
    await page.getByRole("button", { name: "おくる" }).click();
  };

  /* 1行では 開かない → 司会が 聞き返す。 */
  await send("学生一覧APIと 接続しました。");
  await page.getByRole("button", { name: "つづける" }).click();
  await expect(page.getByText("（0 / 4）")).toBeVisible();

  /* 伝わらない 回は 上限（2回）を 超えても「もう一度報告」だけ。打ち切りに ならない。 */
  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  for (let round = 0; round < 3; round += 1) {
    await send("よろしく お願いします。");
    await expect(probe).toBeVisible();
    await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(1);
    await expect(probe.getByRole("button", { name: /つぎの しつもんを 聞く/ })).toHaveCount(0);
    expect(await dialogText(probe)).not.toContain("ここまでです");
    expect(await bareKanjiTexts(page)).toEqual([]);
    await probe.getByRole("button", { name: "もう一度報告" }).click();
    await expect(probe).toBeHidden();
  }
  await expect(page.getByText("（0 / 4）")).toBeVisible();

  /* 作業記録の 読み上げ: 字は「もう一度報告」。押すと 司会が まとめて もう いちどと 頼む。 */
  const logText =
    "09:00 学生一覧APIの 仕様を 確認。09:30 学生一覧APIとの 接続開始。" +
    "10:30 AUPP・CADTの 学生データ 表示完了。11:00 キーワード検索UIを 作成。";
  await send(logText);
  await expect(probe).toBeVisible();
  await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(1);
  expect(await dialogText(probe)).toContain("このぶんは数えていません");
  await probe.getByRole("button", { name: "もう一度報告" }).click();
  await expect(probe).toBeHidden();
  await expectOnScreen(page, "大きな 作業を 2つか 3つに まとめて");

  /* もう 1回 読み上げると、その 札は 打ち切り（回数を 数えて いた ぶん）。 */
  await send(logText);
  const report = page.getByRole("dialog", { name: "報告の 見かた" });
  await expect(report).toBeVisible();
  expect(await dialogText(report)).toContain("はここまでです");
  await report.getByRole("button").last().click();
  await expectOnScreen(page, "聞けませんでした");
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
  await seedCompleted(context, refs.slice(0, at));
  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);
  await closeDuty(page);

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
 * しごとの 表の 絵（願い #441）— **絵が どの しごとかを 言う**
 *
 * 2026-09-16 の 指定「画像は イメージでは なく、具体的に 何を して いるかを はかる
 * 重要な 要素です」。学習者は「決済」「注文」「処理」を まだ 読めないので、
 * 絵が 出て いなければ この 表は 読めない。だから **出て いる ことと
 * 読めて いる こと**（壊れた 絵の 四角に なって いない こと）を 見る。
 */
test("朝礼: しごとの 表に 絵が 出て、押すと ひろがる", async ({ page, context }) => {
  const refs = stageRefs();
  await seedCompleted(context, refs.slice(0, refs.indexOf("asakai_kantan")));
  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);

  const memo = page.getByRole("dialog", { name: "報告メモ" });
  await expect(memo).toBeVisible();
  const table = memo.locator("table").first();
  await table.scrollIntoViewIfNeeded();

  /* 月曜の しごとは 9件（ACLEDA Pay は 水曜から）。ぜんぶに 絵が ついて いる。 */
  const pictures = table.locator("img");
  await expect(pictures).toHaveCount(9);
  await page.waitForFunction(
    () => {
      const all = [...document.querySelectorAll('[role="dialog"] table img')];
      return all.length > 0 && all.every((one) => (one as HTMLImageElement).complete);
    },
    undefined,
    { timeout: 15_000 },
  );
  const broken = await pictures.evaluateAll((all) =>
    all
      .filter((one) => !(one as HTMLImageElement).naturalWidth)
      .map((one) => (one as HTMLImageElement).src),
  );
  expect(broken, "読めない 絵が ある").toEqual([]);
  await shot(page, "asakai-02c-kantan-tasks");

  /*
   * 80px は 並びを 目で 追う ための 大きさ。中を 見たい ときの 逃げ道が
   * `ZoomableImage`（記事の さし絵と 同じ 包み）。
   */
  await table
    .getByRole("button", { name: /決済の 画面/ })
    .first()
    .click();
  const back = page.getByRole("button", { name: "✕ もどす" });
  await expect(back).toBeVisible();
  await back.click();
});

/**
 * 夕礼の しごとの 表にも **しごとごとの 絵が 出る**（2026-09-18 の 判断 A）。
 * 絵は「Next Talent の 夕礼」ページの しごとカードと 同じ 5枚。
 *
 * もとは「夕礼の しごとは 絵を 持って いない ので 欄を 広げない」を 見る テストだった
 *（390px では 表の 幅が 318px しか なく、絵の 無い 表で 88px を 空欄に 使うと
 * しごとの 名前に 134px しか 残らない。2026-09-16 の 検収）。夕礼の 表にも 絵が 入り、
 * 教材の 中に 絵の 無い 表が 無く なった ので、その 守りは 部品を じかに 描く
 * 単体テスト（`tests/asakai_progress_boxes.test.tsx`）へ 移した（同日・ユーザー承認）。
 */
test("夕礼: しごとの 表に 5枚の 絵が 出て、絵の 欄が 広がる", async ({ page, context }) => {
  const refs = stageRefs();
  await seedCompleted(context, refs.slice(0, refs.indexOf("asakai_muzukashii")));
  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  const memo = page.getByRole("dialog", { name: "報告メモ" });
  await expect(memo).toBeVisible();
  const table = memo.locator("table").first();
  await expect(table.locator("img")).toHaveCount(5);
  const firstCell = table.locator("tbody tr").first().locator("td").first();
  const box = await firstCell.boundingBox();
  expect(box!.width, "絵が あるのに 欄が せまい").toBeGreaterThan(80);
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
  await closeDuty(page);
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
        "今、決済フロントエンド機能の 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();
  await closeDayScore(page);
  await expectOnScreen(page, "月曜日の 朝礼 おわり");

  /* ここで 回線が 切れた ことに する。 */
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expectOnScreen(page, "火曜日");

  /*
   * **その日を はじめから やり直せる**（2026-09-21 の 指定）。
   * これまで やり直せるのは「きょうの 評価」の 中だけで、報告の さいちゅうに
   * 気が 変わった 人（言い方を 変えたい）に 道が 無かった。
   */
  await expect(page.getByRole("button", { name: "この日を はじめから やり直す" })).toBeVisible();
  await shot(page, "asakai-17-restart-day");
  /* いまが 何日目かは **タブの えらばれ方**で 見る（2026-09-13 に 点から タブへ）。 */
  await expect(page.getByRole("button", { name: /火曜日/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await shot(page, "asakai-09-resume-tue");

  /*
   * **終わって いない 日は 開かない**（2026-09-15 の 指定「曜日の クリックは
   * 終わらないと 解放しない もともとの UIの ロジックを 踏襲して」）。
   *
   * ミーティングの 帯と 同じ 決まり——`02 …に しつもん` は ラウンド1を 終えるまで 🔒。
   * 2026-09-13 に「その日へ 直接 飛べる」ように した ぶんは、**済んだ 日へ 戻る**
   * ところだけ 残る（月曜は 報告 ずみ なので 押せる）。
   */
  await expect(page.getByRole("button", { name: /木曜日/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /金曜日/ })).toBeDisabled();
  await expectOnScreen(page, "ぜんぶ 報告すると 開きます");
  /* 済んだ 月曜へは 戻れる。 */
  await page.getByRole("button", { name: /月曜日/ }).click();
  await expect(page.getByRole("button", { name: /月曜日/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await shot(page, "asakai-09b-locked-thu");
});

/**
 * **5日目を 終えた 瞬間に 修了証が 出る**（2026-10-06 の 指定・願い #562 の 第2段）
 *
 * 週の けっかの ポップアップの 中に 正式な 修了証（デモでは 見本）。パーフェクト＝
 * 5日とも その日の ことを ぜんぶ 言えて 週も 合格（回答「取りこぼしなし」）。
 */
test("5日 通すと、週の けっかに 修了証が 出る", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));
  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  for (const [day, utterance] of exampleUtterances().entries()) {
    await page.getByLabel("こたえを 入力する").fill(utterance);
    await page.getByRole("button", { name: "おくる" }).click();
    await closeDayScore(page);
    if (day < 4) {
      await page.getByRole("button", { name: /つづけます/ }).click();
      await closeDuty(page);
    }
  }
  await page.getByRole("button", { name: "今週の けっかを 見る" }).click();
  const week = page.getByRole("dialog", { name: "今週の けっか" });
  const cert = week.locator('[data-certificate="ready"]');
  await expect(cert).toBeVisible();
  await expect(cert).toHaveAttribute("data-official", "false");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await cert.scrollIntoViewIfNeeded();
  await shot(page, "asakai-11-week-certificate");
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
  await closeDuty(page);

  /* 5日とも、その日の 司会の れいを ぜんぶ つないで 話す（足場どおりに 話した 人）。 */
  for (const [day, utterance] of exampleUtterances().entries()) {
    await page.getByLabel("こたえを 入力する").fill(utterance);
    await page.getByRole("button", { name: "おくる" }).click();
    await closeDayScore(page);
    if (day < 4) {
      await page.getByRole("button", { name: /つづけます/ }).click();
      await closeDuty(page);
    }
  }

  /*
   * **金曜は 週の けっかを 自動で 開かない**（2026-09-28 の code-critic 検収）。
   * 開くと 合否を 読んで いる うしろで 朝の 先輩の 声が 流れ、「この あと あった こと」
   *（午後）と 時間が 逆に なる。先輩の 報告の あと、ボタンで 開く。
   */
  const week = page.getByRole("dialog", { name: "今週の けっか" });
  await expect(week).toBeHidden();
  await page.getByRole("button", { name: "今週の けっかを 見る" }).click();
  /* けっかは ポップアップで 出る（2026-09-17 の 指定「全て モーダルが 良いです」）。 */
  await expect(week).toBeVisible();
  /* 金曜の 午後の できごと（C4: 9:00 の 朝礼では 話さない）。 */
  await expectOnScreen(page, "この あと あった こと");
  await expectOnScreen(page, "合格");
  await expectOnScreen(page, "以上で 合格");
  await expectOnScreen(page, "聞き返し");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-10-week-result");

  /*
   * **週の けっかを 閉じる 前に 開き直しても 5日ぶんが 消えない**（2026-09-28 の 点検 B4）。
   * 前は 5日 そろった しおりを「完走ずみ」と して 月曜の 白紙に 戻し、完了も 付かなかった。
   */
  const done = await page.evaluate(() =>
    window.localStorage.getItem("nexmax:v1:content:asakai_kantan"),
  );
  expect(done, "5日 そろった ところで 完了が 付いて いない").toContain("completed");
  await page.reload();
  await joinCall(page);
  await expect(week).toBeVisible();
  await expectOnScreen(page, "以上で 合格");

  /* 読み終えてから おわりに する（ここまで「クリア」の 板は かぶさらない）。 */
  await week.getByRole("button", { name: /けっかを 読みました/ }).click();
  await expect(week).toBeHidden();

  /* 閉じた あとも、数を もう いちど 見に 行ける。 */
  await page.getByRole("button", { name: "今週の けっかを 見る" }).click();
  await expect(week).toBeVisible();
  await expectOnScreen(page, "以上で 合格");

  /*
   * **月曜日から もう いちど**（2026-09-28 の 点検 B6）。前は「もう いちど はじめから
   * 話すと…」と 言うだけで ボタンが 無く、再読み込みしか 道が 無かった。
   */
  await week.getByRole("button", { name: "月曜日から もう いちど" }).click();
  await expect(week).toBeHidden();
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expect(page.getByRole("button", { name: /月曜日/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
});

/** 各日の 札ごとの「司会の れい」（札の id と 見本）。 */
function panelExamples(): { id: string; text: string }[][] {
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "meetings", "asakai_kantan.json"), "utf8"),
  ) as { asakai: { scenes: { panels: { id: string; example: { text: string } }[] }[] } };
  return meeting.asakai.scenes.map((scene) =>
    scene.panels.map((panel) => ({ id: panel.id, text: panel.example.text })),
  );
}

/**
 * **★ 1回で ぜんぶ 言えた 曜日と、その 曜日だけ 話し直す 道**（2026-09-29 の 指定
 *「最終的には 各曜日 一度で 伝えられる ように なると いい」・A）。
 *
 * 合格の 線は そのまま、★は その 上の 目標。★の ない 曜日には「もう いちど」が あり、
 * 話し直して 評価を 閉じると 次の 曜日へ 進まずに 週の けっかへ 戻る。
 *
 * **同じ 授業の 中で 5日 通してから** 話し直す（code-critic 検収 E1）。しおりを 直に
 * 仕込むと「お手本を 見た 日」の 印が 空の まま 始まり、話し直しで 印を 外す ところを
 * 消しても 緑の ままに なる。
 */
test("★の ない 曜日だけ 話し直すと、週の けっかに 戻って ★が 付く", async ({ page, context }) => {
  test.slow();
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));
  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  const send = async (text: string) => {
    await page.getByLabel("こたえを 入力する").fill(text);
    await page.getByRole("button", { name: "おくる" }).click();
  };
  const day = page.getByRole("dialog", { name: "今日の 評価" });
  for (const [at2, panels] of panelExamples().entries()) {
    if (at2 === 2) {
      /* 水曜だけ 問題を 言い忘れて、聞き返しで こたえる（★の 付かない 日）。 */
      await send(
        panels
          .filter((one) => one.id !== "komari")
          .map((one) => one.text)
          .join(" "),
      );
      await page
        .getByRole("dialog", { name: "報告の 見かた" })
        .getByRole("button", { name: /報告を つづける/ })
        .click();
      await send(panels.find((one) => one.id === "komari")?.text ?? "");
      await page
        .getByRole("dialog", { name: "追加の しつもんへの こたえ" })
        .getByRole("button", { name: /きょうの 評価を 見る/ })
        .click();
      await expect(day).toBeVisible();
      /* ルビが 入るので 字では 引けない（常に 0件に なる）。rt を 外した 字で 見る。 */
      const plain = await day.evaluate((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
        return (clone.textContent ?? "").replace(/\s+/gu, "");
      });
      expect(plain).toContain("ぜんぶ伝えられました");
      expect(plain).not.toContain("1回でぜんぶ言えました");
    } else {
      await send(panels.map((one) => one.text).join(" "));
      await expect(day).toBeVisible();
      /* ★を 取った ことは その日の 評価で すぐ 分かる（R5 検収）。 */
      await expectOnScreen(page, "1回で ぜんぶ 言えました");
    }
    await closeDayScore(page);
    if (at2 < 4) {
      await page.getByRole("button", { name: /つづけます/ }).click();
      await closeDuty(page);
    }
  }

  const week = page.getByRole("dialog", { name: "今週の けっか" });
  await page.getByRole("button", { name: "今週の けっかを 見る" }).click();
  await expect(week).toBeVisible();
  await expectOnScreen(page, "1回で ぜんぶ 言えた 曜日 4 / 5");
  await expectOnScreen(page, "★は 合格の 数に 入りません");
  await expectOnScreen(page, "★が ない 曜日だけ 話し直せます");
  /* 「もう いちど」は ★の ない 水曜日だけ。 */
  await expect(week.getByRole("button", { name: "水曜日を もう いちど" })).toBeVisible();
  await expect(week.getByRole("button", { name: "月曜日を もう いちど" })).toHaveCount(0);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-21-week-stars");

  /* 押しまちがえても、話さずに 週の けっかへ 戻れる（code-critic 検収）。 */
  await week.getByRole("button", { name: "水曜日を もう いちど" }).click();
  await expect(week).toBeHidden();
  await closeDuty(page);
  await page.getByRole("button", { name: "話し直しを やめて 今週の けっかに もどる" }).click();
  await expect(week).toBeVisible();
  await expectOnScreen(page, "1回で ぜんぶ 言えた 曜日 4 / 5");

  /*
   * **話し直しの 途中で 開き直しても、同じ 曜日の「もう いちど」で 続きから**（通しプレイ検収）。
   * 前は「もう いちど」が 途中の 控えを 捨てて いて、3/4 まで 言えて いても 0/4 に 戻った。
   */
  const wed = panelExamples()[2] ?? [];
  await week.getByRole("button", { name: "水曜日を もう いちど" }).click();
  await expect(week).toBeHidden();
  await closeDuty(page);
  await send(
    wed
      .filter((one) => one.id !== "komari")
      .map((one) => one.text)
      .join(" "),
  );
  await page
    .getByRole("dialog", { name: "報告の 見かた" })
    .getByRole("button", { name: /報告を つづける/ })
    .click();
  await page.reload();
  await joinCall(page);
  await expect(week).toBeVisible();
  await week.getByRole("button", { name: "水曜日を もう いちど" }).click();
  await closeDuty(page);
  await expect(page.getByText("（3 / 4）")).toBeVisible();

  /* はじめから 1本で 話し直す（聞き返し 0回）。 */
  await page.getByRole("button", { name: "この日を はじめから やり直す" }).click();
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expect(page.getByRole("button", { name: /水曜日/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await send(exampleUtterances()[2] ?? "");
  await expect(day).toBeVisible();
  await expectOnScreen(page, "1回で ぜんぶ 言えました");
  /* 話し直しの 評価では「もう いちど 報告する」を 出さない（数える 道は 週の けっかの 1つ）。 */
  await expect(day.getByRole("button", { name: "もう いちど 報告する" })).toHaveCount(0);
  /* 木曜へ 進まずに、週の けっかへ 戻る。 */
  await day.getByRole("button", { name: /今週の けっかに もどる/ }).click();
  await expect(day).toBeHidden();
  await expect(week).toBeVisible();
  await expectOnScreen(page, "1回で ぜんぶ 言えた 曜日 5 / 5");
  await expect(week.getByRole("button", { name: /を もう いちど/ })).toHaveCount(0);
  await shot(page, "asakai-22-week-stars-redone");

  /* 話し直した けっかは しおりに 残る（週の けっかを 閉じる 前に 開き直しても）。 */
  await page.reload();
  await joinCall(page);
  await expect(week).toBeVisible();
  await expectOnScreen(page, "1回で ぜんぶ 言えた 曜日 5 / 5");
});

/**
 * **報告の 途中で 開き直しても、板と 会話が 残る**（2026-09-17 の 指定
 *「回答結果が リセットされて しまう。…ストレージ保管して 再現できるように」）
 *
 * 前は 終わった 日しか 残して いなかった ので、話しかけた ところで 画面を 閉じると
 * **その日は はじめから**に なった。授業では 途中で 別の 日を 見に 行く ことも あるし、
 * 回線も 切れる。開いた カードは 端末に 残す。
 */
test("報告の 途中で 開き直しても、開いた カードが 残る", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();

  /* きのう した ことだけ 言う（1枚 開く）。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").first().click();
  await expect(page.getByText("（1 / 4）")).toBeVisible();

  /* ここで 画面を 閉じた ことに する。 */
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByText("（1 / 4）"), "開き直したら 板が 空に なった").toBeVisible();
  /* 会話も 残って いる（相手が どこまで 聞いたかが 読める）。 */
  await expectOnScreen(page, "先週の 金曜日は、決済の 決まりを 調べて");
});

/**
 * **聞き返しへの こたえにも 見かたが 出る**（2026-09-17 の 指定「全て モーダルが よい」）
 *
 * 足りない まま 送ると 司会が 聞き返す。その こたえの あとに 出る ポップアップで
 *「内容が 伝わったか」「日本語は そのままで よいか」「残りの 確認」が 読める。
 * 前は 聞き返しの あとも 同じ 2行（開いた／まだ）だけ だった。
 */
test("聞き返しに こたえると、こたえの 見かたが 出る", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* きのう だけ 言う → 残りを 聞き返される。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  const first = page.getByRole("dialog", { name: "報告の 見かた" });
  await expect(first).toBeVisible();
  /* 報告の あとの 見かたにも 点が 出る（鍵ゼロでは 内容だけ）。ルビが 入るので 字は 素で 見る。 */
  await expectOnScreen(page, "報告の 内容");
  await expectOnScreen(page, "あなたの 報告と ブラッシュアップ");
  /*
   * **項目ごとの「あなたの 発言」**（2026-09-23 の 指定）。鍵ゼロの E2Eでも 出る——
   * AIの 見立てが 無い ときは 発話を 文に 分けて 照合で 引く（`attributeUtterance`）。
   */
  await expectOnScreen(page, "あなたの 発言");
  /* 全文の 箱と 表で 名前を 分ける（似た 名前を 3つ 並べない・R5 検収）。 */
  await expectOnScreen(page, "言った ことば ぜんぶ");
  await expectOnScreen(page, "決済の 画面と ABA Payの ボタンを 作りました。");
  await shot(page, "asakai-14-report-score");
  await first.getByRole("button", { name: /報告を つづける/ }).click();

  /* 聞き返しに こたえる。 */
  await page.getByLabel("こたえを 入力する").fill("今、決済フロントエンド機能の 進捗は 20%です。");
  await page.getByRole("button", { name: "おくる" }).click();

  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  await expect(probe).toBeVisible();
  await expectOnScreen(page, "こたえが 伝わりました");
  await expectOnScreen(page, "内容: 伝わりました");
  await expectOnScreen(page, "あなたの こたえ");
  /* 残りの 札が 名前で 読める（つぎに 何を 言うかが 分かる）。 */
  await expectOnScreen(page, "まだ 言えて いない ところ");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-03c-probe-score");

  /*
   * **伝わった 回には「もう一度報告」を 置かない**（2026-09-28 の 点検 B3。当時は「言い直す」）。
   * 置いて いた ころは、押すと 次の 札の 1回目の 問いが 流れない まま
   * 回数だけ 進み、型文つきの 2回目から 始まって いた。
   */
  await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(0);
  await probe.getByRole("button", { name: /つぎの しつもんを 聞く/ }).click();
  await expect(probe).toBeHidden();
  await expect(page.getByText("（2 / 4）")).toBeVisible();

  /*
   * **伝わらなかった 回の 道は「もう一度報告」の 1つだけ**（2026-10-09 の 決定）。
   * 前は「つぎの しつもんを 聞く」で 先へ 進めて、2回 はずすと 打ち切られた。
   * いまは 押すと 同じ しつもんの まま 答え直す（司会は 何も 言わず、回数にも 数えない）。
   */
  const answer = async (text: string) => {
    await page.getByLabel("こたえを 入力する").fill(text);
    await page.getByRole("button", { name: "おくる" }).click();
    await expect(probe).toBeVisible();
  };
  /* ポップアップの「ヘンディさんの しつもん」の 字（ふりがなと 空白は 外す）。 */
  const questionOf = async () =>
    (await dialogText(probe)).match(/ヘンディさんのしつもん(.*?)あなたのこたえ/u)?.[1];
  await answer("すみません、わかりません。");
  await expectOnScreen(page, "もう いちど お願いします");
  await expectOnScreen(page, "内容: まだ 伝わって いません");
  await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(1);
  await expect(probe.getByRole("button", { name: /つぎの しつもんを 聞く/ })).toHaveCount(0);
  await expect(probe.getByRole("button", { name: "言い直す" })).toHaveCount(0);
  /* 「一度」「伝わりませんでした」も 含めて、ポップアップの 中に 裸の 漢字が 無い。 */
  expect(await bareKanjiTexts(page)).toEqual([]);
  const question = await questionOf();
  expect(question, "ポップアップに 司会の しつもんが 出て いる").toBeTruthy();

  /*
   * 聞き返しの 上限（2回）を **超えて** はずしつづけても、打ち切りに ならず、
   * 同じ しつもんの まま 何回でも 答え直せる。
   */
  for (let round = 0; round < 4; round += 1) {
    await probe.getByRole("button", { name: "もう一度報告" }).click();
    await expect(probe).toBeHidden();
    await expect(page.getByText("（2 / 4）")).toBeVisible();
    await answer("すみません、わかりません。");
    expect(await questionOf(), "しつもんが 変わって いない").toBe(question);
    await expect(probe.getByRole("button", { name: /つぎの しつもんを 聞く/ })).toHaveCount(0);
    expect(await dialogText(probe)).not.toContain("ここまでです");
  }
  await shot(page, "asakai-03d-probe-retry-only");

  /*
   * 伝わるまで 答え直すと、はじめて 先へ 進める。**はずした 回は 数えて いない**ので、
   * 打ち切られず 普通に 開く（主ボタンは「つぎの しつもんを 聞く」に 戻る）。
   */
  await probe.getByRole("button", { name: "もう一度報告" }).click();
  await expect(probe).toBeHidden();
  await answer("きょうは、注文IDと 合計金額を 決済の 画面に 表示します。");
  await expectOnScreen(page, "こたえが 伝わりました");
  await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(0);
  await probe.getByRole("button", { name: /つぎの しつもんを 聞く/ }).click();
  await expect(probe).toBeHidden();
  await expect(page.getByText("（3 / 4）")).toBeVisible();
  /* 打ち切りの ことばは 1度も 出て いない（朝礼の 聞き返しは 打ち切りに ならない）。 */
  const chat = await readingFreeText(page);
  expect(chat).not.toContain("聞けませんでした");
  expect(chat).not.toContain("ここまでです");
  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **「もう いちど 報告する」は その日を はじめから**（2026-09-17 の 通しプレイ検収）
 *
 * 今日の 評価の ポップアップには 道が 2つ ある——つぎの 日へ 進むか、
 * 同じ 日を やり直すか。検収では「押しても 板が （4/4）の まま だった」と
 * 見えた ので、**板が 空に 戻り、報告の 入口に 帰る**ことを ここで 止める。
 *
 * 週の けっかも 見る。同じ 日を 2回 報告しても **行は 1本**（`finishScene` が
 * 日で 置きかえる）——積み足しに なると「6日ぶん」に なる。
 */
test("もう いちど 報告すると、その日が はじめから やり直せる", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  const report = async () => {
    await page
      .getByLabel("こたえを 入力する")
      .fill(
        "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
          "今、決済フロントエンド機能の 進捗は 20%です。" +
          "きょうは、注文IDと 合計金額を 画面に 出します。" +
          "今の ところ 問題は ありません。",
      );
    await page.getByRole("button", { name: "おくる" }).click();
  };

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await report();

  const modal = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(modal).toBeVisible();
  await expect(page.getByText("（4 / 4）")).toBeVisible();

  await modal.getByRole("button", { name: "もう いちど 報告する" }).click();
  await expect(modal).toBeHidden();

  /* 板が 空に 戻る（0枚）。ボタンの 字も「けっかを 見る」では なくなる。 */
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expect(page.getByRole("button", { name: /けっかを 見る/ })).toHaveCount(0);
  await expect(page.getByLabel("こたえを 入力する")).toBeVisible();
  await shot(page, "asakai-11-retry-day");

  /* もう いちど 通すと、週の けっかは 月曜が **1行だけ**。 */
  await report();
  await closeDayScore(page);
  await expectOnScreen(page, "月曜日の 朝礼 おわり");
  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **その日の さいごの 1枚には「もう一度報告」を 置かない**（2026-09-17 の 通しプレイ検収。
 * 当時の ボタンは「言い直す」——2026-10-09 に「もう一度報告」へ 名前が 変わった）
 *
 * 置いて いた ころ、押すと 司会の 受け止めも メンバーの 報告も 流れない まま
 * 板だけ ⭕ に なった。「きょうの 評価」も「つぎの 日へ 進む」も 出るので
 * **成功したように 見える**のに、しおりには 1日も 記録されて いない——
 * 開き直すと 月曜の 途中に 逆もどりする。閉じる 道だけ 残す。
 */
test("さいごの 1枚の ポップアップに もう一度報告は 出ない", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* きのう だけ 言う → 残りを 聞き返される。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();

  /* 残り 3枚を いちどに 言う＝この 1本で その日が 終わる。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "今、決済フロントエンド機能の 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  await expect(probe).toBeVisible();
  await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(0);
  await expect(probe.getByRole("button", { name: "言い直す" })).toHaveCount(0);

  /* 閉じる 道は 1つ。ここを 通って はじめて 司会が 受け止める。 */
  /* 押した 先は その日の 評価（2026-09-28。前は「みんなの 報告を 聞く」で 行き先と 合わなかった）。 */
  await probe.getByRole("button", { name: /きょうの 評価を 見る/ }).click();
  await closeDayScore(page);

  /* しおりに 月曜が 残る＝開き直しても 火曜から つづく。 */
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByRole("button", { name: /火曜日/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
});

/**
 * **何回 まちがえても、その 札は 打ち切られず「まだ 言えて いない ところ」に 残る**
 *（2026-10-09 の 決定）
 *
 * もとは「2回 聞いても 開かない 札は 先へ 進める（2026-09-17）。その 札は 照合から
 * 外れる ので、一覧に 残すと **もう 開かない ものに 答えつづける**」を 守る テストだった
 *（打ち切った 札を 一覧から 消す）。2026-10-09 に 朝礼の 聞き返しは **伝わるまで
 * 何回でも**（「もう一度報告」だけ）に なり、打ち切りが 無く なった——札は 照合から
 * 外れず、開く 日まで 一覧に 残るのが 正しい。打ち切りは 夕礼の 作業記録の
 * 読み上げ（`夕礼 — 聞き返しは …`）にだけ 残る。
 */
test("何回 まちがえても、その 札は 打ち切られず 残りの 一覧に 残る", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* 「きのう」以外を 言わずに 出す → きのうは 開き、残りを 順に 聞かれる。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();

  /* 聞かれた 札に かみ合わない ことを 4回（上限の 2回を 超えて）言う。 */
  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  for (let round = 0; round < 4; round += 1) {
    await page.getByLabel("こたえを 入力する").fill("よろしく お願いします。");
    await page.getByRole("button", { name: "おくる" }).click();
    await expect(probe).toBeVisible();
    /* 「まだ 言えて いない ところ: …」の 中に、聞かれて いる 進捗の 札が 残って いる。 */
    const rest = (await dialogText(probe)).match(/まだ言えていないところ:(.*?)もう一度報告/u)?.[1];
    expect(rest, `${round + 1}回目: 打ち切られず 一覧に 残って いる`).toContain("進捗");
    await expect(probe.getByRole("button", { name: "もう一度報告" })).toHaveCount(1);
    expect(await dialogText(probe)).not.toContain("ここまでです");
    expect(await bareKanjiTexts(page)).toEqual([]);
    if (round === 3) await shot(page, "asakai-12-retry-card");
    await probe.getByRole("button", { name: "もう一度報告" }).click();
    await expect(probe).toBeHidden();
  }

  /* 板は 1枚も 増えて いない（きのう だけ）。司会は 1度も 「聞けませんでした」と 言って いない。 */
  await expect(page.getByText("（1 / 4）")).toBeVisible();
  expect(await readingFreeText(page)).not.toContain("聞けませんでした");
});

/**
 * **札を 押すと、その 1枚を もう いちど 聞いて もらえる**（2026-09-18 の 指定）
 *
 * 司会の 聞き返しを 待つ しか なかった ころ、2回 まちがえて 打ち切られた 札は
 * その日 二度と 開けなかった——正しい ことばを 思い出しても 行き場が 無い。
 */
test("報告した あと、⭕ で ない 札を 押すと もう いちど 聞かれる", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* 1本目は「きのう」だけ。まだ 押せない 札が 3枚 のこる。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();

  /* 「問題・確認」を 押す → 司会が その 札の しつもんを する。 */
  await page.getByRole("button", { name: /問題・確認を もう いちど 言う/ }).click();
  await expectOnScreen(page, "問題は ありますか");

  await page.getByLabel("こたえを 入力する").fill("今の ところ 問題は ありません。");
  await page.getByRole("button", { name: "おくる" }).click();
  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  await expect(probe).toBeVisible();
  await expectOnScreen(page, "こたえが 伝わりました");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-13-card-retry");

  /*
   * **開き直しても 押せる まま。** 押せるかは「1本 送ったか」で 決めて いて、
   * その 控えを 端末に 残して いなかった ころ、リロード直後だけ ↻ が 消えて
   * **打ち切られた すぐ あとに やり直せない**（画面に 理由も 出ない）
   *（2026-09-18 の 通しプレイ検収）。
   */
  await probe.getByRole("button", { name: /つぎの しつもん|きょうの 評価を 見る/ }).click();
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByRole("button", { name: /を もう いちど 言う/ }).first()).toBeVisible();
});

/**
 * **きょうの 評価の 中身**（2026-09-18 の 指定）
 *
 * 「あなたの 回答」に **1本目も** 並ぶ（できた ことが ふりかえりから 消えない）。
 * 項目ごとの 正しい 回答と、1回に まとめた「ブラッシュアップ回答」も 読める。
 * 閉じた あとに 司会の 受け止めと **指名**が 出て、メンバーが 話しはじめる。
 */
test("きょうの 評価に 自分の 回答・正しい 回答・まとめが 並ぶ", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
        "今、決済フロントエンド機能の 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  const day = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(day).toBeVisible();
  await expectOnScreen(page, "あなたの 回答");
  await expectOnScreen(page, "さいしょの 報告");
  /* 項目ごとに **自分の ことばと お手本が 横に 並ぶ**（2026-09-18 の 指定）。 */
  await expectOnScreen(page, "項目ごとに 見くらべる");
  await expectOnScreen(page, "あなたの 答え");
  await expectOnScreen(page, "正しい 回答");
  await expectOnScreen(page, "ブラッシュアップ回答");
  expect(await bareKanjiTexts(page)).toEqual([]);

  /*
   * **「回答」が「かいこた」に なって いない。**
   *
   * 教材の 辞書に ["回","かい"] と ["答","こた"] が ある ので、ことばで 持たないと
   * 1字ずつに 割れる——**裸の 漢字では ない**ので 上の 検査も `lint:content` も
   * すり抜ける（2026-09-18 の 通しプレイ検収）。読みが「ある」が「ちがう」型。
   */
  const readings = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] rt')]
      .map((rt) => rt.textContent ?? "")
      .join("／"),
  );
  expect(readings, "「回答」が 1字ずつに 割れて いる").not.toContain("かいこた");
  expect(readings).toContain("かいとう");
  await shot(page, "asakai-14-day-review");

  /* 閉じてから 司会の 受け止め → 指名 → メンバー。 */
  await closeDayScore(page);
  await expectOnScreen(page, "では 次は 奥田さん、お願いします。");
  expect(await bareKanjiTexts(page)).toEqual([]);
});

/**
 * **お手本を 見た あとの やり直しは、点を 上書きしない**（2026-09-18 の R5 検収）
 *
 * きょうの 評価には 項目ごとの 正しい 回答が 並び、その 同じ 画面に
 *「もう いちど 報告する」が ある。上書きできる ままだと
 *「適当に 答える → お手本を 読む → 写して やり直す」で 満点が 記録できる。
 * 練習は できる（板は 開く）が、**週の けっかに 残る 数は 変わらない**。
 *
 * ## 夕礼で 見る（2026-10-09）
 * 前は 朝礼で「かみ合わない ことを 言いつづけて 4枚 とも 打ち切られる」まで 進めて いた。
 * 朝礼の 聞き返しは 伝わるまで 何回でも（打ち切りが 無い）に なった ので、
 * **0点の 日**は 朝礼では 作れない。打ち切りが 残る のは 夕礼の 作業記録の 読み上げ
 *（そのまま 読むと 数えず、3回 つづくと その 札は 聞けなかった ことに なる）だけ——
 * 同じ 文を 送りつづけて、4枚 とも 打ち切られる まで 進める。
 */
test("夕礼: 打ち切りで 終えた 日を お手本を 見て やり直しても、その日の 点は 変わらない", async ({
  page,
  context,
}) => {
  test.slow();
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);
  await closeDuty(page);

  /* 月曜の 作業記録を 時刻ごと そのまま 読み上げつづけて、4枚 とも 打ち切られる まで 進める。 */
  const logText =
    "09:00 学生一覧APIの 仕様を 確認。09:30 学生一覧APIとの 接続開始。" +
    "10:30 AUPP・CADTの 学生データ 表示完了。11:00 キーワード検索UIを 作成。";
  const day = page.getByRole("dialog", { name: "今日の 評価" });
  for (let round = 0; round < 14 && !(await day.isVisible()); round += 1) {
    await page.getByLabel("こたえを 入力する").fill(logText);
    await page.getByRole("button", { name: "おくる" }).click();
    const open = page.getByRole("dialog", { name: /報告の 見かた|追加の しつもんへの こたえ/ });
    await expect(open.or(day).first()).toBeVisible();
    if (await day.isVisible()) break;
    await open.getByRole("button").last().click();
  }
  await expect(day).toBeVisible();
  /* 0枚の 日にも 肯定の 1行が ある（手ぶらで 帰さない）。 */
  await expectOnScreen(page, "声に 出した ぶんは 練習に なって います");
  await expectOnScreen(page, "お手本を 見た あとの やり直しは");
  await shot(page, "asakai-15-zero-day");

  await day.getByRole("button", { name: "もう いちど 報告する" }).click();
  await closeDuty(page);

  /* 写して やり直す。板は 開くが…… */
  await page.getByLabel("こたえを 入力する").fill(exampleUtterances("asakai_muzukashii")[0] ?? "");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(day).toBeVisible();
  await expectOnScreen(page, "4つ ぜんぶ 伝えられました");

  /* ……記録は 上書きされない。時間カードの 札は ❌ の まま。 */
  await closeDayScore(page);
  const cards = page.getByRole("status").getByText("⭕");
  await expect(cards).toHaveCount(0);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-16-score-kept");
});

/**
 * **司会は 報告メモを 閉じてから 話しはじめる**（2026-09-18 の 指定）
 *
 * 開いた 瞬間に 鳴らして いた ころ、司会の 声は **モーダルの うしろ**で 流れて
 * いた——学習者は メモ（きのう・きょう・問題・しごとの 表）を 読んで いる
 * さいちゅうで、聞き逃した ぶんを 聞き直す 手だても 無い。
 *
 * 音声が ある 教材（夕礼）で 見る。鳴らせたかでは なく **`play()` を 呼んだか**を
 * 数える——自動再生を 止める ブラウザでも 呼び出しは 通るので、ここが 一番 固い。
 */
test("報告メモを 閉じるまで、こえは 鳴らない", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_muzukashii");
  await seedCompleted(context, refs.slice(0, at));

  await page.addInitScript(() => {
    const plays: string[] = [];
    (window as unknown as { __plays: string[] }).__plays = plays;
    const origin = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      plays.push(this.src);
      return origin.apply(this);
    };
  });

  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  /* 報告メモが 開いて いる あいだは 1本も 鳴らさない。 */
  await expect(page.getByRole("dialog", { name: "報告メモ" })).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __plays: string[] }).__plays);
  expect(before, "メモを 読んで いる うしろで こえが 流れて いる").toEqual([]);

  /* 字は もう 積んで ある（閉じた ときに 並んで いる）。 */
  await expectOnScreen(page, "夕礼を 始めます");

  await closeDuty(page);

  /* 閉じたら 鳴りはじめる。 */
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (window as unknown as { __plays: string[] }).__plays)).length,
      { message: "閉じても こえが 鳴らない" },
    )
    .toBeGreaterThan(0);

  /*
   * **チャットの 行から 聞き直せる**（2026-09-21 の 指定「チャット欄に 音声の
   * 再生ボタンを つけて ください」）。作り置きの こえが ある 行にだけ 🔊 が 出る。
   */
  const replay = page.getByRole("button", { name: /ことばを もう一度 聞く/ });
  await expect(replay.first()).toBeVisible();
  expect(await replay.count(), "🔊 が 1つも 無い").toBeGreaterThan(1);
});

/**
 * **その日を はじめから やり直す**（2026-09-21 の 指定）
 *
 * これまで やり直せるのは「きょうの 評価」の 中だけ——**報告の さいちゅうに
 * 気が 変わった 人**（言い方を 変えたい・最初から 通して 言いたい）に 道が 無かった。
 * 途中の 控えごと 捨てるので、板も チャットも 場面の はじめに 戻る。
 */
test("報告の 途中でも、その日を はじめから やり直せる", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* 1枚だけ 開けて 途中に する。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();
  await expect(page.getByText("（1 / 4）")).toBeVisible();

  await page.getByRole("button", { name: "この日を はじめから やり直す" }).click();
  await closeDuty(page);

  /* 板は 空、チャットは 場面の はじめだけ。 */
  await expect(page.getByText("（0 / 4）")).toBeVisible();
  await expect(page.getByLabel("こたえを 入力する")).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-18-restart-mid");

  /* 開き直しても 途中に 戻らない（控えごと 捨てて ある）。 */
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expect(page.getByText("（0 / 4）")).toBeVisible();
});

/**
 * **評価を 閉じた あと、先輩の 報告の こえを 止めない**（2026-09-28 の 点検 B5）
 *
 * 2026-09-18 の 指定「モーダルの 後に、各担当者が 報告を します」。評価を 閉じた
 * ところで 采配・メンバー・締めの こえを 積むのに、同じ 手で 時間カードへ 移る
 * 処理が **こえを 止めて いた**——字だけ 流れて 1つも 鳴らなかった。
 * 止める（pause）が 走らず、閉じた あとに 新しく 鳴る ことを 見る。
 */
test("評価を 閉じた あとも、先輩の 報告の こえが 鳴りつづける", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.addInitScript(() => {
    const w = window as unknown as { __plays: string[]; __pauses: number };
    w.__plays = [];
    w.__pauses = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      w.__plays.push(this.src);
      /*
       * **声を 短く 終わらせる**（ここだけの 細工）。本物の 長さで 待つと、
       * 司会の 見本（約20秒）が 鳴って いる あいだに 評価を 閉じて しまい、
       * つぎの 声が 行列に 積まれた まま 鳴りはじめない。
       */
      window.setTimeout(() => this.dispatchEvent(new Event("ended")), 30);
      return play.apply(this);
    };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
      w.__pauses += 1;
      return pause.apply(this);
    };
  });
  const counts = () =>
    page.evaluate(() => {
      const w = window as unknown as { __plays: string[]; __pauses: number };
      return { plays: w.__plays.length, pauses: w.__pauses };
    });

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
        "今、決済フロントエンド機能の 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();
  const day = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(day).toBeVisible();

  const before = await counts();
  await day.getByRole("button", { name: /へ 進む/ }).click();
  await expect(day).toBeHidden();

  /* 閉じた あとに 先輩の こえが 鳴る（奥田さん・ニャムさんの 報告）。 */
  await expect
    .poll(async () => (await counts()).plays, { message: "閉じた あとに こえが 鳴らない" })
    .toBeGreaterThan(before.plays);
  /* 時間カードへ 移っても 止めて いない。 */
  await page.waitForTimeout(800);
  expect((await counts()).pauses, "時間カードへ 移る ときに こえを 止めた").toBe(before.pauses);
});

/**
 * **開き直したら、そこまでの 会話を もう いちど 鳴らす**（2026-09-21 の 指定）
 *
 * 前は 字だけ 戻して 黙って いた——開き直した 人は どこまで 話したかを
 * **字で さかのぼる**しか なく、聞いて 覚える 練習に ならなかった。
 * 鳴りはじめるのは 報告メモを 閉じた あと（メモの うしろで 流さない）。
 */
test("開き直すと、そこまでの 会話を 鳴らし直す", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.addInitScript(() => {
    const plays: string[] = [];
    (window as unknown as { __plays: string[] }).__plays = plays;
    const origin = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      plays.push(this.src);
      return origin.apply(this);
    };
  });

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();
  await expect(page.getByText("（1 / 4）")).toBeVisible();

  await page.reload();
  await joinCall(page);

  /* メモが 開いて いる あいだは まだ 黙って いる。 */
  await expect(page.getByRole("dialog", { name: "報告メモ" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __plays: string[] }).__plays)).toEqual(
    [],
  );

  await closeDuty(page);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (window as unknown as { __plays: string[] }).__plays)).length,
      { message: "開き直しても こえが 鳴らない" },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText("（1 / 4）")).toBeVisible();
});

/**
 * **開き直すと、今の 教材の 声で 鳴る**（2026-09-29 に 実発生）。
 * 途中の しおりは 行を 保存した ときの 音の 場所ごと 持つ。声を 作り直した あとも、
 * 前に 話しかけて いた 人には 古い「アバペイ」の 声が 鳴りつづけた。
 */
test("開き直すと、しおりの 古い 音では なく 今の 声で 鳴る", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "meetings", "asakai_kantan.json"), "utf8"),
  ) as { asakai: { scenes: { sample: { audio: string } }[] } };
  const current = meeting.asakai.scenes.at(0)?.sample.audio ?? "";
  const stale = "/audio/meetings/asakai_kantan/s0-sample-da68de59.wav";
  expect(current, "月曜の 見本に 音が 無い").not.toBe("");
  expect(current, "しおりに 入れる 古い 音と 今の 音が 同じ").not.toBe(stale);

  await page.addInitScript(() => {
    const plays: string[] = [];
    (window as unknown as { __plays: string[] }).__plays = plays;
    const origin = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      plays.push(this.src);
      return origin.apply(this);
    };
  });

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);
  await page
    .getByLabel("こたえを 入力する")
    .fill("先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。");
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("dialog", { name: "報告の 見かた" }).getByRole("button").last().click();
  await expect(page.getByText("（1 / 4）")).toBeVisible();

  /* 声を 作り直す 前に 保存された しおりの 形に する（見本の 行だけ 古い 音を 指す）。 */
  await page.evaluate(
    ([now, old]) => {
      const key = "nexmax:v1:asakai-resume:asakai_kantan";
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as {
        drafts?: Record<string, { lines: { text: string; audio?: string }[] }>;
      };
      const lines = saved.drafts?.mon?.lines ?? [];
      const target = lines.find((line) => line.audio === now);
      if (!target) throw new Error("しおりに 見本の 行が ありません");
      target.audio = old;
      target.text = "（直す 前の 文）";
      localStorage.setItem(key, JSON.stringify(saved));
    },
    [current, stale],
  );

  await page.reload();
  await joinCall(page);
  await closeDuty(page);

  /*
   * **鳴る 順番には 頼らない**。見本の 前には 司会の あいさつが あり、
   * 声は 1本ずつ 鳴り終わってから 次へ 進む（`use-voice-queue.ts`）。
   * だから まず 画面の 字と、書き戻された しおりで 差し替わりを 確かめ、
   * 声は あいさつが 鳴り終わるまで 待てる 長さで 見る。
   */
  await expect(page.getByText("（直す 前の 文）")).toHaveCount(0);
  const savedAudios = () =>
    page.evaluate(() => {
      const saved = JSON.parse(
        localStorage.getItem("nexmax:v1:asakai-resume:asakai_kantan") ?? "{}",
      ) as { drafts?: Record<string, { lines: { audio?: string }[] }> };
      return (saved.drafts?.mon?.lines ?? []).map((line) => line.audio ?? "");
    });
  await expect
    .poll(async () => (await savedAudios()).includes(current), {
      message: "しおりが 今の 声に 書き直されない",
    })
    .toBe(true);
  expect(await savedAudios(), "しおりに 古い 声が 残って いる").not.toContain(stale);

  const plays = () => page.evaluate(() => (window as unknown as { __plays: string[] }).__plays);
  await expect
    .poll(async () => (await plays()).some((src) => src.includes(current)), {
      message: "今の 見本の 声が 鳴らない",
      timeout: 60_000,
    })
    .toBe(true);
  expect(
    (await plays()).some((src) => src.includes(stale)),
    "しおりに 残った 古い 声が 鳴った",
  ).toBe(false);
  expect(await bareKanjiTexts(page), "ふりがなの 無い 漢字").toEqual([]);
});
