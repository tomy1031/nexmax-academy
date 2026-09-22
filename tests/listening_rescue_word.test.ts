import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildFuriganaIndex } from "@/lib/text/furigana";
import { contentSchema, type Content, type Listening } from "@/content/schema";
import {
  matchesRescueFingerprint,
  opensRescue,
  rescueFingerprints,
  rescueReading,
} from "@/components/listening/listening-checks";
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

      /*
       * 画面が 持つのは 指紋だけ（語は 配信HTMLに 載せない）。**同じ 2つの 形**で
       * 開かないと、直した つもりで 逃げ道だけ 死ぬ。
       */
      const prints = rescueFingerprints(listening, furigana);
      expect(prints.length).toBeGreaterThan(0);
      expect(matchesRescueFingerprint(word, prints, furigana)).toBe(true);
      expect(matchesRescueFingerprint(kana, prints, furigana)).toBe(true);
      expect(matchesRescueFingerprint("ちがうことば", prints, furigana)).toBe(false);
      expect(prints.join("")).not.toContain(word);
    });
  }
});

/**
 * **画面に 出て いても よい**と 決めた もの（1件ごとに 理由を 書く）。
 *
 * `KNOWN_ESCAPED`（`tests/coverage_walker.test.ts`）と 同じ 運用で、
 * **ここに 無い ものが 出たら 落とす**。1件 直したら 1行 消す。
 */
const ALLOW_ON_SCREEN: Readonly<Record<string, string>> = {
  kaisha_shugyo_keitai_listening:
    "ユーザー指定（2026-09-22）の「受託開発」。この 教材の 見かた「SES・受託開発・自社開発の「どこで 働くか」に 注目して 聞きましょう。」に そのまま 出て いる——読んで 打てる ことは 承知の うえ",
};

describe("あいことばは 関所と 同じ 画面に 書いて いない", () => {
  /*
   * 見るのは **打って いる その 画面**だけ（題・せつめい・見かた・参加者）。
   * 同じ ステージの ほかの 教材は 見ない——あいことばは その 課の ことばなので、
   * ステージの どこかには 必ず 出る（2026-09-22 に 広げて みたら、短い
   * キーワードは 例外なく 当たった）。別の 画面を 開いて 探すのは、
   * 聞くのと 同じくらい 手間が かかる。
   */
  for (const listening of withWord) {
    const allowed = ALLOW_ON_SCREEN[listening.id];
    it(`${listening.id}: 聞く 前の 画面に 出て いない${allowed ? "（例外として 記録ずみ）" : ""}`, () => {
      expect(rescueWordOnScreen(listening)).toBe(Boolean(allowed));
    });
  }

  it("記録した 例外が もう 要らなく なって いない（直したら 1行 消す）", () => {
    for (const id of Object.keys(ALLOW_ON_SCREEN)) {
      const listening = withWord.find((l) => l.id === id);
      expect(listening, `${id} は もう 無い`).toBeDefined();
    }
  });
});
