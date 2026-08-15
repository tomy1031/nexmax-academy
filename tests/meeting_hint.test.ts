import { describe, expect, it } from "vitest";
import {
  HINT_BLANK,
  hintPatterns,
  hintSegments,
  readHintShown,
  readHintShownOnServer,
  saveHintShown,
} from "../src/lib/meeting/hint";
import { createMemoryBackend } from "../src/lib/progress/store";

describe("型文のほどき方（hintPatterns）", () => {
  it("かぎかっこを はずして、そのまま 言える 1文にする", () => {
    expect(hintPatterns("「わたしは ◯◯です。」")).toEqual(["わたしは ◯◯です。"]);
  });

  it("／で つないだ 言い方は 別々の 型文になる", () => {
    expect(hintPatterns("「すこし むずかしいです。」／「たのしいです。」")).toEqual([
      "すこし むずかしいです。",
      "たのしいです。",
    ]);
  });

  it("半角スラッシュでも 分ける（先生が どちらで 書いても 同じ見え方にする）", () => {
    expect(hintPatterns("「◯◯は、どうですか。」/「どうして ◯◯ですか。」")).toEqual([
      "◯◯は、どうですか。",
      "どうして ◯◯ですか。",
    ]);
  });

  it("中の かぎかっこは 残す（外側だけ はずす）", () => {
    expect(hintPatterns("「たとえば、「◯◯」が ありました。」")).toEqual([
      "たとえば、「◯◯」が ありました。",
    ]);
  });

  it("かぎかっこが 無い 教材も そのまま 通す", () => {
    expect(hintPatterns("◯◯です。")).toEqual(["◯◯です。"]);
  });

  it("空・空白だけの かけらは 落とす（からっぽの 行を 画面に 出さない）", () => {
    expect(hintPatterns("")).toEqual([]);
    expect(hintPatterns("「◯◯です。」／  ")).toEqual(["◯◯です。"]);
  });
});

describe("穴の 見つけ方（hintSegments）", () => {
  it("◯◯ だけを 穴として 切り出す", () => {
    expect(hintSegments("わたしは ◯◯です。")).toEqual([
      { text: "わたしは ", blank: false },
      { text: HINT_BLANK, blank: true },
      { text: "です。", blank: false },
    ]);
  });

  it("穴が 2つ ある 型文でも 両方 印を つける", () => {
    expect(hintSegments("◯◯は ◯◯です。")).toEqual([
      { text: HINT_BLANK, blank: true },
      { text: "は ", blank: false },
      { text: HINT_BLANK, blank: true },
      { text: "です。", blank: false },
    ]);
  });

  it("穴の ない 型文は 地の文 1つ（からの span を 作らない）", () => {
    expect(hintSegments("たのしいです。")).toEqual([{ text: "たのしいです。", blank: false }]);
  });

  it("かけらが 空でも 断片を 増やさない", () => {
    expect(hintSegments("◯◯")).toEqual([{ text: HINT_BLANK, blank: true }]);
  });
});

describe("型文を 見せるかの 記おく", () => {
  it("保存が 無ければ 見える（いちばん こわい 学習者を 足場なしにしない）", () => {
    expect(readHintShown(createMemoryBackend())).toBe(true);
    expect(readHintShownOnServer()).toBe(true);
  });

  it("かくす／見せる が 次に 読んだ ときも 残る", () => {
    const backend = createMemoryBackend();
    saveHintShown(false, backend);
    expect(readHintShown(backend)).toBe(false);
    saveHintShown(true, backend);
    expect(readHintShown(backend)).toBe(true);
  });

  it("壊れた 保存値は 見える 側に 倒す", () => {
    const backend = createMemoryBackend();
    backend.set("nexmax:v1:meeting-hint", "{壊れている}");
    expect(readHintShown(backend)).toBe(true);
  });

  it("進捗ストアと 同じ 名前空間の 鍵に 書く", () => {
    const backend = createMemoryBackend();
    saveHintShown(false, backend);
    expect(backend.get("nexmax:v1:meeting-hint")).toBe("false");
  });
});
