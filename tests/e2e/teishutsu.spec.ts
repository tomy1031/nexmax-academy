import { expect, test } from "@playwright/test";
import {
  choiceButtons,
  itemsBefore,
  KAISHA,
  progressText,
  readTestResult,
  seedCompleted,
  shot,
} from "./helpers";

/**
 * まとめて 出す（提出モード）— ぜんぶ 書いてから 1回だけ 採点する やりかた
 *
 * 見張るのは、このモードが 成り立つ ための 3つ。
 *  1. **途中で 正誤が 漏れない**（漏れたら テストの やりかたに ならない）
 *  2. **他の ページへ 行って 戻っても 書いた ものが 消えない**（保存が 生命線）
 *  3. 出した あとに **自分の こたえと 正解が 並んで 見える**
 *
 * ついでに、これまでの「1問ずつ」でも **自分が 何を えらんだか** が 出る ことを 見る
 * ——外した ときほど、自分の 選択が 画面に 残って いないと 直しようが ない。
 */

/**
 * やりかた（まとめて 出す／1問ずつ）は **先生が 管理画面で 決める**ので、学習者の
 * 画面に 選択は 無い。既定は まとめて 出す なので「はじめる」で このモードに 入る。
 */
const START_SUBMIT = "はじめる";
const SUBMIT_ANSWERS = /こたえを 出/;

test("まとめて 出す は 途中で 採点しない（えらんだ ところは 残る）", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  await expect(page.getByText("もんだい 1 / 6")).toBeVisible();
  await choiceButtons(page).nth(0).click();

  // えらんだ ところは 押した ままに 見える（＝自分の こたえが 画面に 残る）
  await expect(choiceButtons(page).nth(0)).toHaveAttribute("aria-pressed", "true");
  // 合って いるかは まだ 出さない
  await expect(page.getByText("よく できました")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "つぎへ" })).toHaveCount(0);
  await expect(page.getByText("こたえた 1 / 6")).toBeVisible();
  await shot(page, "23-quiz-submit-answering");

  // 行って 戻っても、えらんだ ところは そのまま
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(page.getByText("もんだい 2 / 6")).toBeVisible();
  await page.getByRole("button", { name: "← まえの もんだい" }).click();
  await expect(choiceButtons(page).nth(0)).toHaveAttribute("aria-pressed", "true");
});

test("ぜんぶ 1ページに 出る（行き来しながら 書ける）", async ({ page, context }) => {
  /*
   * 「ほうこくの じゅんび」は `answerMode: "all"`。学習者は 学習用サイトと
   * この もんだいを **行ったり 来たり** しながら 書くので、開いて いない 問題に
   * 書けない 作り（1問ずつ）では 手が 止まる。
   */
  await seedCompleted(context, itemsBefore(KAISHA.quiz2));
  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 9問 ぜんぶが 同時に 見えて いる（見出しの 番号チップ 1/9 … 9/9）
  await expect(page.getByText("1/9")).toBeVisible();
  await expect(page.getByText("9/9")).toBeVisible();
  // 1問ずつ の 道具は 出ない
  await expect(page.getByRole("button", { name: "つぎ →" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "さいごに かくにん →" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "こたえる" })).toHaveCount(0);
  await shot(page, "23-quiz-all-page");
});

test("他の ページへ 行って 戻っても、書いた ものは 残る", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz2));
  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  /*
   * **離れた 2問**に 書く。1ページに 全問 出て いる ことの 意味は、
   * 見つけた 順に どこへでも 書ける ことなので、上から 順ではなく 飛ばして 書く。
   */
  await page.getByRole("button", { name: "ホームページや アプリ" }).first().click();
  await page.getByLabel("こたえを 入力する").first().fill("くるま");
  await expect(page.getByText("こたえた 2 / 9")).toBeVisible();

  // ステージへ 離脱 → 戻る
  await page.goto("/kaisha");
  await page.goto(KAISHA.quiz2.path);
  await expect(page.getByText("まえの つづきから はじめます")).toBeVisible();
  await expect(page.getByText("2もん")).toBeVisible();
  await page.getByRole("button", { name: "つづきから" }).click();

  // 2問とも 書いた ものが そのまま 残って いる
  await expect(page.getByText("こたえた 2 / 9")).toBeVisible();
  await expect(page.getByLabel("こたえを 入力する").first()).toHaveValue("くるま");
});

