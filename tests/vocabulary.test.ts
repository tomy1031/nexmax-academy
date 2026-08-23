import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { vocabSchema, wordStageSchema, type VocabBook } from "../src/content/schema";
import { checkFuriganaCoverageOf } from "../src/lib/content-checks";
import {
  gameWordsOf,
  hydrateArticle,
  hydrateManga,
  isPlayable,
  hydrateWordStage,
  toGameWord,
  vocabByTerm,
} from "../src/lib/vocabulary";

const book: VocabBook = vocabSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "..", "content", "vocab", "vocabulary.json"), "utf8")),
);

function wordStage(id: string) {
  return wordStageSchema.parse(
    JSON.parse(readFileSync(join(__dirname, "..", "content", "wordstages", `${id}.json`), "utf8")),
  );
}

describe("ことばの 正", () => {
  it("同じ 表記の ことばが 2つ 無い（説明が 2つ 育たない）", () => {
    expect(vocabByTerm(book.words).size).toBe(book.words.length);
  });

  it("散らばって いた 5か所の ことばが ぜんぶ 入って いる", () => {
    const terms = vocabByTerm(book.words);
    expect(terms.has("要件定義")).toBe(true); // 単語ステージ
    expect(terms.has("アプリ")).toBe(true); // 語彙メモ（glossary.ts）
    expect(terms.has("ほうれんそう")).toBe(true); // はじめに の ことば
  });

  it("単語ステージが 参照する 語は ぜんぶ 正に ある（参照切れが 無い）", () => {
    const ids = new Set(book.words.map((w) => w.id));
    for (const id of ["intro_kotoba", "hajimari_kotoba", "stage23_kaisha"]) {
      for (const wordId of wordStage(id).wordIds ?? []) expect(ids).toContain(wordId);
    }
  });

  it("参照した 語は そのまま 遊べる かたちに 戻る", () => {
    const first = wordStage("intro_kotoba").wordIds![0]!;
    const moved = book.words.find((w) => w.id === first)!;
    expect(isPlayable(moved)).toBe(true);
    expect(toGameWord(moved)).toEqual({
      id: moved.id,
      term: moved.term,
      reading: moved.reading,
      romaji: moved.romaji,
      meaningEn: moved.englishTerm,
      wrongMeanings: moved.wrongMeanings,
      explanationJa: moved.meaningJa,
      example: moved.example,
    });
  });

  it("遊べない 語（対訳や 誤答が 無い）は ゲームに 出さない", () => {
    const notPlayable = book.words.find((w) => !isPlayable(w))!;
    expect(toGameWord(notPlayable)).toBeNull();
    const picked = gameWordsOf([notPlayable.id, "nai-id"], book.words);
    expect(picked.words).toEqual([]);
    expect(picked.notPlayable).toEqual([notPlayable.id]);
    expect(picked.missing).toEqual(["nai-id"]);
  });

  it("id の 順番どおりに 取り出せる", () => {
    const ids = book.words
      .filter(isPlayable)
      .slice(0, 3)
      .map((w) => w.id);
    expect(gameWordsOf(ids, book.words).words.map((w) => w.id)).toEqual(ids);
  });
});

describe("記事・まんがの ことばも 正から 引く", () => {
  it("記事の ことばブロックは 参照から 中身が 埋まる", () => {
    const article = {
      blocks: [
        { kind: "paragraph", text: "そのまま" },
        { kind: "vocab", wordIds: [book.words[0]!.id, "nai-id"] },
      ],
    };
    const hydrated = hydrateArticle(article, book.words);
    expect(hydrated.blocks[0]).toBe(article.blocks[0]); // 触らない
    const items = (hydrated.blocks[1] as unknown as { items: { term: string }[] }).items;
    expect(items).toHaveLength(1); // 参照切れは 落とす（画面を 白く しない）
    expect(items[0]!.term).toBe(book.words[0]!.term);
  });

  it("まんがの 復習語彙も 参照から 埋まる", () => {
    const manga = { vocabIds: [book.words[1]!.id], vocab: undefined as unknown };
    const hydrated = hydrateManga(manga, book.words) as unknown as { vocab: { term: string }[] };
    expect(hydrated.vocab[0]!.term).toBe(book.words[1]!.term);
  });

  it("参照を 持たない 古い かたちは そのまま 通す", () => {
    const manga = { vocab: [{ term: "むかしの", reading: "むかしの", meaning: "…" }] };
    expect(hydrateManga(manga, book.words)).toBe(manga);
  });
});

