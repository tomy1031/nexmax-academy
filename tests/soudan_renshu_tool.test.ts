import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { KANJI } from "@/lib/text/furigana";
import { LINK_ANSWER_PROMPTS } from "@/content/link-answers";
import { parseProgressPosition } from "@/lib/answers/link-message";

/**
 * 相談の 練習問題（public/tools/hourensou/soudan_renshu.*）を 機械で 見る。
 *
 * React では なく **静的な 1枚**なので、`npm run lint:content` が 中身を 見ない。ここで 見る:
 *  1. 学生が 読む 文に ふりがなの ない 漢字が 無い（必ず守るルール2）・禁止語・国名（ルール1・9）
 *  2. データの 形（5つの 型・合格に 要る 要素が 伝える ことの 一覧に ある・絵の ファイルが ある）
 *  3. 判定の 決まり（合格は コードが 決める・勝手に 決めたら やり直し・自分の ことばの 加点）
 *  4. 先生の 画面の 問いの 文が データと そろって いる
 *  5. 進み具合の 数が 親の 画面の 受け口（`parseProgressPosition`）を 通る
 */

type Rec = Record<string, unknown>;

function load(file: string, name: string): Rec {
  const source = readFileSync(join("public", "tools", "hourensou", file), "utf8");
  const win: Rec = {};
  new Function("window", source)(win);
  return win[name] as Rec;
}

const DATA = load("soudan_renshu.data.js", "SOUDAN_RENSHU") as Rec & {
  levels: Level[];
  parts: Record<string, { image: string }>;
  partner: { desk: Record<string, string>; figures: Record<string, string> };
  intro: { image?: string }[];
  deskSeconds: number;
};

const LOGIC = load("soudan_renshu.logic.js", "SOUDAN_LOGIC") as unknown as Logic;

interface Level {
  id: string;
  no: number;
  title: string;
  cover: string;
  resultImage: string;
  slides: { kind?: string; image?: string; options?: { image: string }[] }[];
  checklist: { parts: string[]; ask: string }[];
  hints: string[];
  model: { part: string; text: string }[];
  better: { adds: { part: string }[] };
  bonus: { id: string; label: string }[];
  results: Record<string, string>;
  worksheet?: {
    rows: { id: string; label: string }[];
    apis: { id: string; name: string; url: string }[];
    thoughts: { id: string; label: string }[];
  };
  ai: {
    required: string[];
    parts: Record<string, string>;
    bonus: Record<string, string>;
    choices: Record<string, string>;
    decidedAlone: string;
  };
}

interface Judgment {
  pass: boolean;
  parts: Record<string, boolean>;
  missing: string[];
  bonus: string[];
  ownWords: boolean;
  addedOwn: boolean;
  templateOnly: boolean;
  choice: string;
  failure: string;
  heard: string;
}

interface Logic {
  PART_KEYS: string[];
  plain(text: string): string;
  buildJudgePrompt(level: Level, utterance: string, opts?: { hintsOpened?: boolean }): string;
  judgeSchema(level: Level): { properties: Record<string, unknown>; required: string[] };
  settle(
    level: Level,
    raw: unknown,
    utterance: string,
    opts?: { hintsOpened?: boolean },
  ): Judgment | null;
  reactionKey(judgment: Judgment | null): string;
  countsAsFail(judgment: Judgment | null): boolean;
  starsForFails(fails: number): number;
  supportLevel(fails: number): number;
  bonusPoints(judgment: Judgment | null): number;
  readsModel(utterance: string, model: { text: string }[]): boolean;
  deskCycle(seed: string): string[];
  toPosition(save: Rec, count: number): Record<string, number>;
  mergePosition(save: Rec, position: unknown, count: number): Rec;
  openLevelCount(save: Rec, count: number): number;
  allCleared(save: Rec, count: number): boolean;
  attemptsText(attempts: { heard: string; pass: boolean }[]): string;
  worksheetCellId(row: string, api: string): string;
  worksheetThoughtId(id: string): string;
  worksheetText(worksheet: unknown, values: unknown): string;
}

