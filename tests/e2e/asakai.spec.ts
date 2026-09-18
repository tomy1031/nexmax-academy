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
function exampleUtterances(): string[] {
  const meeting = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "content", "meetings", "asakai_kantan.json"), "utf8"),
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
 * 「きょうの けっかを 見る ▶」の あとに 出る。中身は 点・どのように 伝えられたか・
 * しつもんの ふりかえり。閉じると これまでどおり 時間カードへ 進む。
 */
async function closeDayScore(page: Page): Promise<void> {
  const modal = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: /へ 進む|今週の けっかを 見る/ }).click();
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
  /* データの ながれ（ニャム → ヘンディ → あなた → 奥田 → あなた）。 */
  await expectOnScreen(page, "ニャムさんが、学生情報と スキル情報を 用意します");
  /* 作業記録の 読み上げと 仕事の 報告の くらべ。 */
  await expectOnScreen(page, "作業記録の 読み上げ");
  await expectOnScreen(page, "仕事の 報告");
  /* 勤務時間と 夕礼の 時間。 */
  await expectOnScreen(page, "17:50");
  await shot(page, "asakai-05b-nexttalent");

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
  await expectOnScreen(page, "決済フロントエンド機能");
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
        "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  /* **見かたは モーダルで 出る。閉じてから 司会と メンバーが 話す**（2026-09-11 の 指定）。 */
  await expect(page.getByRole("dialog", { name: "報告の 見かた" })).toBeVisible();
  /*
   * **開いて いる あいだに 数える**（2026-09-15 の 通しプレイ検収）。
   * 前は 閉じた あとにしか 数えて いなかった ので、とじる ボタンの
   * 「みんなの 報告を 聞く ▶」が **報告が 通るたびに 裸の 漢字**で 出て いたのを
   * 5日 通しても 一度も 捕まえられなかった。モーダルは 閉じると 消える＝
   * **閉じた あとの 検査は モーダルを 見て いない**。
   */
  expect(await bareKanjiTexts(page)).toEqual([]);
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();

  /*
   * 4枚 そろったので 聞き返しが 無く、その 場面は おわる。
   * **きょうの 評価は 自動で 開く**（2026-09-18 の 指定）——前は
   *「きょうの けっかを 見る ▶」を 押すまで 出ず、その あいだに 4人ぶんの
   * 報告が 流れて、自分の 点が 遠ざかって いた。
   */
  await expect(page.getByText("（4 / 4）")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "今日の 評価" })).toBeVisible();
  await shot(page, "asakai-03-kantan-opened");

  await expectOnScreen(page, "きょうの 評価");
  await expectOnScreen(page, "どのように 伝えられたか");
  /* 鍵ゼロの 端末では 内容だけ 出す（見て いない ものに 0点を つけない）。 */
  await expectOnScreen(page, "AIの 鍵が ある ときに 出ます");
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
 * 夕礼の しごとは 絵を 持って いない。**その ときは 欄を 広げない**——
 * 390px の 画面では 表の 幅が 318px しか なく、88px を 空欄に 使うと
 * しごとの 名前に 134px しか 残らない（2026-09-16 の 検収）。
 */
test("夕礼: 絵の 無い 表は 絵の 欄を 広げない", async ({ page, context }) => {
  const refs = stageRefs();
  await seedCompleted(context, refs.slice(0, refs.indexOf("asakai_muzukashii")));
  await page.goto("/asakai/meeting-asakai_muzukashii");
  await joinCall(page);

  const memo = page.getByRole("dialog", { name: "報告メモ" });
  await expect(memo).toBeVisible();
  const table = memo.locator("table").first();
  await expect(table.locator("img")).toHaveCount(0);
  const firstCell = table.locator("tbody tr").first().locator("td").first();
  const box = await firstCell.boundingBox();
  expect(box!.width, "絵が 無いのに 欄が 広い").toBeLessThan(40);
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
        "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
  await closeDayScore(page);
  await expectOnScreen(page, "月曜日の 朝礼 おわり");

  /* ここで 回線が 切れた ことに する。 */
  await page.reload();
  await joinCall(page);
  await closeDuty(page);
  await expectOnScreen(page, "火曜日");
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
    await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
    await closeDayScore(page);
    if (day < 4) {
      await page.getByRole("button", { name: /つづけます/ }).click();
      await closeDuty(page);
    }
  }

  /* けっかは ポップアップで 出る（2026-09-17 の 指定「全て モーダルが 良いです」）。 */
  const week = page.getByRole("dialog", { name: "今週の けっか" });
  await expect(week).toBeVisible();
  await expectOnScreen(page, "合格");
  await expectOnScreen(page, "以上で 合格");
  await expectOnScreen(page, "聞き返し");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-10-week-result");

  /* 読み終えてから おわりに する（ここまで「クリア」の 板は かぶさらない）。 */
  await week.getByRole("button", { name: /けっかを 読みました/ }).click();
  await expect(week).toBeHidden();

  /* 閉じた あとも、数を もう いちど 見に 行ける。 */
  await page.getByRole("button", { name: "今週の けっかを 見る" }).click();
  await expect(week).toBeVisible();
  await expectOnScreen(page, "以上で 合格");
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
  await expectOnScreen(page, "どのように 伝えられたか");
  await first.getByRole("button", { name: /報告を つづける/ }).click();

  /* 聞き返しに こたえる。 */
  await page
    .getByLabel("こたえを 入力する")
    .fill("今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。");
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

  /* 言い直す … 同じ しつもんの まま 閉じる（司会は 何も 言わない）。 */
  await probe.getByRole("button", { name: "言い直す" }).click();
  await expect(probe).toBeHidden();
  await expect(page.getByText("（2 / 4）")).toBeVisible();
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
          "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
          "きょうは、注文IDと 合計金額を 画面に 出します。" +
          "今の ところ 問題は ありません。",
      );
    await page.getByRole("button", { name: "おくる" }).click();
    await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
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
 * **その日の さいごの 1枚には「言い直す」を 置かない**（2026-09-17 の 通しプレイ検収）
 *
 * 置いて いた ころ、押すと 司会の 受け止めも メンバーの 報告も 流れない まま
 * 板だけ ⭕ に なった。「きょうの 評価」も「つぎの 日へ 進む」も 出るので
 * **成功したように 見える**のに、しおりには 1日も 記録されて いない——
 * 開き直すと 月曜の 途中に 逆もどりする。閉じる 道だけ 残す。
 */
