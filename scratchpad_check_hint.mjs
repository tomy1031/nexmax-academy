import { chromium } from "playwright";
import fs from "node:fs";
function stageRefs() {
  const stage = JSON.parse(fs.readFileSync("content/stages/asakai.json", "utf8"));
  return stage.contents.map((c) => c.ref);
}
async function seedCompleted(context, ids) {
  await context.addInitScript((ids) => {
    for (const id of ids)
      window.localStorage.setItem(
        `nexmax:v1:content:${id}`,
        JSON.stringify({ status: "completed" }),
      );
  }, ids);
}
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const refs = stageRefs();
const at = refs.indexOf("asakai_kantan");
await seedCompleted(context, refs.slice(0, at));
const page = await context.newPage();
await page.goto("http://localhost:3900/asakai/meeting-asakai_kantan");
await page.getByRole("button", { name: "ミーティングに さんかする" }).click();
await page.waitForTimeout(1200);
const memo = page.getByRole("dialog", { name: "報告メモ" });
if (await memo.isVisible().catch(() => false)) {
  await memo.getByRole("button", { name: "とじる" }).click();
  await memo.waitFor({ state: "hidden" });
}
await page.getByRole("button", { name: "ヒント" }).click();
const hintDialog = page.getByRole("dialog", { name: "ヒントの ポップアップ" });
await hintDialog.waitFor({ state: "visible" });
await page.waitForTimeout(400);
const info = await hintDialog
  .locator(".card-island")
  .first()
  .evaluate((el) => {
    return { userSelect: getComputedStyle(el).userSelect, maxWidth: getComputedStyle(el).maxWidth };
  });
console.log("hint modal card-island style:", info);
await page.screenshot({
  path: "/tmp/claude-0/-home-user-nexmax-academy/163b67e0-1353-5749-90f7-c5abf5bece52/scratchpad/shots/hint-modal-390.png",
});
await browser.close();
