import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * ことばアーケード — **⭕と ❌ が ひと目で 分かる**（2026-08-26 の 指摘2・3・5・6）
 *
 * ユーザーの ことば:
 *   「誤った語を入れても正解になってしまう」
 *   「正解と間違いの表示の違いがわかりにくい（色分けなどするか⭕️❌表示入れるなどして）」
 *   「最終結果で『合格』『不合格』を明確に記載して」
 *   「最終結果画面でゼロからやり直すボタンはなし」
 *
 * 点の 数え方は 前から 正しかった（`tests/arcade_reducer.test.ts` が 固定して いる）。
 * **同じ 顔で 次へ 進んで いた**のが 問題だったので、ここでは *画面* を 見る。
 * しるしは **記号と ことばの 両方**（色だけに たよらない。提出の 画面と 同じ 作法）。
 */

/** 8語の 小さな セット。1回の 通しが 短い。 */
const SET_ID = "hajimari_kotoba";
const SET = `/arcade/${SET_ID}`;

/** 1問の こたえ（正解の 1語と、誤答3つ）。 */
interface Answer {
  readonly correct: string;
  readonly wrong: readonly string[];
}

/**
 * セットの こたえ表（表記 → 正解＋誤答）。**教材から 読む**
 *（`helpers.ts` の `HOUKOKU_TOTAL` と 同じ 作法。語も 数も ベタ書きしない）。
 *
 * これが 無いと「わざと 外す」が できない——どの語が 出るかも、4択の 並びも
 * 乱数で 決まる ので、押す 前に 正解を 知って いる 必要が ある。
 * 組み立ては アプリと 同じ 道（`src/lib/vocabulary.ts` の `gameWordsOf`）:
 * wordstage の `wordIds` から ことばの 正を 引き、**対訳の1語（`englishTerm`）と
 * 誤答3つ（`wrongMeanings`）が そろった 語だけ**が ゲームに 出る。
 */
const ANSWERS: ReadonlyMap<string, Answer> = (() => {
  const root = join(__dirname, "..", "..");
  const set = JSON.parse(
    readFileSync(join(root, "content", "wordstages", `${SET_ID}.json`), "utf8"),
  ) as { wordIds: string[] };
  const vocab = JSON.parse(
    readFileSync(join(root, "content", "vocab", "vocabulary.json"), "utf8"),
  ) as { words: { id: string; term: string; englishTerm?: string; wrongMeanings?: string[] }[] };

  const byId = new Map(vocab.words.map((word) => [word.id, word]));
  const table = new Map<string, Answer>();
  for (const id of set.wordIds) {
    const word = byId.get(id);
    if (!word?.englishTerm || word.wrongMeanings?.length !== 3) continue;
    table.set(word.term, { correct: word.englishTerm, wrong: word.wrongMeanings });
  }
  if (table.size === 0) throw new Error(`${SET_ID} に 遊べる ことばが 1つも ありません`);
  return table;
})();

/** 4択の 札を 1つ、書いてある ことばで 掴む。 */
function choice(page: Page, label: string): Locator {
  return page
    .getByRole("group", { name: "いみの こたえ" })
    .getByRole("button", { name: label, exact: true });
}

/**
 * こたえた あとに 出る 解説カード（押すと つぎの 問題へ）。
 *
 * **カードの 中の 字で 掴まない。** 前は えらんだ こたえを `getByText(/^（.+）$/)` で
 * 見て いたが、同じ カードの 足もとに ある「（おす／Enter で つぎへ）」にも 当たる。
 * 外した ときだけ 2つに なって Playwright の strict mode が 投げ、それを
 * `.catch(() => false)` が 飲んで いた——**当たりと 外れが 逆さま**に 読まれ、
 * 外し つづけた ときだけ「6問 つづけて 正解を 引いた」で 落ちて いた
 *（4回に 1回。実測 (3/4)^6 ≒ 18%。2026-08-30 に 直した）。
 */
function explainCard(page: Page): Locator {
  return page.getByRole("button", { name: /おす／Enter で つぎへ/ });
}

/**
 * いま 出て いる ことばの こたえを こたえ表から 引く。
 *
 * 4択の あいだ、画面の まん中には 用語が 出て いる（`McqTerm`）。読むのは
 * **地の 字だけ**——`<ruby>手紙<rt>てがみ</rt></ruby>` の よみまで 混ぜると 表が 引けない。
 */
