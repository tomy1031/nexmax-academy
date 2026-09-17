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
  await expectOnScreen(page, "きのうは ◯◯を しました");
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
    "📅きのうしたこと（9/18金曜日）",
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
  await page.getByRole("button", { name: /けっかを 見る/ }).click();
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
    await page.getByRole("button", { name: /けっかを 見る/ }).click();
    if (day < 4) {
      await page.getByRole("button", { name: /つづけます/ }).click();
      await closeDuty(page);
    }
  }

  await expectOnScreen(page, "合格");
  await expectOnScreen(page, "以上で 合格");
  await expectOnScreen(page, "聞き返し");
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "asakai-10-week-result");

  /* 読み終えてから おわりに する（ここまで「クリア」の 板は かぶさらない）。 */
  await page.getByRole("button", { name: "けっかを 読みました" }).click();
});
