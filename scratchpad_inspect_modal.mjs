import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3900";
const SHOT_DIR =
  "/tmp/claude-0/-home-user-nexmax-academy/163b67e0-1353-5749-90f7-c5abf5bece52/scratchpad/shots";

function stageRefs() {
  const stage = JSON.parse(fs.readFileSync("content/stages/asakai.json", "utf8"));
  return stage.contents.map((c) => c.ref);
}

async function seedCompleted(context, ids) {
  await context.addInitScript((ids) => {
    for (const id of ids) {
      window.localStorage.setItem(
        `nexmax:v1:content:${id}`,
        JSON.stringify({ status: "completed" }),
      );
    }
  }, ids);
}

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const refs = stageRefs();
const at = refs.indexOf("asakai_kantan");
await seedCompleted(context, refs.slice(0, at));
const page = await context.newPage();
await page.goto(`${BASE}/asakai/meeting-asakai_kantan`);
await page.getByRole("button", { name: "ミーティングに さんかする" }).click();
await page.waitForTimeout(1200);
// close auto-open memo, advance to wed via goNext calls won't be easy; instead just check monday first, then use UI to progress
async function closeDuty() {
  const memo = page.getByRole("dialog", { name: "報告メモ" });
  if (await memo.isVisible().catch(() => false)) {
    await memo.getByRole("button", { name: "とじる" }).click();
    await memo.waitFor({ state: "hidden" });
  }
}
await closeDuty();

function readMeeting(id) {
  return JSON.parse(fs.readFileSync(`content/meetings/${id}.json`, "utf8"));
}
const meeting = readMeeting("asakai_kantan");
const utterances = meeting.asakai.scenes.map((scene) =>
  scene.panels.map((p) => p.example.text).join(" "),
);

async function doDay(day) {
  await page.getByLabel("こたえを 入力する").fill(utterances[day]);
  await page.getByRole("button", { name: "おくる" }).click();
  await page
    .getByRole("dialog", { name: "報告の 見かた" })
    .waitFor({ state: "visible", timeout: 45000 });
  await page.getByRole("button", { name: "みんなの 報告を 聞く" }).click();
  await page.waitForTimeout(300);
  const kekka = page.getByRole("button", { name: /けっかを 見る/ });
  if (await kekka.isVisible({ timeout: 5000 }).catch(() => false)) await kekka.click();
  const tsuzukemasu = page.getByRole("button", { name: /つづけます/ });
  if (await tsuzukemasu.isVisible({ timeout: 5000 }).catch(() => false)) await tsuzukemasu.click();
  await page.waitForTimeout(600);
  await closeDuty();
}

await doDay(0); // mon done -> tue
await doDay(1); // tue done -> wed

// Now on Wed, open duty modal and scroll to icon table
await page.getByRole("button", { name: "報告メモを 見る" }).click();
const modal = page.getByRole("dialog", { name: "報告メモ" });
await modal.waitFor({ state: "visible" });
await page.waitForTimeout(500);
// scroll inside modal to bottom to see icon table
await modal
  .locator(".card-island")
  .first()
  .evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
await page.waitForTimeout(300);
await page.screenshot({ path: `${SHOT_DIR}/n5-390-wed-duty-scrolled.png` });
console.log("scrolled shot saved");

// Also check close button reachability at this scroll position
const closeBtn = modal.getByRole("button", { name: "とじる" });
const box = await closeBtn.boundingBox();
console.log("close button box after scroll:", box);

await browser.close();
