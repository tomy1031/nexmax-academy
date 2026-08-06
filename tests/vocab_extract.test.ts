import { describe, expect, it } from "vitest";
import { buildVocabPrompt, MAX_PROMPT_CHARS, parseVocabCandidates } from "../src/lib/vocab/extract";

/**
 * ステージ本文からの ことば抜き出し。
 *
 * ここで守っているのは「AIの返事のどれを先生に見せるか」の線引き。
 * 線が甘いと、先生は選んだあとの「単語ステージをつくる」で初めてスキーマに落とされ、
 * 落ちた理由が見えないまま選び直しをくり返す。学習者の側から見ると、
 * 読みがカタカナの語カードや、日本語まじりの英語選択肢が画面に出ることになる。
 */

/** スキーマを通る1語。テストごとに1か所だけ壊して使う。 */
function goodWord(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    term: "納期",
    reading: "のうき",
    romaji: "nouki",
    meaningEn: "Deadline",
    wrongMeanings: ["Budget", "Meeting", "Contract"],
    explanationJa: "しごとを おわらせる 日の ことです。",
    example: "納期は 来月の 20日です。",
    ...over,
  };
}

function respond(words: unknown[]): string {
  return JSON.stringify({ words });
}

describe("ことばの抜き出し（AIの返事を どこまで信じるか）", () => {
  it("wordSchema を通る候補だけが残る", () => {
    const words = parseVocabCandidates(
      respond([
        goodWord(),
        // 読みがカタカナ。語カードの読みが読めなくなるので出さない
        goodWord({ term: "障害", reading: "ショウガイ" }),
        // 例文が空。文脈が無い語カードは覚える手がかりにならない
        goodWord({ term: "要件", reading: "ようけん", example: "" }),
        goodWord({ term: "報告", reading: "ほうこく", meaningEn: "Report" }),
      ]),
    );

    expect(words.map((word) => word.term)).toEqual(["納期", "報告"]);
  });

  it("英語のはずの欄に日本語が混ざった候補は落とす（DATA DIVEの選択肢は英語だけ）", () => {
    const words = parseVocabCandidates(
      respond([
        goodWord({ term: "残業", reading: "ざんぎょう", meaningEn: "残業 / Overtime" }),
        goodWord({ term: "会議", reading: "かいぎ", wrongMeanings: ["予算", "Report", "Design"] }),
      ]),
    );

    expect(words).toHaveLength(0);
  });

  it("wrongMeanings が3つでない候補は落とす（選ぶ問題として成り立たない）", () => {
    const words = parseVocabCandidates(
      respond([
        goodWord({ wrongMeanings: ["Budget", "Meeting"] }),
        goodWord({ term: "仕様", reading: "しよう", wrongMeanings: ["A", "B", "C", "D"] }),
        goodWord({ term: "工程", reading: "こうてい", wrongMeanings: "Budget" }),
      ]),
    );

    expect(words).toHaveLength(0);
  });

  it("正解と誤答が重複する候補は落とす（どれを選んでも当たりになる）", () => {
    const words = parseVocabCandidates(
      respond([
        // 正解と同じ意味が誤答に入っている
        goodWord({ wrongMeanings: ["deadline", "Meeting", "Contract"] }),
        // 誤答どうしが同じ
        goodWord({ term: "見積", reading: "みつもり", wrongMeanings: ["Cost", "cost", "Design"] }),
      ]),
    );

    expect(words).toHaveLength(0);
  });

  it("返事が壊れたJSONでも落ちない（空で返す）", () => {
    // 抜き出しが例外で止まると、先生は手で単語を選ぶ道まで閉ざされる
    expect(parseVocabCandidates("すみません、うまく作れませんでした")).toEqual([]);
    expect(parseVocabCandidates('{"words": [')).toEqual([]);
    expect(parseVocabCandidates("")).toEqual([]);
    expect(parseVocabCandidates(JSON.stringify({ words: "納期" }))).toEqual([]);
    expect(parseVocabCandidates(JSON.stringify({ words: [null, 3, "納期"] }))).toEqual([]);
  });

  it("```json で囲まれた返事も、配列だけの返事も読める", () => {
    const fenced = parseVocabCandidates("```json\n" + respond([goodWord()]) + "\n```");
    expect(fenced.map((word) => word.term)).toEqual(["納期"]);

    const bare = parseVocabCandidates(JSON.stringify([goodWord()]));
    expect(bare.map((word) => word.term)).toEqual(["納期"]);
  });

  it("同じ語が2回出てきたら1つにする（同じ問題が2回出ると手抜きに見える）", () => {
    const words = parseVocabCandidates(
      respond([goodWord(), goodWord({ meaningEn: "Due date", romaji: "nouki2" })]),
    );

    expect(words).toHaveLength(1);
  });

  it("IDはサーバで振り、重ならないようにする（重複すると単語ステージが保存できない）", () => {
    const words = parseVocabCandidates(
      respond([
        goodWord({ romaji: "nouki" }),
        goodWord({ term: "報告", reading: "ほうこく", romaji: "nouki" }),
        goodWord({ term: "相談", reading: "そうだん", romaji: undefined }),
      ]),
    );

    const ids = words.map((word) => word.id);
    expect(ids[0]).toBe("nouki");
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });
});

describe("抜き出しの たのみ方（プロンプト）", () => {
  it("教材の本文をそのまま渡す", () => {
    const prompt = buildVocabPrompt(["朝会で 報告します。", "納期は 来月です。"]);

    expect(prompt).toContain("朝会で 報告します。");
    expect(prompt).toContain("納期は 来月です。");
  });

  it("英語だけ・ひらがなの読み・やさしい日本語の解説を必ず頼む（頼み忘れると全部落ちる）", () => {
    const prompt = buildVocabPrompt(["納期は 来月です。"]);

    // スキーマ側の制約と食い違うと、候補が1つも残らず「見つかりません」になる
    expect(prompt).toContain("英語だけで書く");
    expect(prompt).toContain("ひらがな");
    expect(prompt).toContain("ちょうど3つ");
  });

  it("本文が長すぎるときは切って渡す（Workerの実行時間とモデルの入力上限を超えないため）", () => {
    const long = "納期は 来月です。".repeat(2000);
    const prompt = buildVocabPrompt([long, "この行は 入りきらない。"]);

    expect(prompt).not.toContain("この行は 入りきらない。");
    expect(prompt.length).toBeLessThan(MAX_PROMPT_CHARS + 2000);
  });
});
