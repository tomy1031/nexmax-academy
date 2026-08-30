import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bareKanjiTexts, seedCompleted, shot } from "./helpers";

/**
 * 報連相の3ステージ（報告・連絡・相談）を 学習者と 同じ 道で 通す
 *
 * 旧アプリ（nextmake_onbording）からの 移植ぶん。見張るのは 3つ:
 *
 *  1. **5つの 種別が どれも 開く**（よみもの・スキット・リスニング・もんだい・リンク）。
 *     とくに **スキットは 新しい 種別**なので、ルート・ローダ・部品の どれかが
 *     つながって いないと ここで 404 に なる。
 *  2. **スキットの 行に 音が ついて いる**。音は 別の スクリプトが 作る ので、
 *     作り忘れると 教材データだけが 音を 指した 状態に なる——画面は 読み上げに
 *     落ちて 動くので、**通しでは 気づけない** 種類の 抜けである。
 *  3. **裸の 漢字が 出て いない**（規律2）。`lint:content` は データを 見るが、
 *     こちらは **実際に 描かれた 画面**を 見る。
 */

/** ステージの 中身は 教材データから 読む（画面の 並びを 決め打ちしない）。 */
function stage(id: string): { contents: { ref: string; type: string }[] } {
  return JSON.parse(readFileSync(join("content", "stages", `${id}.json`), "utf8"));
}

function skit(id: string): { lines: { speaker: string; text: string; audioUrl?: string }[] } {
  return JSON.parse(readFileSync(join("content", "skits", `${id}.json`), "utf8"));
}

const STAGES = [
  { id: "houkoku", title: "報告", skitId: "houkoku_skit" },
  { id: "renraku", title: "連絡", skitId: "renraku_skit" },
  { id: "soudan", title: "相談", skitId: "soudan_skit" },
] as const;

/**
 * ステージの中の教材のURL（`src/lib/stage-routes.ts` と 同じ 規則）。
 * 同じ 種別が 2つ以上 ある ときだけ ID を 足す。
 */
const SEGMENT: Record<string, string> = {
  article: "article",
  skit: "skit",
  listening: "listening",
  quizset: "quiz",
  link: "link",
  meeting: "meeting",
  manga: "manga",
};

/** 教材データの 置き場（種別 → フォルダ）。 */
const DIR: Record<string, string> = {
  article: "articles",
  skit: "skits",
  listening: "listening",
  quizset: "quizsets",
  link: "links",
  meeting: "meetings",
  manga: "manga",
};

function contentOf(type: string, ref: string): unknown {
  return JSON.parse(readFileSync(join("content", DIR[type], `${ref}.json`), "utf8"));
}

/** 画像スロットの 形（`imageSlotSchema`）。`src` が 無ければ 画面は 点線わくを 出す。 */
function isEmptySlot(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const slot = value as { src?: unknown; status?: unknown; refs?: unknown };
  return !slot.src && (typeof slot.status === "string" || Array.isArray(slot.refs));
}

/**
 * その 教材が 画面に 出す「空の 絵の 枠」の 数。
 *
 * もんだいは **1問ずつ** 出す 作り（`answerMode` が `all` の ときだけ 全問1ページ）
 * なので、そこだけ 最初の 1問ぶんに 絞る。
 */
function emptySlots(item: { ref: string; type: string }): number {
  const data = contentOf(item.type, item.ref) as Record<string, unknown>;
  if (item.type === "quizset") {
    const questions = (data.questions ?? []) as { image?: unknown }[];
    const empties = questions.filter((q) => isEmptySlot(q.image));
    return data.answerMode === "all" ? empties.length : Math.min(empties.length, 1);
  }
  let count = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    if (isEmptySlot(value)) {
      count += 1;
      return;
    }
    Object.values(value).forEach(walk);
  };
  walk(data);
  return count;
}

function pathsOf(stageId: string): { ref: string; type: string; path: string }[] {
  const contents = stage(stageId).contents;
  return contents.map((item) => {
    const seg = SEGMENT[item.type];
    const many = contents.filter((c) => c.type === item.type).length > 1;
    return { ...item, path: `/${stageId}/${many ? `${seg}-${item.ref}` : seg}` };
  });
}

/**
 * **共有の 画面部品が 前から 持って いる 裸の 漢字**（この 移植とは 別の 話）。
 *
 * どれも 教材データでは なく 部品の 中に 直に 書かれた 文で、報連相の 前から
 * どの ステージでも 同じように 出て いる。ここで 一緒に 落とすと、
 * **自分の 教材の 抜けと 見分けが つかなく なる**ので、名ざしで 外しておく。
 * 直すのは 部品の 側（＝別のタスク）:
 *  - `src/components/stage/content-frame.tsx`（関門の 板）
 *  - `src/components/listening/playback-mode.tsx`（聞く 前の 案内）
 */
const KNOWN_BARE_UI: readonly string[] = [
  "それでも 見る",
  "👂 ここに 注目して 聞きます",
  "音を 聞いて、聞こえた ことばを 入れます。",
  "ぜんぶ 分からなくて だいじょうぶです。分かった ところから 入れてください。",
];

