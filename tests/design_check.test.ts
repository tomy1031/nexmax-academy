import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ClaudeToolResult, requestClaudeDesign } from "@/lib/ai/claude-check";
import {
  DESIGN_VERDICT_LABELS,
  designPromptWords,
  designReplyFurigana,
  parseDesignReview,
  runDesignCheck,
  suggestsWhite,
} from "@/lib/ai/design-check";
import { fitWithin } from "@/lib/ai/shrink-image";
import {
  aiImageCheckAnswers,
  aiImageCheckFields,
  verdictOfLabel,
} from "@/lib/answers/ai-image-check";
import { formAnswerRows } from "@/lib/answers/form-answers-db";
import { articleSchema } from "@/content/schema";
import { buildFuriganaIndex, uncoveredKanji, type FuriganaEntry } from "@/lib/text/furigana";
import { DESIGN_VERDICTS } from "../supabase/functions/ai-check/design.ts";

/**
 * 画像の デザイン判定（記事の `aiImageCheck`・要望 #713）— 画面の 側
 *
 * AIは スタブ。答えの 分かって いる 見本（Haiku 5.5 で 試した 5枚の うち 3つの 形）の 返事を
 * 渡して、**判定が そのまま 学習者と 先生に 届く**か を 見る:
 *  - 合う（t1_fit: オフホワイト・明朝体・広い 余白・細い 線の ボタン）
 *  - 少し ちがう（t4_near: 空気感は 近いが 背景が 真っ白・ボタンを 塗って いる）
 *  - 合わない（t5_tech: 黒い 背景・ネオンの 色・機械的）
 */

const MATERIAL: readonly FuriganaEntry[] = JSON.parse(
  readFileSync("content/articles/youken_design.json", "utf8"),
).furigana;

const IMAGE = { media_type: "image/jpeg" as const, data: "/9j/4AAQ" };

/** 見本ごとの AIの 返事（Haiku 5.5 で 試した ときの 返事を、使って よい 漢字に そろえた もの）。 */
const SAMPLES = {
  t1_fit: {
    hantei: "au",
    yoi_tokoro: ["背景が 和紙の ような 色です。", "余白が 広くて、しずかな 感じです。"],
    naosu_tokoro: [],
    tsugi: "この 感じを もとに、ワイヤーフレームを 作りましょう。",
  },
  t4_near: {
    hantei: "sukoshi_chigau",
    yoi_tokoro: ["余白が 広くて、落ち着いた 感じです。"],
    naosu_tokoro: ["背景が 真っ白です。", "ボタンが 色で 塗って あります。"],
    tsugi: "背景が 和紙の ような 色の サイトを 探しましょう。",
  },
  t5_tech: {
    hantei: "awanai",
    yoi_tokoro: [],
    naosu_tokoro: [
      "背景が 暗い 青で、真っ黒に 近いです。決まりは 和紙の ような 色です。",
      "しずかな 感じが ありません。",
    ],
    tsugi: "和風で、余白の 広い サイトを 探しましょう。",
  },
} as const;

function stub(...inputs: unknown[]) {
  const queue = [...inputs];
  return vi.fn<(body: Parameters<typeof requestClaudeDesign>[0]) => Promise<ClaudeToolResult>>(
    async () => ({ ok: true, input: queue.shift(), model: "claude-haiku-5-5" }),
  );
}

const run = (request: ReturnType<typeof stub>) =>
  runDesignCheck(
    {
      check: "aoba_design",
      reason: "しずかな 感じが 合うと 思いました。",
      image: IMAGE,
      material: MATERIAL,
    },
    request,
  );

describe("判定の 名前", () => {
  it("画面と 窓口（関数）で そろって いる", () => {
    expect(Object.keys(DESIGN_VERDICT_LABELS).sort()).toEqual([...DESIGN_VERDICTS].sort());
  });

  it("画面の ことばは「合う／少し ちがう／合わない」", () => {
    expect(Object.values(DESIGN_VERDICT_LABELS)).toEqual(["合う", "少し ちがう", "合わない"]);
  });
});

