/**
 * 読みの照合（yomi_check.ts）の回帰テスト。
 *
 * 事例はぜんぶ実際に学習者へ届いた誤読（2026-08-30 監査 / 09-01 全量照合）。
 * 「画面と同じルビ合成 × 形態素解析」の突き合わせが、これらの型を
 * これからも捕まえ続けることを固定する。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { join } from "node:path";
import kuromoji, { type Tokenizer } from "kuromoji";
import { buildFuriganaIndex, type FuriganaEntry } from "../src/lib/text/furigana";
import { checkStageListReadings, compareReadings } from "../scripts/lib/yomi_check";

let tokenizer: Tokenizer;

beforeAll(
  () =>
    new Promise<void>((resolve, reject) => {
      kuromoji
        .builder({ dicPath: join(__dirname, "..", "node_modules", "kuromoji", "dict") })
        .build((err, built) => {
          if (err) reject(err);
          else {
            tokenizer = built;
            resolve();
          }
        });
    }),
);

function run(text: string, entries: FuriganaEntry[]) {
  return compareReadings(
    "test.json",
    { field: "text", text },
    buildFuriganaIndex(entries),
    tokenizer,
  );
}

describe("compareReadings", () => {
  it("送りがな落ちを捕まえる（考え→かんが は「かんがます」と読める）", () => {
    const findings = run("考えます", [["考え", "かんが"]]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("かんが");
  });

  it("単漢字の暴発を捕まえる（会(かい)いに → かいいに）", () => {
    const findings = run("会いに 行きます", [
      ["会", "かい"],
      ["行", "い"],
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("会い");
  });

  it("文脈ちがいの読みを捕まえる（テストの 日 は「ひ」）", () => {
    const findings = run("テストの 日に", [["日", "にち"]]);
    expect(findings).toHaveLength(1);
  });

  it("正しい読みは通る（送りがな・活用・記号・数字まじり）", () => {
    expect(run("考えます", [["考え", "かんがえ"]])).toEqual([]);
    expect(
      run("会いに 行きます", [
        ["会い", "あい"],
        ["行", "い"],
      ]),
    ).toEqual([]);
    expect(
      run("使い分ける ことが 大切です", [
        ["使い分け", "つかいわけ"],
        ["大切", "たいせつ"],
      ]),
    ).toEqual([]);
    // 記号・カタカナ語は表層をそのまま使う（解析の「＋→たす」に引きずられない）
    expect(run("調べた こと ＋ あなたの アイデア", [["調べ", "しらべ"]])).toEqual([]);
    // 数字は読みを持たないが、照合を壊さない
    expect(
      run("2026年に 3つ 出します", [
        ["年", "ねん"],
        ["出し", "だし"],
      ]),
    ).toEqual([]);
  });

  it("確かめ済み一覧（yomi_allow）に載った読みは通る（日本＝にほん）", () => {
    // 解析は「にっぽん」と読むが、教材は「にほん」でそろえる——台帳が根拠
    expect(
      run("日本の 会社", [
        ["日本", "にほん"],
        ["会社", "かいしゃ"],
      ]),
    ).toEqual([]);
  });

  it("覆えていない漢字は覆い検査の担当なので、ここでは黙る（二重に言わない）", () => {
    expect(run("考えます", [])).toEqual([]);
  });
});

describe("checkStageListReadings（ステージ一覧の混ぜた索引）", () => {
  // ステージのトップは並んだ教材の furigana を後勝ちで混ぜて題・説明を描くため、
  // ファイル単位では正しい読みでも、一覧では別ファイルの同表記に上書きされうる
  //（2026-09-01 code-critic 検収の重大指摘。「連絡が なかった 日(ひ)」が にち になった実例）。
  const stageEntries = (lectureNichi: boolean) =>
    [
      {
        file: "stages/test.json",
        content: {
          kind: "stage",
          id: "test",
          contents: [
            { ref: "m1", type: "manga" },
            { ref: "a1", type: "article" },
          ],
        },
      },
      {
        file: "manga/m1.json",
        content: {
          kind: "manga",
          id: "m1",
          title: "連絡が なかった 日",
          furigana: [
            ["連絡", "れんらく"],
            ["日", "ひ"],
          ],
        },
      },
      {
        file: "articles/a1.json",
        content: {
          kind: "article",
          id: "a1",
          title: "報告の 練習",
          furigana: [
            ["報告", "ほうこく"],
            ["練習", "れんしゅう"],
            ...(lectureNichi ? [["日", "にち"] as const] : []),
          ],
        },
      },
    ] as never;

  it("あとの教材の同表記が題の読みを上書きしたら赤（ひ → にち）", () => {
    const findings = checkStageListReadings(stageEntries(true), tokenizer);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("m1.title");
    expect(findings[0]!.message).toContain("にち");
  });

  it("ステージ内で読みがそろっていれば緑", () => {
    expect(checkStageListReadings(stageEntries(false), tokenizer)).toEqual([]);
  });
});
