import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedCompleted, shot } from "./helpers";

/**
 * リスニングの 原稿（穴埋めの 形）
 *
 * 1. **既定で 出る**（2026-09-16 の 指定「デフォルトの 原稿表示を ON に」）
 * 2. **伏せた 四角が 枠の 外へ はみ出さない**（同日の 指摘「長文だと 文が はみ出る」）。
 *    伏せ字を 全角スペースに して いた ころは、行末で 折り返されずに 枠の 外へ
 *    ぶら下がって いた（CSS の 決まり。`listening-panel.tsx` の `HIDDEN_GLYPH`）。
 *
 * 報告の リスニングで 見る——ナレーションと 会話を 合わせて 12行 あり、
 * 長い 行（「今 作って いる システムに…」）で 実際に はみ出して いた。
 */

const STAGE = "houkoku";
const LISTENING = "houkoku_listening";

/** 順番の 関門を 出さない ために、この リスニングより 前の 教材を 済みに する。 */
function before(): string[] {
  const stage: { contents: { ref: string }[] } = JSON.parse(
    readFileSync(join("content", "stages", `${STAGE}.json`), "utf8"),
  );
  const refs = stage.contents.map((item) => item.ref);
  return refs.slice(0, refs.indexOf(LISTENING));
}

/** 原稿の 枠の 中身の 右端より 外へ 出た「伏せた 四角」の 数。 */
async function overflowing(page: Page): Promise<{ hidden: number; lines: number; out: number }> {
  return page.locator('[aria-label="原稿"]').evaluate((box) => {
    const style = getComputedStyle(box);
    const rect = box.getBoundingClientRect();
    const right = rect.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    const hidden = [...box.querySelectorAll<HTMLElement>("span[aria-hidden]")];
    const tops = new Set(hidden.map((span) => Math.round(span.getBoundingClientRect().top)));
    return {
      hidden: hidden.length,
      lines: tops.size,
      out: hidden.filter((span) => span.getBoundingClientRect().right > right + 0.5).length,
    };
  });
}

for (const width of [390, 1280]) {
  test(`リスニング：原稿は 既定で 出て、伏せ字が 枠から はみ出さない（幅 ${width}px）`, async ({
    page,
    context,
  }) => {
    await seedCompleted(context, before());
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/${STAGE}/listening`);
    await page.getByRole("button", { name: "はじめる" }).click();

    // 1. 押さなくても 原稿が 出て いる
    await expect(page.getByRole("button", { name: "げんこう ON" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[aria-label="原稿"]')).toBeVisible();

    // 途中まで 当てた 形に する（添付の 画面と 同じく、見える 字と 伏せた 字が 混ざる）
    const input = page.getByLabel("聞こえた ことばを 入力する");
    for (const word of ["報告", "大切", "藤木", "システム", "バグ"]) {
      await input.fill(word);
      await input.press("Enter");
    }

    // 2. はみ出さない。**空回りしない**ように、伏せ字が 何行にも わたって いる ことも 見る
    const measured = await overflowing(page);
    expect(measured.hidden, "伏せた 字が 無い（物差しが 空回りする）").toBeGreaterThan(100);
    expect(
      measured.lines,
      "伏せ字が 1行に 収まって いる（折り返しを 見て いない）",
    ).toBeGreaterThan(3);
    expect(measured.out, "伏せた 四角が 原稿の 枠から はみ出して いる").toBe(0);

    await page.locator('[aria-label="原稿"]').scrollIntoViewIfNeeded();
    await shot(page, `listening-genkou-${width}`);
  });
}