/** 学生が 読む 文を ぜんぶ 集める（ルビ記法の まま）。`ai`（Gemini だけが 読む）と 絵の 道・URL は 除く。 */
function learnerTexts(): string[] {
  const texts: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (key === "ai") return;
    if (typeof value === "string") {
      if (value.startsWith("/") || value.startsWith("http")) return;
      if (key === "id" || key === "key" || key === "part" || key === "icon" || key === "color")
        return;
      texts.push(value);
    } else if (Array.isArray(value)) value.forEach((one) => walk(one, key));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(DATA, "");
  return texts;
}

/** ルビが 付く ところを 取り除いた 残り（画面の R() と 同じ 見方）。 */
function outsideRuby(text: string): string {
  return text.replace(/\{[^{}|]+\|[^{}|]+\}/g, "");
}

function plain(text: string): string {
  return text.replace(/\{([^{}|]+)\|[^{}|]+\}/g, "$1");
}

const L1 = DATA.levels[0]!;
const L2 = DATA.levels[1]!;
const L3 = DATA.levels[2]!;

describe("相談の 練習問題の 文言", () => {
  it("学生が 読む 文に、ふりがなの ない 漢字が 無い", () => {
    const bare: string[] = [];
    for (const text of learnerTexts()) {
      const missing = [...outsideRuby(text)].filter((char) => KANJI.test(char));
      if (missing.length > 0) bare.push(`${missing.join("")} ← 「${plain(text)}」`);
    }
    expect(bare).toEqual([]);
  });

  it("ルビの 書き方が 崩れて いない（{ と } の 数・| の 無い ルビ）", () => {
    const broken = learnerTexts().filter((text) => {
      const opens = (text.match(/\{/g) ?? []).length;
      const closes = (text.match(/\}/g) ?? []).length;
      const ruby = (text.match(/\{[^{}|]+\|[^{}|]+\}/g) ?? []).length;
      const placeholders = (text.match(/\{N\}/g) ?? []).length;
      return opens !== closes || opens !== ruby + placeholders;
    });
    expect(broken).toEqual([]);
  });

  it("禁止語・国名（タイ）が 無い", () => {
    const all = learnerTexts().map(plain);
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(all.join("\n")).not.toContain(word);
    }
    expect(checkCountryNamesInTexts("soudan_renshu.data.js", all)).toEqual([]);
  });
});

