import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildFuriganaIndex } from "@/lib/text/furigana";
import { normalizeReading } from "@/lib/text/normalize";
import { collectLabeledTexts } from "@/lib/content-checks";
import { contentSchema, type Content, type Listening } from "@/content/schema";
import { opensRescue, rescueReading } from "@/components/listening/listening-checks";
import { rescueWordOnScreen } from "@/components/studio/listening-drafts";

/**
 * **いまの 教材の あいことば**を、教材そのものから 確かめる（2026-09-22）
 *
 * あいことばは 関所（こたえあわせへ 進む 手前）の 逃げ道で、先生が 教室で 教える。
 * だから 2つとも 本当で ないと 意味が 無い:
 *
 *  1. 先生が 言った とおりに 打てば **開く**（漢字でも かなでも）
 *  2. 学習者が **どこかで 読めて しまわない**
 *
 * 2 は 実際に 破れた。2026-09-22 に「その 課の 要点」を あいことばに したら、
 * 要点は まさに まえおきの 見かた（focus）に 書いて あり、7本中 5本が
 * **同じ 画面に 逐語で 出て いた**。さらに 直した あとも 2本が
 * **同じ ステージの 別の 教材**（ステージの せつめい・もんだいの 選択肢）に 残って いた。
 * 人の 目では 追えない ので、ここで 機械に 見せる。
 */

const ROOT = join(__dirname, "..");

function read(file: string): Content | null {
  const parsed = contentSchema.safeParse(JSON.parse(readFileSync(file, "utf8")) as unknown);
  return parsed.success ? parsed.data : null;
}

/** 教材ID → ファイル（ステージの contents から 引く ため）。 */
function contentFileById(): Map<string, string> {
  const byId = new Map<string, string>();
  for (const dir of readdirSync(join(ROOT, "content"), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const name of readdirSync(join(ROOT, "content", dir.name))) {
      if (!name.endsWith(".json")) continue;
      const file = join(ROOT, "content", dir.name, name);
      const raw = JSON.parse(readFileSync(file, "utf8")) as { id?: string };
      if (raw.id) byId.set(raw.id, file);
    }
  }
  return byId;
}

/** その教材で 学習者が 読む 字を ぜんぶ つないだ もの（比べる 形に 倒して ある）。 */
function learnerText(file: string): string {
  const content = read(file);
  if (!content) return "";
  return normalizeReading(
    collectLabeledTexts(content)
      .map((item) => item.text)
      .join(""),
  );
}

const listenings = readdirSync(join(ROOT, "content", "listening"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => read(join(ROOT, "content", "listening", name)))
  .filter((c): c is Listening => c?.kind === "listening");

const withWord = listenings.filter((l) => l.rescueWord);

describe("あいことばは 打てば 開く", () => {
  it("あいことばを 持つ 教材が ある（この 検査そのものが 空回りして いない）", () => {
    // ファイル数ではなく **語を 持つ 教材の 数**を 数える。全部から 語が 落ちても
    // 「0件を 0件 調べて 緑」に ならない ように。
    expect(withWord.length).toBeGreaterThanOrEqual(5);
  });

  for (const listening of withWord) {
    it(`${listening.id}: そのままでも、かなでも 開く`, () => {
      const furigana = buildFuriganaIndex(listening.furigana ?? []);
      const word = listening.rescueWord as string;
      expect(opensRescue(word, listening, furigana)).toBe(true);

      /*
       * 先生が 黒板に 書く かなの 形（スタジオが 出す もの）。**漢字が 残って いたら だめ**
       * ——そこは 学習者が 打てない ので、読み辞書に 足す 合図に なる。
       */
      const kana = rescueReading(listening, furigana);
      expect(kana).not.toMatch(/[一-鿿]/u);
      expect(opensRescue(kana, listening, furigana)).toBe(true);
    });
  }
});

/**
 * **同じ ステージの ほかの 教材に 出て いても よい**と 決めた もの。
 *
 * `KNOWN_ESCAPED`（`tests/coverage_walker.test.ts`）と 同じ 運用で、
 * **ここに 無い ものが 出たら 落とす**。1件 直したら 1行 消す。
 */
const ALLOW_IN_STAGE: Readonly<Record<string, { ref: string; why: string }>> = {
  youken_hearing: {
    ref: "youken_matcha",
    why: "ユーザー指定（2026-09-22）の「抹茶」。同じ ステージの **1つ前の 教材**（記事「抹茶と 茶道を 知る」）に 出て くる 語で、そこを 読んだ 学習者だけが 知って いる。聞く 前の 画面には 出ない",
  },
};

describe("あいことばは どこにも 書いて いない", () => {
  const byId = contentFileById();
  const stages = readdirSync(join(ROOT, "content", "stages"))
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) =>
        JSON.parse(readFileSync(join(ROOT, "content", "stages", name), "utf8")) as {
          id: string;
          title?: string;
          description?: string;
          contents?: { ref: string }[];
        },
    );

  for (const listening of withWord) {
    it(`${listening.id}: 聞く 前の 画面に 出て いない`, () => {
      // 題・せつめい・見かたは まえおきの 画面（関所と 同じ 画面）に 出る
      expect(rescueWordOnScreen(listening)).toBe(false);
    });

    it(`${listening.id}: 同じ ステージの ほかの 教材にも 出て いない`, () => {
      const needle = normalizeReading(listening.rescueWord as string);
      const stage = stages.find((s) => (s.contents ?? []).some((c) => c.ref === listening.id));
      if (!stage) return; // どのステージにも 入って いない 教材（一覧からのみ 到達）

      const stageText = normalizeReading(`${stage.title ?? ""}${stage.description ?? ""}`);
      expect(
        stageText.includes(needle),
        `ステージ「${stage.id}」の 題・せつめいに 出て います`,
      ).toBe(false);

      for (const item of stage.contents ?? []) {
        if (item.ref === listening.id) continue;
        if (ALLOW_IN_STAGE[listening.id]?.ref === item.ref) continue;
        const file = byId.get(item.ref);
        if (!file) continue;
        expect(
          learnerText(file).includes(needle),
          `同じ ステージの「${item.ref}」に 出て います`,
        ).toBe(false);
      }
    });
  }
});
