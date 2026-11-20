import { expect, test, type Frame, type Page } from "@playwright/test";
import { shot } from "./helpers";

/**
 * 期末テスト対策（ステージ `test-taisaku`）の まとめページ — 静的な 1枚が アプリの 中で 動くか
 *
 * 見張るのは 3つ:
 *  1. ステージの リンクから 開くと、4つの カートリッジ（会社を 知る・報告・連絡・相談）が 並ぶ
 *  2. カートリッジを 開くと メモの 絵が 読めて、画面に ふりがなの ない 漢字が 無い（必ず守るルール2）
 *  3. 4つ ぜんぶ クリアすると、アプリ側が「✅ おわりました」に なる（iframe → 親への 合図）
 *
 * 文言・もんだいの 形は `tests/kimatsu_matome_tool.test.ts` が 見る。
 */
const PATH = "/test-taisaku/link";
const KEY = "kimatsu_matome_v1";
const CARTS = ["kaisha", "houkoku", "renraku", "soudan"];

async function openTool(page: Page): Promise<Frame> {
  await page.goto(PATH);
  await page
    .getByRole("button", { name: /ひらく/ })
    .first()
    .click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".cart")).toHaveCount(CARTS.length);
  const found = page.frames().find((one) => one.url().includes("kimatsu_matome.html"));
  if (!found) throw new Error("まとめページの iframe が 見つからない");
  return found;
}

/** iframe の 中の「ルビの 外の 漢字」（helpers の bareKanjiTexts と 同じ 見方）。 */
async function bareKanji(frame: Frame): Promise<string[]> {
  return frame.evaluate(() => {
    const KANJI = /[々一-鿿]/;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? "";
      if (KANJI.test(text)) {
        let element = node.parentElement;
        let covered = false;
        while (element) {
          if (["RUBY", "SCRIPT", "STYLE", "TEMPLATE"].includes(element.tagName)) {
            covered = true;
            break;
          }
          element = element.parentElement;
        }
        if (!covered) found.push(text.trim());
      }
      node = walker.nextNode();
    }
    return [...new Set(found)];
  });
}

test("期末テスト対策: 4つの カートリッジ・メモの 絵・ふりがな", async ({ page }) => {
  const frame = await openTool(page);
  expect(await bareKanji(frame)).toEqual([]);
  await shot(page, "kimatsu-01-home");

  for (const id of CARTS) {
    await frame.locator(`.cart[data-id="${id}"]`).click();
    await expect(frame.locator("#theme.active")).toBeVisible();
    // メモの 絵が ぜんぶ 読めて いる（404 なら naturalWidth が 0）
    const images = frame.locator(".memo-illust");
    expect(await images.count()).toBeGreaterThanOrEqual(4);
    await expect
      .poll(() =>
        images.evaluateAll((list) =>
          (list as HTMLImageElement[]).every((img) => img.complete && img.naturalWidth > 0),
        ),
      )
      .toBe(true);
    expect(await frame.locator("#quizBox .quiz").count()).toBeGreaterThanOrEqual(12);
    expect(await bareKanji(frame), id).toEqual([]);
    if (id === "houkoku") await shot(page, "kimatsu-02-houkoku");
    await frame.locator("#backBtn").click();
    await expect(frame.locator("#home")).toBeVisible();
  }
});

test("期末テスト対策: 4つ ぜんぶ クリアすると アプリ側が ✅ に なる", async ({ page, context }) => {
  // 4つ クリアした 記録を 入れて おく（iframe も 同じ 置き場なので 読める）
  await context.addInitScript(
    ([key, ids]) => {
      const carts: Record<string, unknown> = {};
      for (const id of ids as string[])
        carts[id] = { solved: [], cleared: true, wrong: 0, stars: 3, bulkGraded: true };
      try {
        window.localStorage.setItem(key as string, JSON.stringify({ coins: 0, carts }));
      } catch {
        /* 記録できない ときは テストが 落ちて 気づく */
      }
    },
    [KEY, CARTS] as const,
  );
  await openTool(page);
  await expect(page.getByText("✅ おわりました").first()).toBeVisible();
});