test("出す まえに かくにんして、出すと 自分の こたえと 正解が 並ぶ", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 1問目だけ わざと 外して、のこりは 書かずに 進む
  await choiceButtons(page).nth(2).click();
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "つぎ →" }).click();
  }
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();

  // 出す 前に「のこり」が 見える（書き忘れに 気づける 最後の 場所）
  await expect(page.getByText(/まえの かくにん/)).toBeVisible();
  await expect(page.getByText(/のこり 5もん/)).toBeVisible();
  await shot(page, "24-quiz-submit-confirm");

  await page.getByRole("button", { name: SUBMIT_ANSWERS }).click();

  // けっか: 自分の こたえと 正解が 並び、せつめいも 読める
  await expect(page.getByText("ぜんぶの こたえ")).toBeVisible();
  await expect(page.getByText("あなたの こたえ").first()).toBeVisible();
  // 1文字ずつ ルビが 入る 語（客きゃく先さき…）なので、あいだを 空けて さがす
  await expect(page.getByText(/客.*先.*常.*駐/).first()).toBeVisible();
  await expect(page.getByText(/正解/).first()).toBeVisible();
  // ルビが 合成されるので「書かいて」に なる。ふりがなの 入らない ところで さがす
  await expect(page.getByText(/いて いません/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "まちがえた もんだいだけ" })).toBeVisible();
  await shot(page, "25-quiz-submit-result");

  // まちがえた もんだいだけ を 押しても、やりかたは まとめて 出す のまま
  await page.getByRole("button", { name: "まちがえた もんだいだけ" }).click();
  await expect(page.getByText("もんだい 1 / 6")).toBeVisible();
  await expect(page.getByRole("button", { name: /つぎ →|さいごに かくにん →/ })).toBeVisible();
});

test("1問も 書かずに「出す」道は ない（7回 おすだけで おわらない）", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 一度も 選択肢に さわらずに かくにん画面まで 行く
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "つぎ →" }).click();
  }
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();

  // 出す ボタンは 出さない。もんだいへ 帰る 道だけを 出す
  await expect(page.getByRole("button", { name: SUBMIT_ANSWERS })).toHaveCount(0);
  await expect(page.getByText(/1もんも/)).toBeVisible();
  await page.getByRole("button", { name: /もどって/ }).click();
  await expect(page.getByText("もんだい 6 / 6")).toBeVisible();
});

test("出した あとに 開き直しても、にせの「つづき」に ならない", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 1問だけ 書いて 出す（＝書いた数と 問題数が ちがう まま おわる）
  await choiceButtons(page).nth(0).click();
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "つぎ →" }).click();
  }
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();
  await page.getByRole("button", { name: SUBMIT_ANSWERS }).click();
  await expect(page.getByText("ぜんぶの こたえ")).toBeVisible();

  // 開き直したら「はじめから」。2問目から 始まって 1問目に 戻れない、が 起きない
  await page.reload();
  await expect(page.getByText("まえの つづきから")).toHaveCount(0);
  await page.getByRole("button", { name: START_SUBMIT }).click();
  await expect(page.getByText("もんだい 1 / 6")).toBeVisible();
  await expect(page.getByText("こたえた 0 / 6")).toBeVisible();
});

