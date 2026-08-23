import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSchema, vocabSchema, wordStageSchema } from "../src/content/schema";

/**
 * ことばの 正を 雛形に、部分的に 壊した データを 作る ヘルパ。
 *
 * 語そのものの 決まり（誤答・よみ・ルビHTML・id の 重複）は、語の 置き場を
 * 1か所に した とき（2026-08-20）に **単語ステージから 正（kind: vocab）へ 移った**。
 * 検査も 移す——決まりは 1つも 減らして いない。
 */
function loadVocab(): Record<string, unknown> {
  const raw = readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** サンプルステージを雛形に、部分的に壊したデータを作るヘルパ。 */
function loadSampleStage(): Record<string, unknown> {
  const raw = readFileSync(
    join(__dirname, "..", "content", "wordstages", "stage11_haizoku.json"),
    "utf8",
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("コンテンツスキーマ（検収の契約）", () => {
  it("リポジトリ内のサンプルステージはスキーマに適合する", () => {
    const result = contentSchema.safeParse(loadSampleStage());
    expect(result.success).toBe(true);
  });

  it("questionCount が語数を超えると弾く（出題は語彙の部分集合）", () => {
    const stage = loadSampleStage();
    stage.questionCount = 999;
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("wordIds が重複すると弾く", () => {
    const stage = loadSampleStage();
    const ids = stage.wordIds as string[];
    ids[1] = ids[0]!;
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("ことばが 1つも 無いと 弾く（wordIds も words も 無い）", () => {
    const stage = loadSampleStage();
    delete stage.wordIds;
    expect(wordStageSchema.safeParse(stage).success).toBe(false);
  });

  it("ことばの 正はスキーマに適合する", () => {
    expect(contentSchema.safeParse(loadVocab()).success).toBe(true);
  });

  it("誤答選択肢が正解と同じだと弾く", () => {
    const book = loadVocab();
    const words = book.words as { englishTerm: string; wrongMeanings?: string[] }[];
    const word = words.find((w) => w.wrongMeanings)!;
    word.wrongMeanings = [word.englishTerm, "Foo", "Bar"];
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("語の id が重複すると弾く", () => {
    const book = loadVocab();
    const words = book.words as { id: string }[];
    words[1]!.id = words[0]!.id;
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("同じ 表記の ことばが 2つ あると 弾く（説明が 2つ 育たない）", () => {
    const book = loadVocab();
    const words = book.words as { term: string }[];
    words[1]!.term = words[0]!.term;
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("単語ゲームに 出る 語に 対訳が 無いと 弾く（4択の 正解が 無くなる）", () => {
    const book = loadVocab();
    const words = book.words as { englishTerm?: string; wrongMeanings?: string[] }[];
    delete words.find((w) => w.wrongMeanings)!.englishTerm;
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("表示テキストにルビHTMLを手書きすると弾く（ルビはエンジン合成）", () => {
    const book = loadVocab();
    const words = book.words as { meaningJa: string }[];
    words[0]!.meaningJa = "<ruby>配属<rt>はいぞく</rt></ruby>のことです。";
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("読みにカタカナ・漢字が混ざると弾く（読みはひらがな）", () => {
    const book = loadVocab();
    const words = book.words as { reading: string }[];
    words[0]!.reading = "ハイゾク";
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });

  it("誤答選択肢に日本語が混ざると弾く（誤答は英語のみ）", () => {
    const book = loadVocab();
    const words = book.words as { wrongMeanings?: string[] }[];
    words.find((w) => w.wrongMeanings)!.wrongMeanings = ["給料", "Vacation", "Delivery"];
    expect(vocabSchema.safeParse(book).success).toBe(false);
  });
});

/**
 * ミーティングの **ばん**（2026-08-23 の 指定）
 *
 * ばんを 教材の 中の 概念から **ステージの 中の 並び**へ 出す ための 欄。
 * ここで 見張るのは、ゆるめた ぶんが **答える ばんまで ゆるまない** こと。
 * しつもんの 無い「答える ばん」が 保存できると、学習者は 何も 聞かれない 部屋に 入る。
 */
describe("ミーティングの ばん", () => {
  const listen = {
    kind: "meeting",
    id: "hajimari_kiku",
    mode: "listen",
    title: "ヘンディさんに しつもん",
    description: "きいて みよう。",
    focus: "ヘンディさんに 聞いて みましょう。",
    persona: "あなたは ヘンディです。やさしい 日本語で 話します。",
    host: { id: "hendy", name: "ヘンディ", role: "先輩", accent: "sky" },
    questions: [],
    closing: "ありがとう ございました。",
    discover: [
      {
        id: "kuni",
        label: "ヘンディさんの 国の こと",
        keywords: ["どこから 来"],
        answer: "インドネシアから 来ました。",
      },
    ],
  };

  it("聞く ばんは しつもんも 見かたも 無くて よい", () => {
    const parsed = contentSchema.safeParse(listen);
    expect(parsed.success).toBe(true);
  });

  it("答える ばんは しつもんが 3つ 要る", () => {
    const parsed = contentSchema.safeParse({
      ...listen,
      mode: "ask",
      judgePrompt: "見て ください。",
    });
    expect(parsed.success).toBe(false);
  });

  it("ばんを 書かない 教材（前からの もの）も 答える ばんと 同じ 決まり", () => {
    const { mode: _mode, ...noMode } = listen;
    expect(contentSchema.safeParse(noMode).success).toBe(false);
  });

  it("答える ばんは 見かたの 指示が 要る", () => {
    const asking = {
      ...listen,
      mode: "ask",
      questions: [
        { id: "q1", ask: "お名前は。", hint: "わたしは ◯◯です。", keywords: [], echo: "◯◯さん。" },
        {
          id: "q2",
          ask: "どこから。",
          hint: "◯◯から 来ました。",
          keywords: [],
          echo: "◯◯ですか。",
        },
        {
          id: "q3",
          ask: "なにを。",
          hint: "◯◯を べんきょうします。",
          keywords: [],
          echo: "◯◯ですね。",
        },
      ],
    };
    expect(contentSchema.safeParse(asking).success).toBe(false);
    expect(contentSchema.safeParse({ ...asking, judgePrompt: "見て ください。" }).success).toBe(
      true,
    );
  });
});
