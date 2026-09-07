import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_CONFIDENT_HITS, matchLocally } from "../src/components/listening/req-matcher";
import { contentSchema, type Scenario } from "../src/content/schema";

/**
 * 「画面が 見せた ヒントの とおりに 聞いたら、その 札が 開く」ことの 見張り。
 *
 * ## なぜ 要るか
 * 判定は いま **ことばの 照合だけ**で 動く（2026-08-20 に AIの 判定を 外した——
 * Live とは 別勘定の 無料枠を すぐ 使い切る ため。`live-mode.tsx` に 経緯）。
 * ところが 旧アプリから 移した 5話の `keywords` は **AIの 判定が 主役だった 時代**の もので、
 * 「お客さまの 答え」に 出る 語ばかりだった。だから 学習者が **画面の ヒントの とおりに
 * 質問しても 札が 開かない**——50項目中 3項目しか 開かなかった（2026-09-07 の 通しプレイ検収）。
 * 設計01 P8「取りこぼしは 誤って 開くより 重い 失敗」に 正面から 反する。
 *
 * 質問の 側の ことばを 足して 直した。ここが 落ちたら、また 同じ 場所に 戻っている。
 *
 * ## 3つ 見る
 *  1. ヒントの とおりに 聞けば 開く（取りこぼさない）
 *  2. 言い方を すこし 変えても 開く（1語1句の 暗記に しない）
 *  3. あいさつでは 開かない（聞いて いないのに 開く のは 練習に ならない）
 */

const DIR = join(import.meta.dirname, "..", "content", "scenarios");

function scenarios(): Scenario[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => contentSchema.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))))
    .filter((c): c is Scenario => c.kind === "scenario");
}

/** ヒントの 中の かぎ括弧の 文＝学習者が そのまま 打つ 質問。 */
function question(hint: string): string {
  return /[「『]([^」』]+)[」』]/u.exec(hint)?.[1] ?? hint;
}

/** お客さまインタビューの 5話（旧アプリ由来）。ここが この 検査の 持ち場。 */
const FIVE = new Set(["bakery", "salon", "farm", "juku", "guesthouse"]);

/** あいさつ・世間話。1つも 開いては いけない。 */
const SMALLTALK = [
  "はじめまして。ネクストメイクの エンジニアです。今日は よろしく おねがいします。",
  "こんにちは",
  "ありがとうございます",
  "よろしく おねがいします",
  "すみません、もう一度 おねがいします",
  "はい、わかりました",
  "つまり、そういう ことですね？",
  "ありがとうございました。会社で 整理して、また ご連絡します。",
];

describe("ヒントの とおりに 聞けば 札が 開く（お客さまインタビュー5話）", () => {
  const five = scenarios().filter((s) => FIVE.has(s.id));

  it("5話とも 読めている（テストが 空回りして いない）", () => {
    expect(five.map((s) => s.id).sort()).toEqual(["bakery", "farm", "guesthouse", "juku", "salon"]);
  });

  it("ヒントの 文で、その 札が 開く", () => {
    for (const scenario of five) {
      const reqs = scenario.interview.reqs;
      for (const req of reqs) {
        const asked = question(req.hint);
        const { reqId, hits } = matchLocally(asked, reqs, new Set());
        expect(
          reqId === req.id && hits >= LOCAL_CONFIDENT_HITS,
          `${scenario.id} ${req.id}「${asked}」→ ${reqId ?? "どれも"}（${hits}語）`,
        ).toBe(true);
      }
    }
  });

  it("言い方を すこし 変えても、同じ 札が 開く", () => {
    for (const scenario of five) {
      const reqs = scenario.interview.reqs;
      for (const req of reqs) {
        const asked = question(req.hint);
        const said = [
          asked.replace(/ですか？$/u, "のですか？"),
          asked.replace(/ますか？$/u, "ますでしょうか？"),
          asked.replace(/？$/u, "か、おしえて ください。"),
        ];
        for (const utterance of said) {
          const { reqId, hits } = matchLocally(utterance, reqs, new Set());
          expect(
            reqId === req.id && hits >= LOCAL_CONFIDENT_HITS,
            `${scenario.id} ${req.id}「${utterance}」→ ${reqId ?? "どれも"}（${hits}語）`,
          ).toBe(true);
        }
      }
    }
  });

  it("あいさつでは 1つも 開かない", () => {
    for (const scenario of five) {
      for (const utterance of SMALLTALK) {
        const { reqId, hits } = matchLocally(utterance, scenario.interview.reqs, new Set());
        expect(
          reqId !== null && hits >= LOCAL_CONFIDENT_HITS,
          `${scenario.id}「${utterance}」で ${reqId} が 開いた`,
        ).toBe(false);
      }
    }
  });
});
