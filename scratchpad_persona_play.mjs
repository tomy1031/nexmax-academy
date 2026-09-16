// 試遊スクリプト: 朝礼/夕礼を N5(390px)・N4(1280px) で通しプレイ
// 意地悪条件: 文の途中で5秒止まる／テキストのみ完走／同じことを言い直す／リロード
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3900";
const SHOT_DIR =
  "/tmp/claude-0/-home-user-nexmax-academy/163b67e0-1353-5749-90f7-c5abf5bece52/scratchpad/shots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

function readMeeting(id) {
  return JSON.parse(fs.readFileSync(`content/meetings/${id}.json`, "utf8"));
}

function exampleUtterances(meeting) {
  return meeting.asakai.scenes.map((scene) => scene.panels.map((p) => p.example.text).join(" "));
}

async function readingFreeText(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    for (const hidden of Array.from(clone.querySelectorAll("script, style, template")))
      hidden.remove();
    for (const rt of Array.from(clone.querySelectorAll("rt"))) rt.remove();
    return (clone.textContent ?? "").replace(/\s+/gu, "");
  });
}

async function bareKanjiTexts(page) {
  return page.evaluate(() => {
    const KANJI = /[々一-鿿]/;
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = node.nodeValue ?? "";
      if (KANJI.test(text)) {
        let el = node.parentElement;
        let covered = false;
        while (el) {
          const tag = el.tagName;
          if (tag === "RUBY" || tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") {
            covered = true;
            break;
          }
          el = el.parentElement;
        }
        if (!covered) found.push(text.trim());
      }
      node = walker.nextNode();
    }
    return [...new Set(found)];
  });
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  console.log("shot:", name);
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

function stageRefs() {
  const stage = JSON.parse(fs.readFileSync("content/stages/asakai.json", "utf8"));
  return stage.contents.map((c) => c.ref);
}

/** 5秒止まる → つづきを打つ（文の途中で止まる意地悪条件）。 */
async function typeWithPause(page, selector, fullText) {
  const half = fullText.slice(0, Math.floor(fullText.length / 2));
  const rest = fullText.slice(Math.floor(fullText.length / 2));
  const field = page.locator(selector);
  await field.fill(half);
  console.log("  [意地悪] 文の途中で5秒止まる...");
  await page.waitForTimeout(5000);
  await field.fill(half + rest);
}

async function closeDutyIfOpen(page, log) {
  const memo = page.getByRole("dialog", { name: "報告メモ" });
  if (await memo.isVisible().catch(() => false)) {
    await memo.getByRole("button", { name: "とじる" }).click();
    await memo.waitFor({ state: "hidden" });
    log?.push("duty modal auto-opened and was closed");
  } else {
    log?.push("duty modal did NOT auto-open here");
  }
}

