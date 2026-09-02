import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { meetingSchema } from "@/content/schema";

/**
 * ヒントの 型文は **お手本の 全文を 覆う**（2026-09-02 の 指定）
 *
 * ## 何が こまるのか
 * 型文が 1文しか なくて お手本が 3文 あると、学習者は
 * **どこまでが まねる ところなのか 分からない**。
 * 逆に お手本に 型文と ちがう 言い回しが 入って いると、
 * 型文の ほうが 間違って いるように 見える。
 *
 * 見せる ものが 2つ ある 以上、**片方が もう片方の 形を 説明して いる**必要が ある:
 *
 *     型文  「私は ◯◯を やって みたいです。」「なぜなら ◯◯だからです。」
 *     お手本 「私は NMClawを 作る 仕事を やって みたいです。なぜなら …のこるからです。」
 *
 * ◯◯ を 埋めれば お手本に なる——この 関係を 機械で 見張る。
 * 文言は 人が 書くので、**書いた あとで ずれる**（実際 1度 ずれた）。
 *
 * ## 「なぜなら」を 強いない
 * 型に する のは **形が そろって いる こと**で、特定の ことばでは ない。
 * 2026-09-02 に 全問へ「なぜなら」を 足して 直された——
 * 問いごとに 自然な 言い方が ある（「◯◯だからです。」「◯◯に 使いたいです。」）。
 */

const ROOT = join(__dirname, "..");
const meeting = meetingSchema.parse(
  JSON.parse(readFileSync(join(ROOT, "content/meetings/kaisha_matsui.json"), "utf8")),
);

/** 「。」で 文に 切る（さいごの 空を 落とす）。 */
function sentences(text: string): string[] {
  return text
    .split("。")
    .map((one) => one.trim())
    .filter((one) => one !== "")
    .map((one) => `${one}。`);
}

/** 型文の 穴（◯◯）以外の ところ。ここが お手本に 順に 出て くるはず。 */
function fixedParts(hint: string): string[] {
  return hint
    .split(/◯+/)
    .map((one) => one.trim())
    .filter((one) => one !== "");
}

describe("ヒントの 型文と お手本", () => {
  const openers = meeting.talkGame?.openers ?? [];

  it("しつもんは ぜんぶ 型文と お手本を 持つ", () => {
    const missing = openers.filter((one) => !one.hint?.length || !one.example);
    expect(missing.map((one) => one.ask)).toEqual([]);
  });

  it("型文の 数と お手本の 文の 数が そろう（全文が 型に なって いる）", () => {
    for (const one of openers) {
      expect(sentences(one.example ?? ""), `「${one.ask}」の お手本`).toHaveLength(
        (one.hint ?? []).length,
      );
    }
  });

  it("お手本は 型文に ◯◯ を うめた 形に なって いる", () => {
    for (const one of openers) {
      const said = sentences(one.example ?? "");
      (one.hint ?? []).forEach((hint, at) => {
        let rest = said[at] ?? "";
        for (const part of fixedParts(hint)) {
          const found = rest.indexOf(part);
          expect(
            found,
            `「${one.ask}」の ${at + 1}文目: 型文「${hint}」の「${part}」`,
          ).toBeGreaterThanOrEqual(0);
          rest = rest.slice(found + part.length);
        }
      });
    }
  });

  it("型文には 穴（◯◯）が ある（そのまま 写す 文に しない）", () => {
    for (const one of openers) {
      for (const hint of one.hint ?? []) {
        expect(hint, `「${one.ask}」の 型文`).toContain("◯");
      }
    }
  });
});
