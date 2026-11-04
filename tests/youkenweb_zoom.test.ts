import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioSchema } from "@/content/schema";
import { judgeAddressed, ownerOf } from "@/components/listening/people";

/*
 * ウェブサイトの 要件定義の Zoom（youkenweb_zoom）。鍵ゼロの 端末では、カードは
 * **ことばの 照合だけ**で 開く（2語 当たって はじめて 開く — req-matcher.ts の LOCAL_CONFIDENT_HITS）。
 *
 * 2026-11-04 の 通しプレイで「この サイトの 目的は 何ですか」（ヒントの 文 そのまま）が
 * 1語しか 当たらず、「おしい」の まま 開かなかった。ヒントの 文と、ふつうの 聞き方で、
 * **担当の 人に 聞けば 開く**ことを ここで 守る。
 */
const scenario = scenarioSchema.parse(
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "content", "scenarios", "youkenweb_zoom.json"),
      "utf8",
    ),
  ),
);
const reqs = scenario.interview.reqs;

function opens(utterance: string, targetId: string) {
  return judgeAddressed({ utterance, reqs, openIds: new Set(), targetId });
}

describe("ウェブサイトの 要件定義の Zoom: カードの 開き方", () => {
  it("どの カードも、ヒントの 文を 担当の 人に 言えば 開く", () => {
    for (const req of reqs) {
      expect(opens(req.hint, ownerOf(req)), `${req.id} ${req.hint}`).toEqual({
        kind: "opened",
        reqId: req.id,
      });
    }
  });

  it("ふつうの 聞き方でも 開く（通しプレイで 開かなかった 文）", () => {
    const cases: [string, string, string][] = [
      ["この サイトの 目的は 何ですか", "client", "r1"],
      ["何の ために サイトを 作りますか", "client", "r1"],
      ["サイトの ことばは 何語ですか", "client", "r4"],
      ["クメール語の ページは ありますか", "client", "r4"],
      ["サイトは だれが 更新しますか", "client", "r5"],
      ["予算は いくらですか", "client", "r2"],
      ["いつまでに 公開しますか", "client", "r3"],
      ["茶道体験は 何回 ありますか", "sasaki", "r6"],
      ["茶道教室は いつ ありますか", "sasaki", "r7"],
      ["写真を とっても いいですか", "sasaki", "r8"],
    ];
    for (const [utterance, target, id] of cases) {
      expect(opens(utterance, target), utterance).toEqual({ kind: "opened", reqId: id });
    }
  });

  it("ちがう 人に 聞くと 開かず、担当を 教える", () => {
    expect(opens("茶道体験は 何回 ありますか", "client")).toMatchObject({
      kind: "wrongPerson",
      ownerId: "sasaki",
    });
    expect(opens("予算は いくらですか", "sasaki")).toMatchObject({
      kind: "wrongPerson",
      ownerId: "client",
    });
  });
});