/** 404 を 静かに 見のがさない（ISR の 404 も 200 では 返らない）。 */
async function open(page: Page, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} が ひらけない`).toBeLessThan(400);
}

for (const { id, title, skitId } of STAGES) {
  test(`報連相：${title} — ステージの 教材が ぜんぶ ひらく`, async ({ page }) => {
    await open(page, `/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("報連相");
    await shot(page, `hourensou-${id}-stage`);

    for (const item of pathsOf(id)) {
      await open(page, item.path);
      // 中身が 出て いるか（空の 枠だけが 出る 壊れ方を 弾く）
      await expect(page.getByRole("heading").first()).toBeVisible();
      /*
       * 絵の 置き場の 空きは **データと 数が 合って いる**こと。
       *
       * 0件では 見張れなく なった——まんが（連絡）と 場面クイズ（相談）は、
       * Cloudでは 絵を 作れない ので **プロンプトだけ 保存して 空で 出す**
       *（`docs/teaching/hourensou_要る絵の一覧.md` の 引き継ぎ）。
       * 数で 見れば、絵が 入った 日に この 検査が **自動で ついてくる**——
       * 空きが 減れば 期待値も 減る。逆に 手ちがいで 絵が 消えた ときは 落ちる。
       */
      await expect(page.locator('[data-slot="empty"]')).toHaveCount(emptySlots(item));
    }
  });

  test(`報連相：${title} — スキットが 鳴らせる`, async ({ page }) => {
    const data = skit(skitId);
    await open(page, `/${id}/skit`);

    /*
     * セリフが ぜんぶ 画面に 出て いるか。**文字列では 探さない**——ルビが 合成されると
     * 1つの 文が `<ruby>` で いくつにも 割れる ので、文まるごとの 一致は 当たらない。
     * 行の 数で 見る（1行でも 落ちたら まねる 練習に ならない）。
     */
    await expect(page.locator('[data-skit="lines"] > li')).toHaveCount(data.lines.length);

    // ト書き 以外の 行の 数だけ スピーカーが ある
    const spoken = data.lines.filter((line) => line.speaker !== "narration").length;
    await expect(page.getByRole("button", { name: "聞く" })).toHaveCount(spoken);

    // 音の ファイルが 本当に 置いて あるか（データだけが 指して いる 状態を 弾く）
    for (const line of data.lines) {
      if (!line.audioUrl) continue;
      const res = await page.request.get(line.audioUrl);
      expect(res.status(), `${line.audioUrl} が 無い`).toBe(200);
    }

    await shot(page, `hourensou-${id}-skit`);
  });

  test(`報連相：${title} — 動画が 置いて ある`, async ({ page }) => {
    const article = pathsOf(id).find((item) => item.type === "article");
    if (!article) return;
    const data = JSON.parse(
      readFileSync(join("content", "articles", `${article.ref}.json`), "utf8"),
    ) as { blocks: { kind: string; src?: string; poster?: string }[] };
    const videos = data.blocks.filter((block) => block.kind === "video");
    if (videos.length === 0) return;

    await open(page, article.path);
    // データの 本数だけ 画面に 出て いる
    await expect(page.locator("video")).toHaveCount(videos.length);
    /*
     * **押すまで 落とさない**（`preload="none"`）。1本 5〜7MB あるので、
     * ここが ゆるむと 開いた だけで 教室の 回線が 埋まる。
     */
    for (const el of await page.locator("video").all()) {
      expect(await el.getAttribute("preload")).toBe("none");
    }
    // ファイルが 本当に 置いて あるか（データだけが 指して いる 状態を 弾く）
    for (const video of videos) {
      for (const url of [video.src, video.poster]) {
        if (!url) continue;
        const res = await page.request.get(url);
        expect(res.status(), `${url} が 無い`).toBe(200);
      }
    }

    await page.locator("video").first().scrollIntoViewIfNeeded();
    await shot(page, `hourensou-${id}-video`);
  });

  test(`報連相：${title} — ミーティングが 鍵ゼロで ひらく`, async ({ page }) => {
    const meeting = pathsOf(id).find((item) => item.type === "meeting");
    if (!meeting) return;
    const data = contentOf("meeting", meeting.ref) as {
      questions: { ask: string }[];
      host: { name: string };
    };

    await open(page, meeting.path);
    /*
     * **鍵（GEMINI_API_KEY）を 持たない 学習者**の 画面。ここが 鍵を 要求すると、
     * 教室の ほとんどの 子が 入口で 止まる——ミーティングは 鍵が 無くても
     * 規則ベースの 見かたで 最後まで 通る 作りに して ある。
     */
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(data.questions.length).toBeGreaterThan(0);
    await expect(page.getByText(data.host.name).first()).toBeVisible();
    await shot(page, `hourensou-${id}-meeting`);
  });

  test(`報連相：${title} — ツールページが 中で ひらく`, async ({ page }) => {
    for (const item of pathsOf(id).filter((c) => c.type === "link")) {
      const data = contentOf("link", item.ref) as { url: string; newTab?: boolean };
      // 旧アプリからの 写しでは ない、こんど 作った ページだけを 見る
      if (!data.url.startsWith("/tools/hourensou/")) continue;

      /*
       * **ファイルが 本当に 置いて あるか**。リンク教材は 行き先が 404 でも
       * 画面は 枠を 出して しまう（中は iframe なので 親からは 空に 見えるだけ）。
       */
      const res = await page.request.get(data.url);
      expect(res.status(), `${data.url} が 無い`).toBe(200);

      await open(page, item.path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test(`報連相：${title} — 裸の 漢字が 出て いない`, async ({ page, context }) => {
    /*
     * **順に 進んだ 学習者**として 見る。関門（🔒）が 閉じたままだと、教材の 代わりに
     * 枠の「まだ ひらけません」の 板が 出て、見たい ものが 1文字も 画面に 無い。
     */
    await seedCompleted(
      context,
      pathsOf(id).map((item) => item.ref),
    );
    for (const item of pathsOf(id)) {
      // リンク教材の 中身（iframe）は 旧アプリの ページなので この 検査の 外
      if (item.type === "link") continue;
      await open(page, item.path);
      const bare = (await bareKanjiTexts(page)).filter((text) => !KNOWN_BARE_UI.includes(text));
      expect(bare, `${item.path} に 裸の 漢字`).toEqual([]);
    }
  });
}