async function playWeek({ persona, viewport, meetingId, contentId, doMean }) {
  const meeting = readMeeting(meetingId);
  const utterances = exampleUtterances(meeting);
  const browser = await chromium.launch({
    executablePath: process.env.E2E_CHROMIUM_PATH,
  });
  const context = await browser.newContext({ viewport });
  const refs = stageRefs();
  const at = refs.indexOf(contentId);
  await seedCompleted(context, refs.slice(0, at));
  const page = await context.newPage();
  const findings = [];

  await page.goto(`${BASE}/asakai/meeting-${contentId}`);
  await shot(page, `${persona}-00-lobby`);
  await page.getByRole("button", { name: "ミーティングに さんかする" }).click();
  await page.waitForTimeout(1000);

  // 自動オープン確認 (入室時)
  const memoOnJoin = page.getByRole("dialog", { name: "報告メモ" });
  const openedOnJoin = await memoOnJoin.isVisible().catch(() => false);
  findings.push(`入室時に報告メモが自動で開いたか: ${openedOnJoin}`);
  await shot(page, `${persona}-01-join-memo-auto`);

  if (openedOnJoin) {
    // 閉じ方が分かるか: とじるボタンの可視性チェック(390pxでは特に)
    const closeBtn = memoOnJoin.getByRole("button", { name: "とじる" });
    const box = await closeBtn.boundingBox();
    findings.push(
      `とじるボタンの位置: ${JSON.stringify(box)} (viewport ${JSON.stringify(viewport)})`,
    );
    // コピー禁止の確認 (select-none)
    const selectStyle = await memoOnJoin
      .locator(".card-island")
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect)
      .catch(() => "n/a");
    findings.push(`報告メモのuser-select: ${selectStyle}`);
    await closeBtn.click();
    await memoOnJoin.waitFor({ state: "hidden" });
  }

  const bare0 = await bareKanjiTexts(page);
  findings.push(`入室直後の裸の漢字: ${JSON.stringify(bare0)}`);

  for (let day = 0; day < utterances.length; day++) {
    const dayNames = ["月曜", "火曜", "水曜", "木曜", "金曜"];
    console.log(`\n=== ${persona} ${dayNames[day]} ===`);

    // 曜日ごとに報告メモを開いて内容確認
    const dutyBtn = page.getByRole("button", { name: "報告メモを 見る" });
    if (await dutyBtn.isVisible().catch(() => false)) {
      await dutyBtn.click();
      const modal = page.getByRole("dialog", { name: "報告メモ" });
      await modal.waitFor({ state: "visible" });
      await page.waitForTimeout(500);
      await shot(page, `${persona}-day${day}-duty`);
      const bareInModal = await bareKanjiTexts(page);
      if (bareInModal.length)
        findings.push(`⚠ ${dayNames[day]}報告メモ内の裸の漢字: ${JSON.stringify(bareInModal)}`);
      const memoText = await readingFreeText(page);
      if (day === 0 || day === 1) {
        findings.push(
          `${dayNames[day]}: ACLEDA表記混入チェック -> "ACLEDA" in memo: ${memoText.includes("ACLEDA")}`,
        );
      }
      if (day === 2) {
        findings.push(`水曜: ✚追加バッジ出現: ${memoText.includes("追加")}`);
      }
      if (day === 3) {
        findings.push(`木曜: ✚追加バッジ残存(消えるはず): ${memoText.includes("追加")}`);
      }
      // 決済APIとつなぐ の添え確認
      const apiLineMatch = memoText.match(/決済API[とど]つなぐ[（(][^）)]*[）)]/g);
      findings.push(`${dayNames[day]}: 決済APIとつなぐ表記 -> ${JSON.stringify(apiLineMatch)}`);
      await modal.getByRole("button", { name: "とじる" }).click();
      await modal.waitFor({ state: "hidden" });
    } else {
      findings.push(`${dayNames[day]}: 報告メモを見るボタンが無い`);
    }

    // 産出前にヒントを閉じたまま答えられるか確認: まずヒントを開かずに入力
    if (doMean && day === 0) {
      await typeWithPause(page, '[aria-label="こたえを 入力する"]', utterances[day]);
    } else {
      await page.getByLabel("こたえを 入力する").fill(utterances[day]);
    }

    // 意地悪条件: 同じことを言い直す(=送信ボタンを連打。声がつながらず「届いたか不安」で
    // もう一度押す学習者を想定)。二重送信で判定が壊れないか・カードが2回分開かないか見る。
    if (doMean && day === 1) {
      console.log("  [意地悪] 送信ボタンを連打（同じ内容を言い直す）...");
      const sendBtn = page.getByRole("button", { name: "おくる" });
      await sendBtn.click();
      await sendBtn.click({ trial: false }).catch(() => {});
    } else {
      await page.getByRole("button", { name: "おくる" }).click();
    }
    await page
      .getByRole("dialog", { name: "報告の 見かた" })
      .waitFor({ state: "visible", timeout: 45000 });
    await shot(page, `${persona}-day${day}-judge`);
    const bareInJudge = await bareKanjiTexts(page);
    if (bareInJudge.length)
      findings.push(
        `⚠ ${dayNames[day]}判定ポップアップ内の裸の漢字: ${JSON.stringify(bareInJudge)}`,
      );

    const contBtn = page.getByRole("button", { name: "みんなの 報告を 聞く" });
    if (await contBtn.isVisible().catch(() => false)) {
      await contBtn.click();
    } else {
      // 聞き返しの可能性
      const tsuzukeru = page.getByRole("button", { name: "つづける" });
      if (await tsuzukeru.isVisible().catch(() => false)) {
        findings.push(`${dayNames[day]}: 聞き返しが発生（想定外の場合あり）`);
        await tsuzukeru.click();
      }
    }
    await page.waitForTimeout(500);

    if (doMean && day === 1) {
      // 連打の結果、カードが正しく(4/4)開いているか・2重に処理されていないかを本体側で確認
      const bodyAfter = await readingFreeText(page);
      findings.push(`連打送信の後の状態: 画面に異常な重複表示は無いか -> 目視でshot確認`);
      await shot(page, `${persona}-day${day}-after-double-send`);
    }

    // けっかを見る -> 週末結果 or 時間カード
    const kekkaBtn = page.getByRole("button", { name: /けっかを 見る/ });
    if (await kekkaBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await kekkaBtn.click();
      await shot(page, `${persona}-day${day}-timecard`);
    }

    if (day < utterances.length - 1) {
      const tsuzukemasu = page.getByRole("button", { name: /つづけます/ });
      if (await tsuzukemasu.isVisible({ timeout: 5000 }).catch(() => false)) {
        await tsuzukemasu.click();
      }
      await page.waitForTimeout(800);
      // 曜日が変わった直後、自動で開くか確認
      const memoAfterDay = page.getByRole("dialog", { name: "報告メモ" });
      const openedOnDayChange = await memoAfterDay.isVisible().catch(() => false);
      findings.push(
        `${dayNames[day + 1]}に変わった直後、報告メモが自動で開いたか: ${openedOnDayChange}`,
      );
      await shot(page, `${persona}-day${day + 1}-auto-open`);

      // 意地悪条件: 回線が切れる(リロード) - 水曜のタイミングで実施
      if (doMean && day === 2) {
        console.log("  [意地悪] リロード（回線切れ）...");
        await page.reload();
        await page.waitForTimeout(1500);
        await page
          .getByRole("button", { name: "ミーティングに さんかする" })
          .click()
          .catch(() => {});
        await page.waitForTimeout(1000);
        await shot(page, `${persona}-day${day + 1}-after-reload`);
        const bodyText = await readingFreeText(page);
        findings.push(
          `リロード後、${dayNames[day + 1]}のまま復帰したか: ${bodyText.includes(dayNames[day + 1] === "水曜" ? "水曜日" : dayNames[day + 1])}`,
        );
        await closeDutyIfOpen(page, findings);
      } else {
        await closeDutyIfOpen(page, findings);
      }
    }
  }

  // 週の結果
  await shot(page, `${persona}-final-result`);
  const finalText = await readingFreeText(page);
  findings.push(`最終結果に合格/不合格の文言があるか: ${finalText.includes("合格")}`);
  const bareFinal = await bareKanjiTexts(page);
  if (bareFinal.length) findings.push(`⚠ 最終結果画面の裸の漢字: ${JSON.stringify(bareFinal)}`);

  console.log(`\n===== ${persona} findings =====`);
  findings.forEach((f) => console.log(" -", f));

  await browser.close();
  return findings;
}

const scenario = process.argv[2];

if (scenario === "n5") {
  await playWeek({
    persona: "n5-390",
    viewport: { width: 390, height: 844 },
    meetingId: "asakai_kantan",
    contentId: "asakai_kantan",
    doMean: true,
  });
} else if (scenario === "n4") {
  await playWeek({
    persona: "n4-1280",
    viewport: { width: 1280, height: 900 },
    meetingId: "asakai_kantan",
    contentId: "asakai_kantan",
    doMean: true,
  });
}
