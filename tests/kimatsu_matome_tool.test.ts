import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LEARNER_WORDS } from "@/content/schema";
import { checkCountryNamesInTexts } from "@/lib/content-checks";
import { KANJI } from "@/lib/text/furigana";

/**
 * 期末テスト対策の まとめページ（public/tools/hourensou/kimatsu_matome.*）を 機械で 見る。
 *
 * React では なく **静的な 1枚**なので、`npm run lint:content` が 中身を 見ない。ここで 見る:
 *  1. 学生が 読む 文に ふりがなの ない 漢字が 無い（必ず守るルール2）・ルビが ひらがな
 *  2. 禁止語・国名（ルール1・9）
 *  3. **特定の 会社の 話を 問わない**（2026-11-20 tomy さん「特定の会社や限定された情報でなく、
 *     汎用的なITやビジネスで使う知識を問う」）
 *  4. もんだいの 形（正解の 番号・しわけの カゴ・ごぐんの マス）が 崩れて いない
 *  5. 絵の ファイルが ある・ステージと リンクが この ページを 指して いる
 */

type Rec = Record<string, unknown>;

const DIR = join("public", "tools", "hourensou");
const source = readFileSync(join(DIR, "kimatsu_matome.data.js"), "utf8");
const win: Rec = {};
new Function("window", source)(win);

interface Question {
  type: string;
  q: string;
  options?: string[];
  answer?: number | string;
  answers?: number[];
  responses?: string[];
  responseAnswer?: number;
  sentence?: string;
  blanks?: string[];
  bank?: string[];
  accept?: string[];
  explain: string;
}
interface Special {
  type: string;
  prompt: string;
  items: string[];
  buckets?: string[];
  mapping?: number[];
  explain: string;
}
interface Cart {
  id: string;
  nm: string;
  explanation: { heading: string; image?: string; points: string[] }[];
  questions: Question[];
  special: Special[];
}
const DATA = win.KIMATSU_MATOME as Rec & { id: string; carts: Cart[]; background: string };

const RUBY = /\{([^{}|]+)\|([^{}|]+)\}/g;
/** ルビ記法の 外側（画面の R() と 同じ 見方——書いた 場所だけが ルビに なる）。 */
const outsideRuby = (text: string) => text.replace(RUBY, "");
const plain = (text: string) => text.replace(RUBY, "$1");

/** 画面に 出ない 値（絵の 道・色・id・英字の 札・入力の 受け入れ）。 */
const SKIP = new Set([
  "id",
  "image",
  "background",
  "imageVersion",
  "color",
  "cap",
  "icon",
  "stamp",
  "type",
  "en",
  "accept",
]);

function learnerTexts(): string[] {
  const texts: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (SKIP.has(key)) return;
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach((one) => walk(one, key));
    else if (value && typeof value === "object")
      Object.entries(value as Rec).forEach(([k, v]) => walk(v, k));
  };
  walk(DATA, "");
  return texts;
}

describe("期末テスト対策の まとめページ：文言", () => {
  it("ふりがなの ない 漢字が 無い（必ず守るルール2）", () => {
    const bare: string[] = [];
    for (const text of learnerTexts()) {
      const missing = [...outsideRuby(text)].filter((char) => KANJI.test(char));
      if (missing.length > 0) bare.push(`${missing.join("")} ← 「${plain(text)}」`);
    }
    expect(bare).toEqual([]);
  });

  it("ルビの 読みは ひらがなだけ・ルビの 中は 漢字から 始まる", () => {
    const bad: string[] = [];
    for (const text of learnerTexts()) {
      for (const m of text.matchAll(RUBY)) {
        const [all, surface = "", reading = ""] = m;
        if (!/^[ぁ-ゖー]+$/.test(reading) || !KANJI.test(surface[0] ?? "")) bad.push(all);
      }
    }
    expect(bad).toEqual([]);
  });

  it("学習者に 向けた 禁止語が 無い（ルール1）", () => {
    const all = learnerTexts().map(plain).join("\n");
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      expect(all, `禁止語「${word}」が ある`).not.toContain(word);
    }
  });

  it("使わない 国名が 無い（ルール9）", () => {
    const findings = checkCountryNamesInTexts(
      "public/tools/hourensou/kimatsu_matome.data.js",
      learnerTexts().map(plain),
    );
    expect(findings.map((finding) => finding.message)).toEqual([]);
  });

  it("特定の 会社の 話を 問わない（汎用的な IT・ビジネスの 知識だけ）", () => {
    const all = learnerTexts().map(plain).join("\n");
    for (const name of [
      "NEXT MAKE",
      "NEXTMAKE",
      "ネクストメイク",
      "NMClaw",
      "CONTINUE",
      "Verify",
      "松井",
      "ヘンディ",
      "藤木",
      "Japanese IT Pathway",
    ]) {
      expect(all, `「${name}」が 出て いる`).not.toContain(name);
    }
  });

  it("おわりの しるしは ページが 出す（owns-done を 名乗り、ぜんぶ クリアで link-done）", () => {
    const html = readFileSync(join(DIR, "kimatsu_matome.html"), "utf8");
    expect(html).toContain("nexmax:link-owns-done");
    expect(html).toContain("nexmax:link-done");
  });

  it("画面の 枠（HTML）に 学生が 読む 漢字を 書いて いない（文言は データだけ）", () => {
    const html = readFileSync(join(DIR, "kimatsu_matome.html"), "utf8");
    const body = html.slice(html.indexOf("<body>"), html.indexOf("<script src="));
    const visible = body.replace(/<!--[\s\S]*?-->/g, "");
    expect([...visible].filter((char) => KANJI.test(char))).toEqual([]);
  });
});

