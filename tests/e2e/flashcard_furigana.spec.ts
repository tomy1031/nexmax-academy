import { expect, test, type Page } from "@playwright/test";

/**
 * フラッシュカードの ふりがな ON/OFF（2026-09-29 の 指定）
 *
 * ユーザーの ことば:「単語のwordtestでフラッシュカードのひらがなのON/OFF機能も作成してください」
 *
 * 見るのは:
 *  - はじめは ON（これまでと 同じ。おもての 語に よみが 出る）
 *  - OFF に すると おもての よみが 消える（要素は 残して 高さを 保つ）
 *  - OFF の まま めくると、うらに よみが 出る（答え合わせが できる）
 *  - つぎの カードへ 行っても OFF の まま
 *  - **押しなおしても 指の 下に 同じ ボタンが ある**（ON/OFF で 幅が 変わると、せまい
 *    画面で 折り返しが 入れかわり「じゅんばんを かえる」を 押して しまう。412px で 実測）
 */

async function openDeck(page: Page) {
  await page.goto("/wordtest/intro");
  await page.getByRole("button", { name: /フラッシュカード/ }).click();
  await expect(page.getByText(/フラッシュカード\s+1 \/ \d+/)).toBeVisible();
}

test("フラッシュカードの ふりがなを 消して、うらで 答え合わせできる", async ({ page }) => {
  await openDeck(page);

  const card = page.getByRole("button", { name: "カードを めくる" });
  const toggle = page.getByRole("button", { name: /ふりがな (ON|OFF)/ });
  const frontReading = card.locator("rt");

  // はじめは ON
  await expect(toggle).toHaveText("ふりがな ON");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(frontReading).toHaveCount(1);
  await expect(frontReading).toBeVisible();
  const reading = (await frontReading.textContent())?.trim() ?? "";
  expect(reading).not.toBe("");

  // OFF に すると おもての よみが 消える。要素は 残る（高さを 保つ）
  await toggle.click();
  await expect(toggle).toHaveText("ふりがな OFF");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(frontReading).toHaveCount(1);
  await expect(frontReading).toHaveCSS("visibility", "hidden");

  // めくると うらの 1行目に 語と よみが 出る
  await card.click();
  const backReading = card.locator("ruby").first().locator("rt");
  await expect(backReading).toHaveText(reading);
  await expect(backReading).toBeVisible();

  // つぎの カードでも OFF の まま
  await page.getByRole("button", { name: "つぎ →" }).click();
  await expect(page.getByText(/フラッシュカード\s+2 \/ \d+/)).toBeVisible();
  await expect(toggle).toHaveText("ふりがな OFF");
  await expect(card.locator("rt")).toHaveCount(1);
  await expect(card.locator("rt")).toHaveCSS("visibility", "hidden");

  // ON に もどせば また 出る
  await toggle.click();
  await expect(card.locator("rt")).toBeVisible();
});

for (const width of [390, 412]) {
  test(`${width}px: ふりがなを 押しなおしても 指の 下は ふりがなの ボタンの まま`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 915 });
    await openDeck(page);
    // 3枚目で ためす。じゅんばんを かえる を 押して しまうと 1枚目に 戻るので 見分けが つく
    for (const n of [2, 3]) {
      await page.getByRole("button", { name: "つぎ →" }).click();
      await expect(page.getByText(new RegExp(`フラッシュカード\\s+${n} \\/ \\d+`))).toBeVisible();
    }

    const toggle = page.getByRole("button", { name: /ふりがな (ON|OFF)/ });
    const box = (await toggle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    for (const expected of ["ふりがな OFF", "ふりがな ON", "ふりがな OFF"]) {
      await page.mouse.click(x, y);
      await expect(toggle).toHaveText(expected);
    }
    // じゅんばんを かえる を 押して いない（押して いれば 1枚目に 戻る）
    await expect(page.getByText(/フラッシュカード\s+3 \/ \d+/)).toBeVisible();
    // ボタンは 押すと 沈む（動きの 途中で 数px ずれる）。折り返しが 入れかわれば 1段（約50px）
    // 動くので、見るのは 数px を 超えて いないか だけ
    await page.mouse.move(0, 0);
    const after = (await toggle.boundingBox())!;
    expect(Math.abs(after.x - box.x)).toBeLessThanOrEqual(4);
    expect(Math.abs(after.y - box.y)).toBeLessThanOrEqual(4);
  });
}