describe("スタジオが 作る かたち", () => {
  it("抜き出した ことばは 正の かたちに 直せて、そのまま 遊べる", () => {
    /*
     * vocab-extractor が 作る 語（VocabCandidate 相当）。
     *
     * 見出しは **正に 無い 語**を つかう。この 検査は 下で 正の 本に 1語 足して
     * スキーマに 通すので、正に すでに ある 語を えらぶと「表記が 重なって いる」で
     * 落ちる——調べて いるのは 形の 変換なのに、語彙が 増えた 日に 落ちる ことに なる
     *（2026-08-24 に 「納期」が 正へ 入って 実発生）。
     */
    const candidate = {
      id: "tmp",
      term: "試作品",
      reading: "しさくひん",
      romaji: "shisakuhin",
      meaningEn: "Prototype",
      wrongMeanings: ["Salary", "Meeting", "Holiday"],
      explanationJa: "ためしに 作って みた ものです。",
      example: "試作品を 先に 見せます。",
    };
    const moved = {
      id: candidate.romaji,
      term: candidate.term,
      reading: candidate.reading,
      romaji: candidate.romaji,
      meaningJa: candidate.explanationJa,
      englishTerm: candidate.meaningEn,
      example: candidate.example,
      wrongMeanings: candidate.wrongMeanings,
    };
    // 正の スキーマを 通る
    expect(vocabSchema.safeParse({ ...book, words: [...book.words, moved] }).success).toBe(true);
    // そのまま ゲームに 出せる
    expect(isPlayable(moved)).toBe(true);
    expect(toGameWord(moved)!.meaningEn).toBe("Prototype");
  });

  it("参照だけの 単語ステージが スキーマを 通る（スタジオの 保存形）", () => {
    const stored = {
      kind: "wordstage",
      id: "atarashii-words",
      title: "あたらしい ステージ",
      description: "この ステージに 出てくる しごとの ことばと ITの ことばです。",
      fieldSequence: ["forest", "sky", "space"],
      questionCount: 6,
      passRate: 70,
      wordIds: book.words
        .filter(isPlayable)
        .slice(0, 6)
        .map((w) => w.id),
    };
    const parsed = wordStageSchema.safeParse(stored);
    expect(parsed.success).toBe(true);
    // 読み出せば 語が 入る
    expect(hydrateWordStage(parsed.data!, book.words, book.furigana)!.words).toHaveLength(6);
  });
});

describe("読みを 足せる（語ごとの よみ辞書）", () => {
  it("語ごとの よみ辞書で 説明文の 漢字を 覆える", () => {
    const word = {
      id: "nouki",
      term: "納期",
      reading: "のうき",
      meaningJa: "いつまでに 出すか、の 日です。",
      englishTerm: "Deadline",
      furigana: [
        ["出", "だ"],
        ["日", "ひ"],
      ] as [string, string][],
    };
    const draft = { ...book, words: [word] };
    expect(vocabSchema.safeParse(draft).success).toBe(true);
    // 検査（lint と 同じ 関数）が 通る
    expect(checkFuriganaCoverageOf("v.json", vocabSchema.parse(draft), "error")).toEqual([]);
  });

  it("よみが 足りないと 検査が 止める（足す 場所が あることの 裏返し）", () => {
    const word = {
      id: "nouki",
      term: "納期",
      reading: "のうき",
      meaningJa: "いつまでに 出すか、の 日です。",
      englishTerm: "Deadline",
    };
    const draft = vocabSchema.parse({ ...book, words: [word], furigana: [] });
    const found = checkFuriganaCoverageOf("v.json", draft, "error");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.message).toContain("出");
  });

  it("借りた ことばは 借り手で 検査しない（まんが・記事）", () => {
    const borrowed = {
      kind: "manga" as const,
      id: "m",
      title: "テスト",
      description: "テスト",
      pages: [],
      vocabIds: [book.words[0]!.id],
      // 読み出しで 埋まった ぶん（正の 文なので 借り手の 読み辞書には 無い）
      vocab: [{ term: book.words[0]!.term, reading: book.words[0]!.reading, meaning: "紙に 書く" }],
    };
    expect(checkFuriganaCoverageOf("m.json", borrowed as never, "error")).toEqual([]);
  });
});