describe("データの 形", () => {
  const parts = Object.keys(DATA.parts);

  it("5レベル・5つの 型（状況・問題・確認したこと・自分の考え・相談したいこと）", () => {
    expect(DATA.levels.map((level) => level.no)).toEqual([1, 2, 3, 4, 5]);
    expect(parts).toEqual(["jokyo", "mondai", "kakunin", "kangae", "soudan"]);
    expect(LOGIC.PART_KEYS).toEqual(parts);
  });

  it("席の 絵は 3秒ごと（2026-11-17・5日間と 同じ）", () => {
    expect(DATA.deskSeconds).toBe(3);
  });

  it("合格に 要る 要素は、学生に 見せる「伝える こと」の 一覧に かならず ある", () => {
    for (const level of DATA.levels) {
      const shown = new Set(level.checklist.flatMap((item) => item.parts));
      for (const key of level.ai.required) expect(shown.has(key), `${level.id} ${key}`).toBe(true);
      for (const item of level.checklist)
        for (const key of item.parts) expect(parts).toContain(key);
      for (const seg of level.model) expect(parts).toContain(seg.part);
      for (const add of level.better.adds) expect(parts).toContain(add.part);
      for (const key of level.ai.required)
        expect(level.ai.parts[key], `${level.id} ${key}`).toBeTruthy();
    }
  });

  it("お手本は 合格に 要る 要素を ぜんぶ ふくむ（お手本を 言えば 合格に できる）", () => {
    for (const level of DATA.levels) {
      const inModel = new Set(level.model.map((seg) => seg.part));
      for (const key of level.ai.required)
        expect(inModel.has(key), `${level.id} ${key}`).toBe(true);
    }
  });

  it("加点の id は 判定の 基準と そろって いる・選んだ 方法ごとの 答えが ある", () => {
    for (const level of DATA.levels) {
      expect(level.bonus.map((one) => one.id).sort()).toEqual(Object.keys(level.ai.bonus).sort());
      expect(level.results.none, level.id).toBeTruthy();
      for (const choice of Object.keys(level.ai.choices)) {
        expect(level.results[choice], `${level.id} ${choice}`).toBeTruthy();
      }
    }
  });

  it("絵の ファイルが ぜんぶ ある", () => {
    const images = new Set<string>([
      ...Object.values(DATA.parts).map((part) => part.image),
      ...Object.values(DATA.partner.desk),
      ...Object.values(DATA.partner.figures),
    ]);
    for (const slide of DATA.intro as { image?: string; steps?: { image?: string }[] }[]) {
      if (slide.image) images.add(slide.image);
      for (const step of slide.steps ?? []) if (step.image) images.add(step.image);
    }
    for (const level of DATA.levels) {
      images.add(level.cover);
      images.add(level.resultImage);
      for (const slide of level.slides) {
        if (slide.image) images.add(slide.image);
        for (const option of slide.options ?? []) images.add(option.image);
      }
    }
    const missing = [...images].filter((src) => !existsSync(join("public", src)));
    expect(missing).toEqual([]);
  });

  it("レベル5の 調べ表は 9行 × 3つの API と、自分の 考え 4つ", () => {
    const ws = DATA.levels[4]!.worksheet!;
    expect(ws.rows).toHaveLength(9);
    expect(ws.apis.map((api) => api.id)).toEqual(["claude", "gpt", "gemini"]);
    expect(ws.thoughts).toHaveLength(4);
    for (const api of ws.apis) expect(api.url).toMatch(/^https:\/\//);
  });
});

describe("判定の 決まり（合格は コードが 決める）", () => {
  const yes = { jokyo: true, mondai: true, kakunin: true, kangae: true, soudan: true };
  const said =
    "お店の 一覧画面を 作って います。写真が ありません。仮の 写真を 使っても いいですか。";

  it("要る 要素が ぜんぶ あれば 合格。1つ 欠ければ やり直し（欠けた 要素から 反応を 選ぶ）", () => {
    const pass = LOGIC.settle(L1, { ...yes, own_words: false, bonus: [], choice: "B" }, said);
    expect(pass?.pass).toBe(true);
    expect(pass?.choice).toBe("B");
    const miss = LOGIC.settle(L1, { ...yes, soudan: false, own_words: false, bonus: [] }, said);
    expect(miss?.pass).toBe(false);
    expect(miss?.missing).toEqual(["soudan"]);
    expect(LOGIC.reactionKey(miss)).toBe("soudan");
    expect(LOGIC.countsAsFail(miss)).toBe(true);
  });

  it("レベル1は 確認した こと・自分の 考えが 無くても 合格（要るのは 3つ）", () => {
    const pass = LOGIC.settle(
      L1,
      { ...yes, kakunin: false, kangae: false, own_words: false, bonus: [] },
      said,
    );
    expect(pass?.pass).toBe(true);
    expect(L1.ai.required).toEqual(["jokyo", "mondai", "soudan"]);
  });

  it("勝手に 決めたら（許可を 聞かない）やり直し。レベル2では 見ない", () => {
    const alone = LOGIC.settle(
      L3,
      { ...yes, decided_alone: true, own_words: true, bonus: [] },
      said,
    );
    expect(alone?.pass).toBe(false);
    expect(LOGIC.reactionKey(alone)).toBe("decided_alone");
    const l2 = LOGIC.settle(L2, { ...yes, decided_alone: true, own_words: true, bonus: [] }, said);
    expect(l2?.pass).toBe(true);
  });

  it("聞き取れない は 回数に 数えない", () => {
    const unclear = LOGIC.settle(L1, { ...yes, unclear: true, bonus: [] }, said);
    expect(unclear?.pass).toBe(false);
    expect(LOGIC.countsAsFail(unclear)).toBe(false);
    const short = LOGIC.settle(L1, { ...yes, bonus: [] }, "はい");
    expect(short?.failure).toBe("unclear");
  });

  it("自分の ことば: ヒントを 見ないで 話す か、ヒントに 無い ことを 足すと 加点。ヒントを うめた だけは 加点なし", () => {
    const noHint = LOGIC.settle(L1, { ...yes, own_words: false, bonus: [] }, said, {
      hintsOpened: false,
    });
    expect(noHint?.ownWords).toBe(true);
    expect(noHint?.templateOnly).toBe(false);
    const filled = LOGIC.settle(L1, { ...yes, own_words: false, bonus: [] }, said, {
      hintsOpened: true,
    });
    expect(filled?.ownWords).toBe(false);
    expect(filled?.templateOnly).toBe(true);
    const added = LOGIC.settle(L1, { ...yes, own_words: true, bonus: ["reason"] }, said, {
      hintsOpened: true,
    });
    expect(added?.ownWords).toBe(true);
    expect(LOGIC.bonusPoints(added)).toBe(2);
  });

  it("知らない 加点の id・重なりは 捨てる。知らない 方法は none", () => {
    const one = LOGIC.settle(
      L1,
      { ...yes, bonus: ["reason", "reason", "nanika"], choice: "Z" },
      said,
    );
    expect(one?.bonus).toEqual(["reason"]);
    expect(one?.choice).toBe("none");
  });

  it("返事が 崩れて いたら null（画面は もう一度 送らせる）", () => {
    expect(LOGIC.settle(L1, null, said)).toBeNull();
    expect(LOGIC.settle(L1, "pass", said)).toBeNull();
  });

  it("星は 1回で 3つ・2〜3回目で 2つ・お手本で 1つ。支えは 反応 → ヒント → お手本", () => {
    expect([0, 1, 2, 3, 5].map(LOGIC.starsForFails)).toEqual([3, 2, 2, 1, 1]);
    expect([0, 1, 2, 3, 4].map(LOGIC.supportLevel)).toEqual([0, 1, 2, 3, 3]);
  });

  it("お手本を 読めば 合格。最後の お願いを 言わないと 通らない", () => {
    for (const level of DATA.levels) {
      const whole = level.model.map((seg) => plain(seg.text)).join("");
      expect(LOGIC.readsModel(whole, level.model), level.id).toBe(true);
      const withoutLast = level.model
        .slice(0, -1)
        .map((seg) => plain(seg.text))
        .join("");
      expect(LOGIC.readsModel(withoutLast, level.model), level.id).toBe(false);
    }
  });

  it("判定の 頼みに 場面・要る 要素・学生の ことばが 入る（学生に 見せる 文は 作らせない）", () => {
    const prompt = LOGIC.buildJudgePrompt(L1, said, { hintsOpened: true });
    expect(prompt).toContain("jokyo, mondai, soudan");
    expect(prompt).toContain(said);
    expect(prompt).toContain("ヒントを 開きました");
    expect(prompt).not.toMatch(/\{[^{}|]+\|/);
    const schema = LOGIC.judgeSchema(L1);
    expect(schema.required).toContain("own_words");
    expect(schema.required).toContain("decided_alone");
  });
});

describe("席の 絵の 並び", () => {
  it("はじめは かならず 話しかけては いけない 状態・となり同士は 別・9秒 以内に 大丈夫そう", () => {
    for (const level of DATA.levels) {
      const cycle = LOGIC.deskCycle(`${level.id}:desk`);
      expect(cycle[0]).not.toBe("ok");
      const firstOk = cycle.indexOf("ok");
      expect(firstOk).toBeGreaterThanOrEqual(1);
      expect(firstOk).toBeLessThanOrEqual(3);
      cycle.forEach((state, at) => expect(cycle[(at + 1) % cycle.length]).not.toBe(state));
      expect(new Set(cycle.filter((state) => state !== "ok"))).toEqual(
        new Set(["phone", "busy", "talking"]),
      );
    }
  });

  it("レベルごとに 大丈夫そうに なる 時刻が 変わる（時間だけで 押せない）", () => {
    const okAt = new Set(
      DATA.levels.map((level) => LOGIC.deskCycle(`${level.id}:desk`).indexOf("ok")),
    );
    expect(okAt.size).toBeGreaterThan(1);
  });
});

describe("進み具合（Supabase に 入る 数）", () => {
  const save = {
    introSeen: true,
    levels: { l1: { stars: 3, bonus: 2 }, l2: { stars: 1, bonus: 0 } },
  };

  it("親の 受け口を 通る 形（短い 英字の 鍵と 数だけ）", () => {
    const position = LOGIC.toPosition(save, 5);
    expect(parseProgressPosition(position)).toEqual(position);
    expect(position).toMatchObject({ intro: 1, open: 3, s1: 3, p1: 2, s2: 1, s3: 0 });
  });

  it("記録から 戻すと 大きい ほうが 残る。クリアした つぎの レベルまで 開く", () => {
    const merged = LOGIC.mergePosition(
      { introSeen: false, levels: { l1: { stars: 2, bonus: 3 } } },
      { intro: 1, s1: 3, p1: 1, s2: 2 },
      5,
    );
    expect(merged.introSeen).toBe(true);
    expect((merged.levels as Rec).l1).toMatchObject({ stars: 3, bonus: 3 });
    expect(LOGIC.openLevelCount(merged, 5)).toBe(3);
    expect(LOGIC.allCleared(merged, 5)).toBe(false);
    expect(LOGIC.mergePosition(save, "x", 5)).toEqual(save);
  });
});

describe("先生の 画面に 残す 文", () => {
  it("問いの 台帳は データの 見出しと そろって いる（相談 5つ・調べ表 27＋考え 4つ）", () => {
    const prompts = LINK_ANSWER_PROMPTS.soudan_renshu ?? {};
    for (const level of DATA.levels) {
      expect(prompts[level.id]).toBe(
        `レベル${level.no} ${plain(level.title)} — マイクで 相談（何回目に 何と 言ったか）`,
      );
    }
    const ws = DATA.levels[4]!.worksheet!;
    for (const row of ws.rows) {
      for (const api of ws.apis) {
        expect(prompts[LOGIC.worksheetCellId(row.id, api.id)]).toBe(
          `レベル5 比較表 — ${plain(row.label)}（${api.name.split("（")[0]}）`,
        );
      }
    }
    for (const one of ws.thoughts) {
      expect(prompts[LOGIC.worksheetThoughtId(one.id)]).toBe(
        `レベル5 自分の 考え — ${plain(one.label)}`,
      );
    }
    expect(Object.keys(prompts)).toHaveLength(5 + 27 + 4);
  });

  it("相談の 記録は 何回目に 何と 言ったかを 1行に（1000字まで）", () => {
    const text = LOGIC.attemptsText([
      { heard: "写真が ありません。", pass: false },
      { heard: "仮の 写真を 使っても いいですか。", pass: true },
    ]);
    expect(text).toBe("1回目✖：写真が ありません。 ／ 2回目⭕：仮の 写真を 使っても いいですか。");
    expect(LOGIC.attemptsText([{ heard: "あ".repeat(2000), pass: true }]).length).toBe(1000);
  });

  it("調べ表の コピーは 空欄を「未確認」に する", () => {
    const ws = DATA.levels[4]!.worksheet!;
    const text = LOGIC.worksheetText(ws, { cells: { ws_model_claude: "claude-x" }, thoughts: {} });
    expect(text).toContain("Claude API：claude-x");
    expect(text).toContain("GPT API：未確認");
  });
});
