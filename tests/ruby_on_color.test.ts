import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_KANJI_WORDS, aiReplyFurigana } from "@/lib/ai-kanji";
import { buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";

/**
 * **色の 面の 文字は、ふりがなも いっしょに 白に する**（2026-09-21 の 指定）
 *
 * 濃い 地（紺・緑・桃）に 白い 文字を のせる ところで、`style={{ color: "#fff" }}` と
 * インラインに 書くと **ふりがな（`rt`）だけ 濃い灰の まま 残る**。
 * `globals.css` の 逃げ道は
 *
 * ```css
 * .btn-game rt, .text-on-accent rt, .text-white rt { color: currentColor; }
 * ```
 *
 * ——**クラスにしか 効かない**ので、インラインの 色は すり抜ける。
 *
 * この 事故は 2026-08-18（ボタン）・2026-08-21（ラベル）・2026-09-21（答え合わせの
 * 緑の チップ）と **3回** 起きて いる。3回 目に して 機械の 見張りを 置く:
 * **インラインで 白い 文字色を 指定しない**。`text-white`（クラス）か
 * `RUBY_ON_COLOR`（`src/components/ruby-text.tsx`）を 使う。
 *
 * 白 以外の 色を インラインで 置くのは 止めない——沈むのは **濃い 地の 白文字**
 * だけで、そこだけ 機械で 塞げば 足りる（規則を 広げると、ふつうの 色づかいまで
 * 止まって 誰も 守らなく なる）。
 */

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/** 覚え書き（コメント）の 中の 例は 見ない——書いて よい 例と 書いては いけない 例が 並ぶ。 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");
}

/**
 * **くらべて いる だけ**の 白は 見ない（`face === "#ffffff" ? ink : undefined`）。
 * これは 白を 置いて いるのでは なく、白い 面の ときに **濃い 字**に する 側。
 */
function stripComparisons(code: string): string {
  return code.replace(/[!=]==?\s*["'][^"']*["']/gu, "");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/u.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * `color:` の 値に 白が 来て いる ところ。
 *
 * 三項（`color: on ? "#fff" : "…"`）も 拾える ように、`color:` から 行末までを 見る。
 * `borderColor` / `backgroundColor` は 別の 話なので 巻き込まない。
 */
const INLINE_WHITE = /(?<![A-Za-z])color:[^\n;]*["'](?:#fff|#ffffff|white)["']/giu;

describe("色の 面の ふりがな", () => {
  const files = sourceFiles(SRC);

  it("ソースを 読めて いる（この 検査そのものが 空回りして いない）", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("インラインの style で 白い 文字色を 置かない（ふりがなが ついて こない）", () => {
    const found: string[] = [];
    for (const file of files) {
      const code = stripComparisons(stripComments(readFileSync(file, "utf8")));
      for (const hit of code.match(INLINE_WHITE) ?? []) {
        found.push(`${file.slice(ROOT.length + 1)}  「${hit.trim()}」`);
      }
    }
    expect(
      found,
      "文字色は `text-white`（クラス）か RUBY_ON_COLOR で 置く。" +
        "インラインの color は ふりがな（rt）に 効かない",
    ).toEqual([]);
  });

  it("逃げ道（`.text-white rt`）が globals.css に 残って いる", () => {
    // このクラスが 消えたら 上の 決まりの 根拠が 無くなる（気づかず 全画面が 沈む）
    const css = readFileSync(join(SRC, "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.text-white rt/u);
    expect(css.replace(/\s+/gu, " ")).toMatch(/\.text-white rt \{ color: currentColor/u);
  });
});

/**
 * **AIが 書いた 文を 描く ところは、AIに 許した ことばの 読みを 重ねた 索引で 描く**
 *
 * AIの 返事には 読み辞書が 付いて こない。通す／通さないの 検査（`answer-check.tsx`）は
 * 教材の 辞書に `AI_KANJI_FURIGANA` を 重ねた 索引で 見て いるので、画面が 教材の 辞書
 * だけで 描くと **検査は 通るのに 画面では ルビが 付かない**——2026-09-21 の 読み検収で、
 * こたえの チェックの ひとことが まさに その 状態に なって いた
 *（「日付の 書き方が 足りません。」が 日・方 裸の まま 出る）。
 */
describe("AIの 文の 読み索引", () => {
  it("AIに 許した ことばの 読みを ぜんぶ 持って いる", () => {
    const index = buildFuriganaIndex(aiReplyFurigana([]));
    for (const word of AI_KANJI_WORDS) {
      expect(uncoveredKanji(word, index), `「${word}」が 覆えて いない`).toEqual([]);
    }
  });

  it("同じ 表記は **教材の 読み**が 勝つ（その 教材の 決めた 読みが 正）", () => {
    const merged = aiReplyFurigana([["進捗", "じゃあどうぞ"]]);
    const hit = merged.filter(([word]) => word === "進捗");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.[1]).toBe("じゃあどうぞ");
  });

  it("こたえの チェックの 画面は、AIの 文だけ その 索引で 描く", () => {
    // 部品を 分けた 日に 落ちた ので、渡し先を 機械で 見張る
    for (const name of ["mail-question.tsx", "slack-question.tsx"]) {
      const code = readFileSync(join(SRC, "components", "quiz", name), "utf8");
      expect(code, `${name} が AIの 読み索引を 作って いない`).toContain("aiReplyFurigana");
      expect(code, `${name} の ひとことが 教材の 辞書の まま`).not.toMatch(
        /<CheckNote[^>]*furigana=\{furigana\}/u,
      );
      expect(code, `${name} の ブラッシュアップが 教材の 辞書の まま`).not.toMatch(
        /<BrushUp[^>]*furigana=\{furigana\}/u,
      );
    }
  });
});
