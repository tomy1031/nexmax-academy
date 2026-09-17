import { describe, expect, it } from "vitest";

import {
  clampScore,
  contentScore,
  CONTENT_MAX,
  expectedPercentOf,
  markOf,
  saidWrongPercent,
  totalScore,
} from "@/lib/meeting/asakai-score";

/**
 * **点の 出しかた**（2026-09-17 の 指定「AI側の 採点などを しっかりと 作って ください」）
 *
 * 内容は アプリが 数え、伝わりやすさと 仕事の 日本語は AIが 見る。
 * 鍵が 無い 端末では **AIの 2つを 出さない**——見て いない ものに 0点を つけると、
 * 言えて いるのに 落とされたと 読める（規律1）。
 */
describe("内容の 点", () => {
  it("⭕ の 割合で 0〜40", () => {
    expect(contentScore(0, 4)).toBe(0);
    expect(contentScore(1, 4)).toBe(10);
    expect(contentScore(3, 4)).toBe(30);
    expect(contentScore(4, 4)).toBe(CONTENT_MAX);
    /* 木曜は 5枚。 */
    expect(contentScore(4, 5)).toBe(32);
  });

  it("札が 0枚でも 落ちない", () => {
    expect(contentScore(0, 0)).toBe(0);
  });

  it("数が はみ出しても 満点を 超えない", () => {
    expect(contentScore(9, 4)).toBe(CONTENT_MAX);
    expect(contentScore(-2, 4)).toBe(0);
  });
});

describe("総合", () => {
  it("AIの 2つが そろって いる ときだけ 出す", () => {
    expect(totalScore(36, 24, 22)).toBe(82);
    expect(totalScore(36, null, 22), "鍵が 無い ときは 総合を 出さない").toBeNull();
    expect(totalScore(36, 24, null)).toBeNull();
  });
});

describe("AIが 返した 点を そのまま 信じない", () => {
  it("0〜満点に 丸める", () => {
    expect(clampScore(31, 30)).toBe(30);
    expect(clampScore(-1, 30)).toBe(0);
    expect(clampScore(24.4, 30)).toBe(24);
  });

  it("数で なければ null", () => {
    for (const bad of ["24", null, undefined, {}, Number.NaN]) {
      expect(clampScore(bad, 30)).toBeNull();
    }
  });
});

describe("どのように 伝えられたか", () => {
  it("聞き返し 0回で ⭕ なら 最初から", () => {
    expect(markOf({ full: true, attempts: 0 })).toBe("first");
  });

  it("聞き返しの あとで ⭕ なら 質問の あと", () => {
    expect(markOf({ full: true, attempts: 1 })).toBe("probe");
  });

  it("数を まちがえて 直した ときは 修正", () => {
    expect(markOf({ full: true, attempts: 1, wrongNumber: true })).toBe("fixed");
  });

  it("⭕ に ならなければ 言えなかった", () => {
    expect(markOf({ full: false, attempts: 2 })).toBe("missing");
    expect(markOf({ full: false, attempts: 0 })).toBe("missing");
  });
});

describe("進捗の 数の まちがい", () => {
  const expected = expectedPercentOf(["45%", "45パーセント", "よんじゅうごぱーせんと"]);

  it("当たりことばから その日の 数を 取る", () => {
    expect(expected).toBe("45");
    expect(expectedPercentOf(["ABA", "Payの"])).toBeNull();
  });

  it("ちがう 数を 言って いたら 印が つく", () => {
    expect(saidWrongPercent("決済機能全体の 進捗は 70%です。", expected)).toBe(true);
    expect(saidWrongPercent("45%です。先ほどの 70%は 間違いです。", expected)).toBe(true);
  });

  it("その日の 数だけなら 印は つかない", () => {
    expect(saidWrongPercent("今、進捗は 45%です。", expected)).toBe(false);
    expect(saidWrongPercent("45 ％ です。", expected)).toBe(false);
  });

  it("数を 言って いない・その日の 数が 無い ときは 印を つけない", () => {
    expect(saidWrongPercent("きょうは テストを します。", expected)).toBe(false);
    expect(saidWrongPercent("進捗は 70%です。", null)).toBe(false);
  });
});