describe("見本で 判定が そのまま 届く（AIは スタブ）", () => {
  it.each([
    ["t1_fit", "au", "合う"],
    ["t4_near", "sukoshi_chigau", "少し ちがう"],
    ["t5_tech", "awanai", "合わない"],
  ] as const)("%s → %s", async (name, verdict, label) => {
    const request = stub(SAMPLES[name]);
    const result = await run(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.verdict).toBe(verdict);
    // 言い直しは 要らない（漢字は ぜんぶ 読める・白を すすめて いない）
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.review.fix).toEqual(SAMPLES[name].naosu_tokoro);

    // 先生の 表に 残る 形
    const answers = aiImageCheckAnswers(
      { id: "design" },
      { site: "https://example.test", reason: "しずか", review: result.review },
    );
    expect(answers.design_hantei).toBe(label);
    expect(verdictOfLabel(answers.design_hantei)).toBe(verdict);
    if (result.review.fix.length > 0) expect(answers.design_kotoba).toContain("ちがう ところ:");
  });

  it("返事の 文は ぜんぶ ルビが 付く（見本の 文に 裸の 漢字が 無い）", () => {
    const index = buildFuriganaIndex(designReplyFurigana(MATERIAL));
    for (const sample of Object.values(SAMPLES)) {
      for (const line of [...sample.yoi_tokoro, ...sample.naosu_tokoro, sample.tsugi]) {
        expect(uncoveredKanji(line, index), line).toEqual([]);
      }
    }
  });
});

describe("言い直し", () => {
  it("読めない 漢字が あれば 1回だけ 言い直して もらう", async () => {
    const request = stub(
      { ...SAMPLES.t5_tech, naosu_tokoro: ["配色が 刺激的です。"] },
      SAMPLES.t5_tech,
    );
    const result = await run(request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0].retry).toEqual({ kanji: true, white: false });
    expect(result.ok && result.review.fix).toEqual(SAMPLES.t5_tech.naosu_tokoro);
  });

  it("「つぎ」で 白い 背景を すすめたら 言い直して もらう", async () => {
    const request = stub(
      { ...SAMPLES.t4_near, tsugi: "白い 背景の サイトを 探しましょう。" },
      SAMPLES.t4_near,
    );
    const result = await run(request);
    expect(request.mock.calls[1]![0].retry).toEqual({ kanji: false, white: true });
    expect(result.ok && result.review.next).toBe(SAMPLES.t4_near.tsugi);
  });

  it("2回目も だめなら、その 文と「つぎ」を 落とす（判定は 残す）", async () => {
    const bad = {
      hantei: "sukoshi_chigau",
      yoi_tokoro: ["余白が 広いです。"],
      naosu_tokoro: ["配色が 刺激的です。", "背景が 真っ白です。"],
      tsugi: "真っ白な サイトを 探しましょう。",
    };
    const request = stub(bad, bad);
    const result = await run(request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.verdict).toBe("sukoshi_chigau");
    expect(result.review.fix).toEqual(["背景が 真っ白です。"]);
    expect(result.review.next).toBe("");
  });

  it("2回目が 崩れたら 1回目を 使う", async () => {
    const first = { ...SAMPLES.t1_fit, tsugi: "白い サイトも 見て みましょう。" };
    const request = stub(first, { hantei: "???" });
    const result = await run(request);
    expect(result.ok && result.review.verdict).toBe("au");
    expect(result.ok && result.review.next).toBe("");
  });
});

describe("閉じて いる・失敗", () => {
  it("閉じて いる ときは そのまま 返す（画面が 保存だけに 切りかえる）", async () => {
    const request = vi.fn(async (): Promise<ClaudeToolResult> => ({
      ok: false,
      reason: "outside",
      closed: true,
    }));
    expect(await run(request as never)).toEqual({ ok: false, reason: "outside", closed: true });
  });

  it("判定の 読めない 返事は 失敗に する（だまって「合う」に しない）", async () => {
    const result = await run(
      stub({ hantei: "maybe", yoi_tokoro: [], naosu_tokoro: [], tsugi: "" }),
    );
    expect(result).toEqual({ ok: false, reason: "badShape", closed: false });
  });
});