test("さいごの 1枚の ポップアップに 言い直すは 出ない", async ({ page, context }) => {
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
      "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();

  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  await expect(probe).toBeVisible();
  await expect(probe.getByRole("button", { name: "言い直す" })).toHaveCount(0);

  /* 閉じる 道は 1つ。ここを 通って はじめて 司会が 受け止める。 */
  await probe.getByRole("button", { name: /みんなの 報告を 聞く/ }).click();
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
 * **打ち切った 札を「まだ 言えて いない ところ」に 並べない**（同検収）
 *
 * 2回 聞いても 開かない 札は 先へ 進める（2026-09-17 の 指定）。その 札は
 * 照合から 外れる ので、あとから 正しく 言っても 何も 起きない——なのに
 * 一覧に 残して いたので、学習者は **もう 開かない ものに 答えつづけて いた**。
 */
test("2回 まちがえた 札は、残りの 一覧から 消える", async ({ page, context }) => {
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

  /* 聞かれた 札に かみ合わない ことを 2回 言う → その 札は 打ち切られる。 */
  const probe = page.getByRole("dialog", { name: "追加の しつもんへの こたえ" });
  for (let round = 0; round < 2; round += 1) {
    await page.getByLabel("こたえを 入力する").fill("よろしく お願いします。");
    await page.getByRole("button", { name: "おくる" }).click();
    await expect(probe).toBeVisible();
    const rest = await readingFreeText(page);
    expect(rest, "打ち切る 前は 一覧に 残って いる").toContain("進捗");
    await probe.getByRole("button", { name: /つぎの しつもん|みんなの 報告/ }).click();
  }

  /* 3本目。進捗は もう 聞かれない ので、一覧からも 消えて いる。 */
  await page.getByLabel("こたえを 入力する").fill("よろしく お願いします。");
  await page.getByRole("button", { name: "おくる" }).click();
  await expect(probe).toBeVisible();
  const after = await readingFreeText(page);
  expect(after, "打ち切った 札を 残りに 並べない").not.toContain("まだ言えていないところ:進捗");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-12-gave-up-card");
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
  await probe.getByRole("button", { name: /つぎの しつもん|みんなの 報告/ }).click();
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
        "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();

  const day = page.getByRole("dialog", { name: "今日の 評価" });
  await expect(day).toBeVisible();
  await expectOnScreen(page, "あなたの 回答");
  await expectOnScreen(page, "さいしょの 報告");
  await expectOnScreen(page, "項目ごとの 正しい 回答");
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
 */
test("お手本を 見て やり直しても、その日の 点は 変わらない", async ({ page, context }) => {
  const refs = stageRefs();
  const at = refs.indexOf("asakai_kantan");
  await seedCompleted(context, refs.slice(0, at));

  await page.goto("/asakai/meeting-asakai_kantan");
  await joinCall(page);
  await closeDuty(page);

  /* かみ合わない ことを 言いつづけて、4枚 とも 打ち切られる まで 進める。 */
  const day = page.getByRole("dialog", { name: "今日の 評価" });
  for (let round = 0; round < 12 && !(await day.isVisible()); round += 1) {
    await page.getByLabel("こたえを 入力する").fill("よろしく お願いします。");
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
  await page
    .getByLabel("こたえを 入力する")
    .fill(
      "先週の 金曜日は、決済の 決まりを 調べて、決済の 画面と ABA Payの ボタンを 作りました。" +
        "今、決済フロントエンド機能 ぜんたいの 進捗は 20%です。" +
        "きょうは、注文IDと 合計金額を 画面に 出します。" +
        "今の ところ 問題は ありません。",
    );
  await page.getByRole("button", { name: "おくる" }).click();
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
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

  /*
   * **「閉じたら 鳴る」の 側は、音声データが 入ってから 足す。**
   * いま 朝礼・夕礼とも 教材データに `audio` の 参照が 1つも 無く
   *（wav は 残って いるが 名前が 変わって いる）、**どこでも 鳴らない**。
   * 作り置きの PR が 入った ところで、ここに 鳴る ことの 検査を 足す。
   */
  await expect(page.getByLabel("こたえを 入力する")).toBeVisible();
});
