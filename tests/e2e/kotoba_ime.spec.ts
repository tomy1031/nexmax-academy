import { expect, test, type CDPSession } from "@playwright/test";
import { shot } from "./helpers";

/**
 * 単語テスト — 日本語入力（IME）の 確定の Enter で 先へ 進めない
 *
 * テストの前の「ひらがな入力チェック」で、打った字が 消えない 不具合が あった
 * （2026-08-25 実発生）。原因は **変換を 確定する Enter**を けってい と
 * 取り違えて いたこと。Chrome は 変換の 途中の Enter を
 * `key="Enter" / keyCode=229 / isComposing=true` で 送るので、`key` だけを 見ると
 * 学習者が 決める 前に 次の お題へ 進んで しまう。そのあと IME が 確定した 字を
 * 入力欄に 入れ直す ので、**次の お題に 前の 字が 残った まま**に なる。
 *
 * 手で 日本語を 打って 確かめる ことは できないので、ここでは CDP の
 * `Input.imeSetComposition` で 本物の IME と 同じ 順番を 作る（Chromium 専用。
 * playwright.config.ts の browserName は chromium）。
 */

/** IMEで 打って、変換を 確定する Enter を 押す（実機と 同じ 順番）。 */
async function imeTypeAndCommit(cdp: CDPSession, text: string) {
  await cdp.send("Input.imeSetComposition", {
    text,
    selectionStart: text.length,
    selectionEnd: text.length,
  });
  // 変換の 途中の Enter。IME が 使う キーなので 仮想キーコードは 229。
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 229,
    nativeVirtualKeyCode: 229,
  });
  // IME が 確定して 字を 入れる（compositionend → input）。
  await cdp.send("Input.insertText", { text });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });
}

test("ひらがな入力チェック: 変換の Enter では 進まず、次の お題で 入力欄が 空になる", async ({
  page,
  context,
}) => {
  await page.goto("/wordtest/hajimari_kotoba");
  await page
    .getByRole("button", { name: /テスト/ })
    .first()
    .click();
  await expect(page.getByText("ひらがな入力チェック")).toBeVisible();

  const input = page.getByLabel("ひらがなで 入力する");
  const task = page.locator("p.text-4xl").first();
  await expect(task).toHaveText("あいうえお");
  await input.click();

  const cdp = await context.newCDPSession(page);
  await imeTypeAndCommit(cdp, "あいうえお");

  // 変換を 決めた だけ。お題は そのまま で、打った 字は 欄に 残っている。
  await expect(task).toHaveText("あいうえお");
  await expect(input).toHaveValue("あいうえお");

  // 学習者が 次に 押す Enter が「けってい」。ここで はじめて 次の お題へ。
  await page.keyboard.press("Enter");
  await expect(task).toHaveText("ようけんていぎ");
  // ここが 不具合の 本体——前の 字が 残らない。
  await expect(input).toHaveValue("");
  await shot(page, "70-hiragana-check-ime");
});

test("ゲームの よみ入力欄も、変換の Enter では こたえに ならない", async ({ page, context }) => {
  await page.goto("/wordtest/hajimari_kotoba");
  await page
    .getByRole("button", { name: /テスト/ })
    .first()
    .click();

  const check = page.getByLabel("ひらがなで 入力する");
  for (const word of ["あいうえお", "ようけんていぎ"]) {
    await check.click();
    await check.fill(word);
    await page.keyboard.press("Enter");
  }

  const reading = page.getByLabel("よみを ひらがなで 入力する");
  await expect(reading).toBeVisible();
  await reading.click();

  const cdp = await context.newCDPSession(page);
  await imeTypeAndCommit(cdp, "あいうえお");

  // 変換を 決めた だけなので、まだ よみの 入力の まま（意味の4択に 飛ばない）。
  await expect(page.getByText("英語の 意味を えらぼう！")).toHaveCount(0);
  await expect(reading).toHaveValue("あいうえお");
});