describe("読みとり", () => {
  it("数の 上限を 守り、「なし」や 空の 文を 落とす", () => {
    const review = parseDesignReview({
      hantei: "au",
      yoi_tokoro: ["a", "b", "c", "d"],
      naosu_tokoro: ["なし", " ", "x"],
      tsugi: "null",
    });
    expect(review).toEqual({ verdict: "au", good: ["a", "b", "c"], fix: ["x"], next: "" });
  });

  it("白を すすめる 言い方を 見つける（オフホワイトは よい）", () => {
    expect(suggestsWhite("白い 背景の サイトを 探しましょう。")).toBe(true);
    expect(suggestsWhite("真っ白では なく…")).toBe(true);
    expect(suggestsWhite("ホワイトの 背景を…")).toBe(true);
    expect(suggestsWhite("オフホワイトの 背景を 探しましょう。")).toBe(false);
    expect(suggestsWhite("和紙の ような 色の サイトを 探しましょう。")).toBe(false);
  });

  it("AIに 渡す ことばに 教材の 1字の 見出しを 入れない", () => {
    const words = designPromptWords(MATERIAL);
    expect(words).toContain("背景");
    expect(words).toContain("山本社長");
    // 教材だけに ある 1字（「名」＝めい・「要」＝い）は 渡さない。描く 索引には 入る
    expect(words).not.toContain("名");
    expect(words).not.toContain("要");
  });
});

describe("記録（先生の 学習の きろく）", () => {
  const block = { id: "design", judge: "山本社長" };

  it("4つの 問い（サイト・理由・判定・AIの ことば）", () => {
    expect(aiImageCheckFields(block).map((field) => [field.id, field.title])).toEqual([
      ["design_site", "えらんだ サイト"],
      ["design_riyuu", "えらんだ 理由"],
      ["design_hantei", "山本社長（AI）の 判定"],
      ["design_kotoba", "山本社長（AI）の ことば"],
    ]);
  });

  it("AIが 見なかった 回は 判定を 残さない（見て いない ものを 合格に しない）", () => {
    const answers = aiImageCheckAnswers(block, {
      site: " SANKOU ",
      reason: "しずか",
      review: null,
    });
    expect(answers).toEqual({ design_site: "SANKOU", design_riyuu: "しずか" });
    const rows = formAnswerRows({
      profileId: "p1",
      articleId: "youken_design",
      fields: aiImageCheckFields(block),
      answers,
      attemptId: "a1",
    });
    expect(rows.map((row) => row.question_id)).toEqual(["design_site", "design_riyuu"]);
    expect(rows.every((row) => row.quiz_set_id === "youken_design")).toBe(true);
  });
});

describe("デザインの ページ（youken_design）", () => {
  const article = articleSchema.parse(
    JSON.parse(readFileSync("content/articles/youken_design.json", "utf8")),
  );

  it("「えらんだ デザイン」の 書きこみ欄を 画像の AI判定に 置きかえた", () => {
    const blocks = article.blocks;
    expect(blocks.filter((block) => block.kind === "form")).toHaveLength(0);
    const check = blocks.find((block) => block.kind === "aiImageCheck");
    expect(check).toMatchObject({ id: "design", check: "aoba_design", judge: "山本社長" });
  });

  it("ブランドの 決まり（答え）を ページに 書かない", () => {
    const text = JSON.stringify(article.blocks);
    for (const answer of ["オフホワイト", "明朝体", "和紙", "抹茶色", "真っ白"]) {
      expect(text).not.toContain(answer);
    }
  });
});

describe("決まり（答え）を 画面の プログラムに 載せない", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("src から 窓口の design.ts を import しない", () => {
    const offenders = files("src")
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) =>
        /(from|import\()\s*["'][^"']*functions\/ai-check\/design/.test(readFileSync(path, "utf8")),
      );
    expect(offenders).toEqual([]);
  });
});

describe("画像を 縮める 大きさ", () => {
  it("長い 辺を 1280px に そろえる（小さい 画像は そのまま）", () => {
    expect(fitWithin(2560, 1600)).toEqual({ width: 1280, height: 800 });
    expect(fitWithin(1170, 2532)).toEqual({ width: 591, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
