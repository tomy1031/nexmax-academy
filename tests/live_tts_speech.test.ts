import { describe, expect, it } from "vitest";

import { forSpeech } from "../scripts/lib/live_tts";

/**
 * **読み上げ用の 言い換え**（画面の 字は 変えない）
 *
 * ラテン文字の 名前は 2通りに 転ぶ:
 * - 綴りから **読めない**（`NMClaw` →「エヌエムシーロー」・2026-09-04 実発生）
 * - 綴りから **ことばとして 読めて しまう**（`ABA` →「アバ」・2026-09-23 実発生。
 *   カンボジアの 銀行で、正しくは エービーエー）
 *
 * どちらも **聞くまで 分からない**——ファイルは できて いるし、字は 正しい。
 * ここで 1つずつ 止めて おく。
 */
describe("読み上げの 言い換え", () => {
  it("ABA は エービーエー と 読む", () => {
    expect(forSpeech("ABA Payの ボタンを 作りました。")).toBe(
      "エービーエー ペイの ボタンを 作りました。",
    );
    expect(forSpeech("ABAの 仕様を 調べました。")).toBe("エービーエーの 仕様を 調べました。");
  });

  it("NMClaw は エヌエムクロー と 読む", () => {
    expect(forSpeech("NMClaw を つかいます。")).toBe("エヌエムクロー を つかいます。");
  });

  it("**画面の 字は 変えない**（言い換えるのは 渡す 文だけ）", () => {
    /* 表に 無い ことばは そのまま。頭字語は 綴りどおり 1字ずつ 読まれる。 */
    expect(forSpeech("APIと つなぎます。")).toBe("APIと つなぎます。");
    expect(forSpeech("ITの 仕事です。")).toBe("ITの 仕事です。");
  });

  it("2回 当てても 二重に ならない（指紋と 合成の 両方で 通る）", () => {
    const once = forSpeech("ABA Payです。");
    expect(forSpeech(once)).toBe(once);
  });
});
