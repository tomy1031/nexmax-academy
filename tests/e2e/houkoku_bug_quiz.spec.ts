import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * バグ報告ゲーム（報告ステージ・「会社の ポジション」の つぎ）
 *
 * 2026-09-23 の 指定。元は 別ページ（`bug_report/`）で、いまは もんだいの 型 `bugreport`。
 * 見張るのは:
 *  1. 説明ページ（絵つき）→ もんだい の 順で ステージに 並ぶ
 *  2. テストする サイトが iframe で 出る（8画面・バグ 2つの 画面は さいごの 2問）
 *  3. **60点 以下は「つぎ →」が 押せない**（点は 下書きに 入る——話した 回を 再現して 見る）
 *  4. 鍵が 無い 端末は 止めない: ①〜④を ぜんぶ 書けば 進める（登録は うながす）
 *  5. 学習者が 読む 文に 裸の 漢字が 無い（iframe の 外）
 *
 * 🎤 と Gemini Live の 往復そのものは 鍵ゼロの CI では 通せない（AIが 返す 点を
 * 下書きに 置いて、画面の 出し分けと 関門だけを 見る）。
 */

const QUIZ = "houkoku_bug_quiz";
const PATH = `/houkoku/quiz-${QUIZ}`;
const INTRO = "/houkoku/article-houkoku_bug_intro";

async function seedUpTo(context: BrowserContext, ref: string) {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const at = stage.contents.findIndex((content) => content.ref === ref);
  expect(at, `報告ステージに ${ref} が 無い`).toBeGreaterThan(0);
  await seedCompleted(
    context,
    stage.contents.slice(0, at).map((content) => content.ref),
  );
}

/** その バグの 欄に 書く（ルビの 無い aria-label で 引く）。 */
async function writeReport(
  page: Page,
  card: string,
  values: readonly [string, string, string, string],
) {
  const box = page.locator(`#${card}`);
  const labels = [
    "① どの 画面ですか？",
    "② 何を しましたか？",
    "③ どうなりましたか？",
    "④ 本当は どうなる はずですか？",
  ];
  for (const [i, label] of labels.entries()) {
    await box.getByLabel(label).fill(values[i]!);
  }
}

test.use({ viewport: { width: 390, height: 844 } });

test("バグ報告: 説明ページは 会社の ポジションの つぎ・3つの 手順に 絵が ある", async ({
  page,
  context,
}) => {
  const stage = JSON.parse(readFileSync(join("content", "stages", "houkoku.json"), "utf8")) as {
    contents: { ref: string }[];
  };
  const refs = stage.contents.map((one) => one.ref);
  expect(
    refs.slice(refs.indexOf("houkoku_hierarchy"), refs.indexOf("houkoku_hierarchy") + 3),
  ).toEqual(["houkoku_hierarchy", "houkoku_bug_intro", "houkoku_bug_quiz"]);

  await seedUpTo(context, "houkoku_bug_intro");
  await page.goto(INTRO);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const src of ["hero", "step1_use", "step2_find", "step3_report"]) {
    await expect(page.locator(`img[src*="houkoku_bug/${src}"]`).first()).toBeVisible();
  }
  // 2026-09-23 の 指定で 外した 1文（よけいな ことを 考えさせない）
  await expect(page.getByText(/修正方法/)).toHaveCount(0);
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "houkoku-bug-01-intro");
});

test("バグ報告: 鍵が 無い 端末は ①〜④を ぜんぶ 書くと 進める", async ({ page, context }) => {
  await seedUpTo(context, QUIZ);
  await page.goto(PATH);
  await page.getByRole("button", { name: "はじめる" }).click();

  // 1問目は フード注文画面（テストする サイトが 中に 入って いる）
  await expect(page.locator('iframe[src$="site1-food-order/app.html"]')).toBeVisible();
  const next = page.getByRole("button", { name: "つぎ →" });
  await expect(next).toBeDisabled();
  // 鍵の 登録を うながす（止めは しない）
  await expect(page.getByText(/APIキーが/)).toBeVisible();

  await writeReport(page, "bug-food-0", [
    "フード注文画面",
    "カートの ＋を 押しました。",
    "合計が 変わりませんでした。",
    "合計も 変わる はずです。",
  ]);
  // まとめて 報告しましょう の 1文が できる（元の report.js と 同じ 組み立て）
  await expect(page.getByText(/すると、/).first()).toBeVisible();
  await expect(next).toBeEnabled();
  // 欄の 中の 字は 学習者が 打った もの（画面の 文では ない）ので 除く
  const typed = [
    "カートの ＋を 押しました。",
    "合計が 変わりませんでした。",
    "合計も 変わる はずです。",
  ];
  expect((await bareKanjiTexts(page)).filter((text) => !typed.includes(text))).toEqual([]);
  await shot(page, "houkoku-bug-02-food-filled");

  await next.click();
  await expect(page.locator('iframe[src$="site2-login/app.html"]')).toBeVisible();
});