describe("期末テスト対策の まとめページ：もんだいの 形", () => {
  it("カートリッジは 5つ（企業調査・空気を 読む・報告・連絡・相談）", () => {
    expect(DATA.carts.map((cart) => cart.id)).toEqual([
      "kaisha",
      "kuuki",
      "houkoku",
      "renraku",
      "soudan",
    ]);
  });

  for (const cart of DATA.carts) {
    describe(cart.id, () => {
      it("メモと もんだいが ある", () => {
        expect(cart.explanation.length).toBeGreaterThanOrEqual(4);
        expect(cart.questions.length + cart.special.length).toBeGreaterThanOrEqual(12);
      });

      it("正解の 番号が 選択肢の 中に ある", () => {
        for (const q of cart.questions) {
          const at = plain(q.q);
          if (q.type === "choose" || q.type === "emotion") {
            expect(q.options?.length, at).toBeGreaterThanOrEqual(3);
            expect(q.answer, at).toBeTypeOf("number");
            expect(q.options?.[q.answer as number], at).toBeDefined();
          }
          if (q.type === "emotion") {
            expect(q.responses?.[q.responseAnswer ?? -1], at).toBeDefined();
          }
          if (q.type === "multi") {
            expect(q.answers?.length, at).toBeGreaterThanOrEqual(2);
            for (const a of q.answers ?? []) expect(q.options?.[a], at).toBeDefined();
            // ぜんぶ 正解だと「ぜんぶ 押す」だけで 通って しまう
            expect(q.answers?.length, at).toBeLessThan(q.options?.length ?? 0);
          }
          if (q.type === "keyword") {
            expect(q.accept?.length, at).toBeGreaterThan(0);
            expect(q.accept, at).toContain(plain(String(q.answer)));
          }
          if (q.type === "wordbank") {
            const slots = (q.sentence ?? "").split(/[（(]\s*\d+\s*[）)]/).length - 1;
            expect(slots, at).toBe(q.blanks?.length);
            for (const blank of q.blanks ?? []) expect(q.bank, at).toContain(blank);
            expect(q.bank?.length, at).toBeGreaterThan(q.blanks?.length ?? 0);
          }
          expect(["choose", "emotion", "multi", "keyword", "wordbank"], at).toContain(q.type);
        }
      });

      it("しわけ・ならべかえの 形が そろって いる", () => {
        for (const s of cart.special) {
          const at = plain(s.prompt);
          expect(["sort", "order"], at).toContain(s.type);
          expect(s.items.length, at).toBeGreaterThanOrEqual(3);
          if (s.type === "sort") {
            expect(s.mapping?.length, at).toBe(s.items.length);
            for (const m of s.mapping ?? []) expect(s.buckets?.[m], at).toBeDefined();
            // どの カゴにも 1つは 入る
            expect(new Set(s.mapping).size, at).toBe(s.buckets?.length);
          }
        }
      });

      it("メモの 絵が ある", () => {
        for (const block of cart.explanation) {
          expect(block.image, block.heading).toBeTruthy();
          expect(existsSync(join("public", block.image ?? "")), block.image).toBe(true);
        }
      });
    });
  }

  it("島の 背景が ある", () => {
    expect(existsSync(join("public", DATA.background))).toBe(true);
  });
});

describe("期末テスト対策の ステージ", () => {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Rec;
  const stage = read(join("content", "stages", "test-taisaku.json")) as Rec & {
    contents: { ref: string; type: string }[];
    wordStageIds: string[];
    order: number;
  };
  const link = read(join("content", "links", "kimatsu_matome.json"));
  const words = read(join("content", "wordstages", "kimatsu_kotoba.json")) as Rec & {
    wordIds: string[];
  };

  it("ステージの 教材は この ページ、単語テストは 40語", () => {
    // 関門に する：4つ ぜんぶ クリアした ときだけ ステージが おわる（関門で ないと、開いた 瞬間に「ステージ クリア」が 出た）
    expect(stage.contents).toEqual([{ ref: "kimatsu_matome", type: "link", gates: true }]);
    expect(link.url).toBe("/tools/hourensou/kimatsu_matome.html");
    expect(link.id).toBe(DATA.id);
    expect(stage.wordStageIds).toEqual(["kimatsu_kotoba"]);
    expect(words.wordIds).toHaveLength(40);
  });

  it("相談の すぐ あとに 並ぶ（並びは order → id の 順）", () => {
    const soudan = read(join("content", "stages", "soudan.json")) as Rec & { order: number };
    expect(stage.order).toBe(soudan.order);
    expect(String(stage.id).localeCompare("soudan")).toBeGreaterThan(0);
  });
});