async function askedAnswer(page: Page): Promise<Answer> {
  const term = await page
    .locator("ruby.mcq-term")
    .first()
    .evaluate((el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(""),
    );
  const answer = ANSWERS.get(term);
  if (!answer) throw new Error(`こたえ表に ない ことばが 出ました: ${term}`);
  return answer;
}

/**
 * 解説カードを 押して つぎの 問題へ。**押せなくても 進む**。
 *
 * この 画面には **自動送り**が あり、押すのと 競走して いる。自動送りが
 * 先に 動くと、押そうと して いた カードが その場で DOM から 消える
 *（Playwright の ログでは `element was detached from the DOM` と 出る。
 * その 前後には 覆いの `absolute inset-0` が クリックを 遮る 瞬間も ある）。
 *
 * 3回に 1回ほど ここで 落ちて いた——**画面の 不具合では なく、押し方の 問題**。
 * どちらの 道でも 次の 問題へ 進むので、押せなかった ときは 自動送りに まかせる。
 * 進んだ ことは、呼ぶ 側が「つぎの 問題が 出たか」で 確かめる。
 */
async function advance(page: Page): Promise<void> {
  await explainCard(page)
    .click({ timeout: 3_000 })
    .catch(() => {});
}

test("よみを 外すと 入力欄が 空に なり、正しく 打てるまで 何度でも やり直せる", async ({
  page,
}) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /れんしゅう/ }).click();

  const input = page.getByRole("textbox", { name: "よみを ひらがなで 入力する" });
  await expect(input).toBeVisible({ timeout: 20_000 });

  // 1回目の 打ちまちがい。合図は **❌ の しるしだけ**（文は 出さない）
  await input.fill("ぜんぜんちがうよみ");
  await input.press("Enter");
  await expect(page.getByLabel("ちがう")).toBeVisible();
  await expect(input).toHaveValue(""); // 入力した 字は 消える
  await expect(input).toBeVisible(); // **まだ 読みの 番**（4択に 進んで いない）
  await expect(page.getByText("英語の 意味を えらぼう！")).toHaveCount(0);

  // 2回目の 打ちまちがいでも 同じ。番は 終わらない
  await input.fill("これもちがう");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.getByText("英語の 意味を えらぼう！")).toHaveCount(0);
});

test("こたえた あと、**正しい こたえ**が ⭕ つきで 出る", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  /*
   * **わざと 外す**。前は `choices.first()` を 6回まで 押して 外れるのを 待って いたので、
   * 何を 見た かが 走らせる たびに 変わって いた。出て いる ことばを 読んで 誤答を
   * 名指しで 押せば、外した ときと 当てた ときを **1回ずつ 確かに** 通せる。
   */
  const missed = await askedAnswer(page);
  const chosen = missed.wrong[0]!;
  await choice(page, chosen).click();

  /*
   * カードは 2.8秒で 自動送りされる ので、**1回 読んでから** 調べる
   *（`toContainText` を 2つ 並べると、2つ目の 手前で カードが 消えうる）。
   */
  const afterMiss = (await explainCard(page).textContent()) ?? "";
  expect(afterMiss).toContain(`❌ちがう（${chosen}）`); // ❌ の しるしと、えらんだ こたえ
  expect(afterMiss).toContain(`⭕${missed.correct}`); // そして **正しい こたえ**が ⭕ つきで

  await advance(page);
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });

  // 当てた ときも 同じ カードに 正しい こたえが 出る（しるしだけが 変わる）
  const hit = await askedAnswer(page);
  await choice(page, hit.correct).click();

  const afterHit = (await explainCard(page).textContent()) ?? "";
  expect(afterHit).toContain("⭕せいかい");
  expect(afterHit).toContain(`⭕${hit.correct}`);
});

test("さいごまで やると 合格か 不合格が はっきり 出て、ゼロからの やり直しは 無い", async ({
  page,
}) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();

  const result = page.getByRole("heading", { name: /^(合格|不合格)$/ });
  const choices = page.getByRole("group", { name: "いみの こたえ" }).getByRole("button");

  // セットの ことばを **ぜんぶ** 出す ように したので、8問 とも 出る（8語の セット）
  for (let i = 0; i < 12; i += 1) {
    if (await result.isVisible().catch(() => false)) break;
    if (
      await choices
        .first()
        .isVisible({ timeout: 20_000 })
        .catch(() => false)
    ) {
      await choices.first().click();
      await advance(page);
    }
  }

  await expect(result).toBeVisible({ timeout: 20_000 });
  // 記号でも 出す（色だけに たよらない）
  await expect(page.getByText(/⭕|❌/).first()).toBeVisible();
  // 点・満点・合格ライン が 同じ 画面に ある
  await expect(page.getByText(/\d+ \/ \d+ 点/)).toBeVisible();
  await expect(page.getByText(/合格ライン \d+ 点/)).toBeVisible();
  // ゼロから やり直す 札は 置かない
  await expect(page.getByRole("button", { name: "もう一度" })).toHaveCount(0);
});

test("とちゅうで やめたら 合否は 出さない", async ({ page }) => {
  await page.goto(SET);
  await page.getByRole("button", { name: /もんだいだけ/ }).click();
  await expect(page.getByText("英語の 意味を えらぼう！")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "やめる" }).click();

  await expect(page.getByRole("heading", { name: "とちゅうまで" })).toBeVisible();
  await expect(page.getByText("さいごまで やると 合格か どうかが 出ます。")).toBeVisible();
});

test("あそぶ 前に ルールが 書いてある", async ({ page }) => {
  await page.goto(SET);
  // 「よみ」と「いみ」を 1つずつ 数える こと、何点で 合格かが 出て いる
  await expect(page.getByText(/よみ（ひらがな）と いみ（英語）/)).toBeVisible();
  await expect(page.getByText(/点で 合格です/)).toBeVisible();
});