test("バグ報告: 60点 以下は つぎへ 進めない・75点で 進める", async ({ page, context }) => {
  await seedUpTo(context, QUIZ);
  const judged = (ok: number) => ({
    screen: "フード注文画面",
    action: "＋を 押しました。",
    result: "合計が 変わりませんでした。",
    expected: "合計も 変わる はずです。",
    spoken: "フード注文画面で、プラスを 押しました。",
    score: ok * 25,
    items: ["screen", "action", "result", "expected"].map((id, i) => ({
      id,
      ok: i < ok,
      note: "",
    })),
    polished: ok >= 3 ? "フード注文画面で、＋を 押しました。" : "",
    skipped: false,
  });
  const seed = async (ok: number) =>
    page.evaluate((report) => {
      window.localStorage.setItem(
        "nexmax:v1:quiz-resume:houkoku_bug_quiz",
        JSON.stringify({
          quizSetId: "houkoku_bug_quiz",
          results: [],
          mode: "submit",
          drafts: { food: { kind: "bugreport", reports: [report] } },
          index: 0,
          checked: {},
        }),
      );
    }, judged(ok));

  await page.goto(PATH);
  await seed(2);
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  // 点は 最初に 大きく「50 / 100」＋「もういちど」（2026-09-23 の 指定）
  await expect(page.getByTestId("bug-score")).toHaveText(/50\s*\/ 100/);
  await expect(page.getByText("もういちど", { exact: true })).toBeVisible();
  // 話した ことばが 出る（ルビが 語の 中に 入るので、かなの ところで 引く）
  await expect(page.getByText(/プラスを/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "つぎ →" })).toBeDisabled();
  await shot(page, "houkoku-bug-03-50pt-blocked");

  await seed(3);
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByTestId("bug-score")).toHaveText(/75\s*\/ 100/);
  await expect(page.getByText("OK", { exact: true })).toBeVisible();
  // ブラッシュアップは 点の すぐ 下に 大きく（2026-09-23 の 指定）
  await expect(page.getByText(/ブラッシュアップ/).first()).toBeVisible();
  await shot(page, "houkoku-bug-05-75pt-brushup");
  await expect(page.getByRole("button", { name: "つぎ →" })).toBeEnabled();
});

