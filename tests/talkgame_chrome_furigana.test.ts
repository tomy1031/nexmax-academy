import { describe, expect, it } from "vitest";
import { CHROME_ENTRIES } from "@/components/talk-game/talk-game-session";
import { annotateRuby, buildFuriganaIndex, uncoveredKanji } from "@/lib/text/furigana";

/**
 * 対話ゲームの **画面の 飾り**の 読みを 見張る
 *
 * ## なぜ ここに 要るのか
 * `npm run lint:content` は src の 文字列を **禁止語しか** 見ない（`checkSourceForbiddenWords`）。
 * 教材の 読み辞書は 覆いも 誤読も 機械が 見るのに、画面が 自分で 出す ことばは
 * **だれも 見て いなかった**——2026-09-03 に「これまでの 話」が「これまでの はな」と
 * 出て いるのを ユーザーが 見つけた（1字の「話」を はな とだけ 置いて いた）。
 *
 * ## 送りがなで 読みが 変わる
 * 1字の 辞書では 名詞と 動詞を 分けられない。長い 表記が 先に 当たる
 *（`buildFuriganaIndex` の 最長一致）ことを 使って、動詞の 形を 別に 置く。
 * 教材の 読み辞書（`content/meetings/kaisha_matsui.json`）と 同じ 並べ方に そろえて ある。
 */

const index = buildFuriganaIndex(CHROME_ENTRIES);

/** 画面に 出る 見た目（`RubyText` と 同じ 当たり方）を 1行の 文字列に する。 */
function ruby(text: string): string {
  return annotateRuby(text, index)
    .map((one) => (one.reading ? `${one.text}(${one.reading})` : one.text))
    .join("");
}

describe("対話ゲームの 画面の 読み", () => {
  it("名詞の「話」は はなし と 読ませる", () => {
    expect(ruby("これまでの 話")).toBe("これまでの 話(はなし)");
  });

  it("動詞の「話す」は 送りがなの ぶんだけ 別に 当たる", () => {
    expect(ruby("つづきから 話しましょう。")).toBe("つづきから 話し(はなし)ましょう。");
    expect(ruby("社長と 話して、こうかんど 100% を めざしましょう。")).toBe(
      "社長(しゃちょう)と 話し(はなし)て、こうかんど 100% を めざしましょう。",
    );
    expect(ruby("話す")).toBe("話す(はなす)");
    expect(ruby("話そう")).toBe("話そ(はなそ)う");
    expect(ruby("話せた")).toBe("話せ(はなせ)た");
  });

  it("画面が 出す ことばに 裸の 漢字を 残さない（規律2）", () => {
    for (const text of [
      "これまでの 話",
      "つづきから 話しましょう。",
      "社長と 話して、こうかんど 100% を めざしましょう。",
      "じゅんびで 書いた こと",
    ]) {
      expect(uncoveredKanji(text, index)).toEqual([]);
    }
  });
});