test("きもち→言い方の 2段階も、まとめて 出す で えらび直せる", async ({ page, context }) => {
  await seedCompleted(context, ["m2-asakai-manga", "m2-asakai-article", "sample_asakai"]);
  await page.goto("/asakai/quiz");
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 1問目（4択）を こたえて 2問目（きもち）へ
  await choiceButtons(page).nth(0).click();
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(page.getByText("もんだい 2 / 5")).toBeVisible();

  // きもちを えらぶと 言い方の 段に 進む（合って いるかは 出さない）
  await choiceButtons(page).nth(0).click();
  await expect(page.getByText("よく できました")).toHaveCount(0);
  // 合って いるかは 出さない かわりに、**えらんだ ものは 残す**
  await expect(page.getByText(/えらんだ きもち/)).toBeVisible();
  // ルビの まわりに 空白が 入る ことが あるので、ふりがなの 手前で さがす
  const redo = page.getByRole("button", { name: /きもちを えらび/ });
  await expect(redo).toBeVisible();

  // きもちを えらび直せる。言い方を えらぶまでは「こたえた」に 数えない
  await expect(page.getByText("こたえた 1 / 5")).toBeVisible();
  await redo.click();
  await choiceButtons(page).nth(1).click();
  await choiceButtons(page).nth(0).click();
  await expect(page.getByText("こたえた 2 / 5")).toBeVisible();
});

test("書いた こたえを 消したら、つぎに 開いても 生き返らない", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz2));
  await page.goto(KAISHA.quiz2.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 自由入力の もんだいに 書いてから 自分で 消す（1ページなので 進む 必要が 無い）
  const box = page.getByLabel("こたえを 入力する").first();
  await box.fill("くるま");
  await expect(page.getByText("こたえた 1 / 9")).toBeVisible();
  await box.fill("");
  await expect(page.getByText("こたえた 0 / 9")).toBeVisible();

  // 離脱して 戻る。画面が 0と 言った なら、端末の 中も 0で ある
  await page.goto("/kaisha");
  await page.goto(KAISHA.quiz2.path);
  await expect(page.getByText("まえの つづきから")).toHaveCount(0);
  await expect(page.getByText(/書きました/)).toHaveCount(0);
});

/*
 * 「しおり（位置）だけが 残って いる」回の 案内（「まえに 見て いた ◯もんめから」）は
 * **1問ずつ の 教材でしか 起きない**——まとめて 出す では 下書きが 無ければ はじめから で、
 * どこからでも 行き来できるので 位置を 戻す 意味が 無い。いま 1問ずつ に して いる
 * 教材が 無いので、ここでは 通せない（`tests/quiz_resume.test.ts` が 純関数で 見ている）。
 */

/**
 * 出した 回は **成績に 残り、ステージも おわる**。
 *
 * 成績を 残すかどうかは「教材ぜんぶに 触れた回か」で 決めている
 *（`quiz-reducer.ts` の `isWholeSetRun`。しおりだけで 途中から 始めた 回を
 * 「全問正解・合格」で 固めない ための 線引き）。まとめて 出す は 書かなかった 問題も
 * 1行 残す ので **触れた回**であり、ここが 落ちると **既定の やりかたで 成績が
 * まるごと 消える**。線引きの 内側に いる ことを 機械で 押さえておく。
 */
test("出した 回は 成績に 残り、ステージも おわりに なる", async ({ page, context }) => {
  await seedCompleted(context, itemsBefore(KAISHA.quiz1));
  await page.goto(KAISHA.quiz1.path);
  await page.getByRole("button", { name: START_SUBMIT }).click();

  // 1問だけ 書いて 出す（書かなかった 5問も「書けずに 出した」として 数に 入る）
  await choiceButtons(page).nth(0).click();
  for (let i = 0; i < 5; i += 1) {
    await page.getByRole("button", { name: "つぎ →" }).click();
  }
  await page.getByRole("button", { name: "さいごに かくにん →" }).click();
  await page.getByRole("button", { name: SUBMIT_ANSWERS }).click();
  await expect(page.getByText("ぜんぶの こたえ")).toBeVisible();

  expect(await readTestResult(page, KAISHA.quiz1.id)).toMatchObject({
    stageId: KAISHA.quiz1.id,
    total: 6,
    passed: false,
  });

  await page.goto("/kaisha");
  await expect(page.getByText(progressText(2))).toBeVisible();
});