test("バグ報告: バグが 2つの 画面は さいごの 2問で、2つの 欄と 見つけた かずが 出る", async ({
  page,
  context,
}) => {
  await seedUpTo(context, QUIZ);
  await page.goto(PATH);
  await page.evaluate(() => {
    window.localStorage.setItem(
      "nexmax:v1:quiz-resume:houkoku_bug_quiz",
      JSON.stringify({
        quizSetId: "houkoku_bug_quiz",
        results: [],
        mode: "submit",
        drafts: {
          search: {
            kind: "bugreport",
            reports: [
              {
                screen: "",
                action: "rice",
                result: "",
                expected: "",
                spoken: "",
                score: null,
                items: [],
                polished: "",
                skipped: false,
              },
            ],
          },
        },
        index: 6,
        checked: {},
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.locator('iframe[src$="site3-search-filter/app.html"]')).toBeVisible();
  await expect(page.locator("#bug-search-0")).toBeVisible();
  await expect(page.locator("#bug-search-1")).toBeVisible();
  await expect(page.getByText(/かず: 0 \/ 2/)).toBeVisible();
  expect(await bareKanjiTexts(page)).toEqual([]);
  await shot(page, "houkoku-bug-04-search-two-bugs");
});

test("バグ報告: 3回 だめだったら 字でも 出せる（2回までは 🎤だけ）", async ({ page, context }) => {
  await seedUpTo(context, QUIZ);
  const report = (tries: number) => ({
    screen: "フード注文画面",
    action: "＋を 押しました。",
    result: "合計が 変わりませんでした。",
    expected: "合計も 変わる はずです。",
    spoken: "フード注文画面で、プラスを 押しました。",
    score: 50,
    items: ["screen", "action", "result", "expected"].map((id, i) => ({
      id,
      ok: i < 2,
      note: "",
    })),
    polished: "",
    skipped: false,
    tries,
    corrected: "フード注文画面で、＋を 押しました。",
  });
  const seed = async (tries: number) =>
    page.evaluate((one) => {
      window.localStorage.setItem(
        "nexmax:v1:quiz-resume:houkoku_bug_quiz",
        JSON.stringify({
          quizSetId: "houkoku_bug_quiz",
          results: [],
          mode: "submit",
          drafts: { food: { kind: "bugreport", reports: [one] } },
          index: 0,
          checked: {},
        }),
      );
      // 🎤の ボタンを 出す（鍵の 中身は 見ない——字の 欄の 出し分けだけを 見る）
      window.localStorage.setItem("nexmax.geminiKey", "e2e-dummy");
    }, report(tries));

  await page.goto(PATH);
  await seed(2);
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByTestId("bug-score")).toHaveText(/50\s*\/ 100/);
  await expect(page.getByLabel("報告の 文")).toHaveCount(0);

  await seed(3);
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  const box = page.getByLabel("報告の 文");
  await expect(box).toBeVisible();
  const send = page.getByRole("button", { name: "送る" });
  await expect(send).toBeDisabled();
  await box.fill("フード注文画面で、＋を 押しました。");
  await expect(send).toBeEnabled();
  await shot(page, "houkoku-bug-06-type-after-3");
});

test("バグ報告: 文法の 直しが あれば「📝 文法」に 出る（2026-09-25 の 指定）", async ({
  page,
  context,
}) => {
  await seedUpTo(context, QUIZ);
  await page.goto(PATH);
  await page.evaluate(() => {
    window.localStorage.setItem(
      "nexmax:v1:quiz-resume:houkoku_bug_quiz",
      JSON.stringify({
        quizSetId: "houkoku_bug_quiz",
        results: [],
        mode: "submit",
        drafts: {
          food: {
            kind: "bugreport",
            reports: [
              {
                screen: "フード注文画面",
                action: "＋を 押しました。",
                result: "合計が 変わりませんでした。",
                expected: "合計も 変わる はずです。",
                spoken: "フード注文画面で、プラスを 押しました。",
                score: 50,
                items: ["screen", "action", "result", "expected"].map((id, i) => ({
                  id,
                  ok: i < 2,
                  note: "",
                })),
                polished: "",
                skipped: false,
                tries: 1,
                grammar: [
                  {
                    said: "ごうけいが かわらなかった",
                    fix: "ごうけいが かわりませんでした",
                    why: "しごとの ほうこくは ですます で いいます。",
                  },
                ],
              },
            ],
          },
        },
        index: 0,
        checked: {},
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "つづきから" }).click();
  await expect(page.getByText(/📝/)).toBeVisible();
  // 引いた 点を 箱に 書く（1つ 2点。2026-09-25「少し引く」）
  await expect(page.getByText(/−2/)).toBeVisible();
  await expect(page.getByText(/かわりませんでした/).first()).toBeVisible();
  // 欄の 中の 字は 学習者が 打った もの（画面の 文では ない）ので 除く。
  // 「下の ヒントを 見て」の 見て は ここで 見つかった（ふりがな 無しだった）
  const typed = ["＋を 押しました。", "合計が 変わりませんでした。", "合計も 変わる はずです。"];
  expect((await bareKanjiTexts(page)).filter((text) => !typed.includes(text))).toEqual([]);
  await shot(page, "houkoku-bug-07-grammar");
});

/*
 * テストする サイトが **本来の バグどおりに** 動くか（2026-09-25）。
 * `status` を id の まま 書くと window.status（組み込みの 文字列）に なり、
 * お問い合わせは 何を しても「まだ 送信していません」、プロフィールは エラーで
 * 「保存しました。」が 出なかった。
 */
test("バグ報告: お問い合わせは 名前と メールが 空でも 送信できて しまう（本来の バグ）", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tools/bug_report/site6-contact/app.html");
  const status = page.locator("#status");
  await page.locator("#send").click();
  await expect(status).toContainText("メッセージを");
  await page.locator("#message").fill("hello");
  await page.locator("#send").click();
  await expect(status).toContainText("ありがとうございました");
  expect(errors).toEqual([]);
});

test("バグ報告: プロフィールは「保存しました。」が 出るのに 名前が 変わらない（本来の バグ）", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tools/bug_report/site8-profile/app.html");
  const before = await page.locator("#displayName").innerText();
  await page.locator("#name").fill("Sok");
  await page.locator("#bio").fill("こんにちは");
  await page.locator("#save").click();
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#displayBio")).toHaveText("こんにちは");
  await expect(page.locator("#displayName")).toHaveText(before);
  expect(errors).toEqual([]);
});
