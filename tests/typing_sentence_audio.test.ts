/**
 * タイピングの お手本の 文に、リスニングの 文ごとの 音を 当てる（2026-10-06 の 指定
 * 「お手本の 文の 音声って ちゃんと 対応しますか？ 対応して いるなら 音声再生の ボタンを」）。
 *
 * - お手本と 字が 同じ 音（空白は 見ない）を 当てる
 * - 短い 文を となりと 1つに した 音（「はい。パソコンと…」）は、お手本が **文として まるごと**
 *   入って いれば 当てる。文の 途中の 切れはし には 当てない
 * - その 一部を **切り出した 音**（`scripts/cut_sentence_parts.ts`）が あれば それを 鳴らす
 *  （同日の 選択「B」——「はい。」などを 鳴らさず、お手本と ぴったり 同じ 音に する）
 * - 1文でも 当たらなければ どの 文にも 出さない
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { audioUnitsOf } from "../src/content/listening-audio";
import {
  locateSentence,
  matchSentenceClips,
  scriptSentences,
  sentencePartFileName,
} from "../src/lib/audio/sentences";

const hasFile = (url: string) => existsSync(join("public", url));

function load(kind: string, id: string) {
  return JSON.parse(readFileSync(join("content", kind, `${id}.json`), "utf8"));
}

function clipsOf(typingId: string): string[] | null {
  const typing = load("typing", typingId);
  const listening = load("listening", typing.listeningRef);
  return matchSentenceClips(
    listening.id,
    listening.script,
    typing.sentences.map((sentence: { text: string }) => sentence.text),
    hasFile,
    audioUnitsOf(listening.id),
  );
}

const file = (url: string | undefined) => url?.split("/").pop();

describe("報告の リスニング 5場面の タイピング", () => {
  for (const scene of ["kanryou", "okure", "shougai", "chousa", "chourei"]) {
    it(`${scene}: お手本の 全部の 文に 音が 当たる`, () => {
      const typing = load("typing", `houkoku_${scene}_typing`);
      const clips = clipsOf(`houkoku_${scene}_typing`);
      expect(clips).toHaveLength(typing.sentences.length);
      for (const url of clips ?? []) expect(hasFile(url)).toBe(true);
    });
  }

  it("字が 同じ 音を 当てる（原稿の 分かち書きの 空白は 見ない）", () => {
    const clips = clipsOf("houkoku_kanryou_typing");
    expect(file(clips?.[0])).toBe("01.wav"); // 高橋さん、今、お時間 よろしいでしょうか。
    expect(file(clips?.[1])).toBe("03.wav"); // 担当して いた、…報告します。
  });

  it("短い 文と 1つに した 音は、お手本の ぶんだけ 切り出した 音を 鳴らす", () => {
    const kanryou = clipsOf("houkoku_kanryou_typing");
    // 「はい。パソコンと スマートフォンで 確認しました。」の 2文目
    expect(file(kanryou?.[4])).toBe("10_2.wav");
    // 「分かりました。Issueを 確認してから 作業を 始めます。」の 2文目
    expect(file(kanryou?.[8])).toBe("16_2.wav");
    // 朝礼:「はい。まだ 分かって いません。午前中に…報告します。」→ 1〜2文目 と 3文目
    const chourei = clipsOf("houkoku_chourei_typing");
    expect(file(chourei?.[11])).toBe("21_1-2.wav");
    expect(file(chourei?.[12])).toBe("21_3.wav");
  });

  it("どの お手本も、前後に ほかの 文が 付いた 音を 鳴らさない（切り出しが 無ければ 知らせる）", () => {
    for (const scene of ["kanryou", "okure", "shougai", "chousa", "chourei"]) {
      const typing = load("typing", `houkoku_${scene}_typing`);
      const listening = load("listening", typing.listeningRef);
      const units = scriptSentences(listening.script, audioUnitsOf(listening.id)).map(
        (one) => one.text,
      );
      const clips = clipsOf(`houkoku_${scene}_typing`) ?? [];
      typing.sentences.forEach((sentence: { text: string }, i: number) => {
        const part = locateSentence(units, sentence.text);
        const whole = part !== null && part.from === 1 && part.to === part.count;
        expect(
          whole || /_\d+(-\d+)?\.wav$/.test(clips[i] ?? ""),
          `${typing.id} ${i + 1}文目「${sentence.text}」の 音に ほかの 文が 付いて いる。` +
            "リスニングの 音を 作り直したなら node --import tsx scripts/cut_sentence_parts.ts を 回す",
        ).toBe(true);
      });
    }
  });
});

describe("matchSentenceClips", () => {
  const script = [
    { speaker: "a", text: "今の ところ、問題は ありません。" },
    { speaker: "b", text: "はい。分かりました。" },
  ];
  const all = () => true;

  it("文の 途中の 切れはし には 当てない（1文でも 当たらなければ null）", () => {
    expect(matchSentenceClips("x", script, ["問題はありません。"], all)).toBeNull();
    expect(
      matchSentenceClips("x", script, ["今のところ、問題はありません。", "はい。"], all),
    ).toEqual(["/audio/listening/x/01.wav", "/audio/listening/x/02.wav"]);
  });

  it("まとめた 音の 中の 文には、切り出した 音が あれば それ・無ければ まとまりごと（joinShort）", () => {
    expect(matchSentenceClips("x", script, ["分かりました。"], all, { joinShort: true })).toEqual([
      "/audio/listening/x/02_2.wav",
    ]);
    const wholeOnly = (url: string) => !url.includes("_");
    expect(
      matchSentenceClips("x", script, ["分かりました。"], wholeOnly, { joinShort: true }),
    ).toEqual(["/audio/listening/x/02.wav"]);
  });

  it("音が 置いて いない 文には 当てない", () => {
    const only1 = (url: string) => url.endsWith("/01.wav");
    expect(matchSentenceClips("x", script, ["はい。"], only1)).toBeNull();
  });
});

describe("sentencePartFileName", () => {
  it("ひとまとまりの 番号_何文目（範囲は ハイフン）", () => {
    expect(sentencePartFileName({ unit: 9, from: 2, to: 2, count: 2 })).toBe("10_2.wav");
    expect(sentencePartFileName({ unit: 20, from: 1, to: 2, count: 3 })).toBe("21_1-2.wav");
  });
});
