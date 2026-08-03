import { describe, expect, it } from "vitest";
import {
  articleSchema,
  contentSchema,
  mangaSchema,
  stageSchema,
  type Content,
} from "../src/content/schema";
import { checkLinkOrder, checkReferenceIntegrity } from "../src/lib/content-checks";

/** 最小の正常フィクスチャ（テストごとに structuredClone して壊す）。 */
const stageFixture = {
  kind: "stage",
  id: "m2-asakai",
  step: 2,
  title: "朝会",
  reading: "あさかい",
  description: "あさの かいぎで きょうの よていを つたえます。",
  color: "leaf",
  contents: [
    { ref: "m2-asakai-manga", type: "manga" },
    { ref: "m2-asakai-article", type: "article" },
  ],
  wordStageIds: ["stage12_asakai"],
} as const;

const mangaFixture = {
  kind: "manga",
  id: "m2-asakai-manga",
  format: "yonkoma",
  title: "あさかいの まんが",
  description: "あさかいの ながれを まんがで よみます。",
  characters: [{ id: "hendy", name: "ヘンディ", role: "先輩" }],
  pages: [
    {
      panels: [
        {
          image: { src: "assets/m2/p1-1.webp", status: "done" },
          lines: [{ speaker: "hendy", text: "おはようございます。" }],
        },
        {
          lines: [{ speaker: "narration", text: "あさかいが はじまります。" }],
          caption: "いつもの あさです。",
        },
      ],
    },
  ],
} as const;

const articleFixture = {
  kind: "article",
  id: "m2-asakai-article",
  title: "あさかいとは",
  description: "あさかいの もくてきを せつめいします。",
  blocks: [
    { kind: "heading", level: 2, text: "あさかいの もくてき" },
    { kind: "paragraph", text: "あさかいでは きょうの よていを みじかく つたえます。" },
    { kind: "callout", tone: "point", text: "むずかしい ことばは つかいません。" },
    { kind: "steps", items: ["きのうの こと", "きょうの こと", "こまって いる こと"] },
    {
      kind: "vocab",
      items: [{ term: "報告", reading: "ほうこく", meaning: "しごとの けっかを つたえること" }],
    },
    { kind: "link", ref: "m2-asakai-manga", type: "manga", label: "まんがを よむ" },
  ],
} as const;

function clone<T>(value: T): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

describe("スタジオ系スキーマ（stage / manga / article）", () => {
  it("最小の stage フィクスチャが通り、既定値が入る", () => {
    const result = contentSchema.safeParse(clone(stageFixture));
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "stage") {
      expect(result.data.status).toBe("published");
    }
  });

  it("wordStageIds 省略時は空配列になる", () => {
    const stage = clone(stageFixture);
    delete stage.wordStageIds;
    const result = stageSchema.safeParse(stage);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.wordStageIds).toEqual([]);
  });

  it("最小の manga フィクスチャが通り、パネルの既定値が入る", () => {
    const result = contentSchema.safeParse(clone(mangaFixture));
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "manga") {
      const panel = result.data.pages[0]!.panels[1]!;
      expect(panel.size).toBe("normal");
      expect(panel.image.status).toBe("empty");
      expect(panel.image.refs).toEqual([]);
    }
  });

  it("manga の vocab は任意で、語・読み・意味がそろっていれば通る", () => {
    const manga = clone(mangaFixture);
    manga.vocab = [{ term: "朝会", reading: "あさかい", meaning: "あさに する みじかい かいぎ" }];
    const result = mangaSchema.safeParse(manga);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vocab?.[0]?.meaning).toBe("あさに する みじかい かいぎ");
    // 省略しても通る（復習セクションを出さないだけ）
    const bare = clone(mangaFixture);
    const bareResult = mangaSchema.safeParse(bare);
    expect(bareResult.success).toBe(true);
    if (bareResult.success) expect(bareResult.data.vocab).toBeUndefined();
  });

  it("manga の vocab は意味なしを弾く（読みだけの語彙リストにしない）", () => {
    const manga = clone(mangaFixture);
    manga.vocab = [{ term: "朝会", reading: "あさかい" }];
    expect(mangaSchema.safeParse(manga).success).toBe(false);
  });

  it("最小の article フィクスチャが通る", () => {
    expect(contentSchema.safeParse(clone(articleFixture)).success).toBe(true);
  });

  it("characters にない話者のセリフは弾く（narration は使える）", () => {
    const manga = clone(mangaFixture);
    const pages = manga.pages as {
      panels: { lines?: { speaker: string; text: string }[] }[];
    }[];
    pages[0]!.panels[0]!.lines = [{ speaker: "unknown", text: "だれの せりふでしょう。" }];
    expect(mangaSchema.safeParse(manga).success).toBe(false);
  });

  it("セリフにルビHTMLを手書きすると弾く（ルビはエンジン合成）", () => {
    const manga = clone(mangaFixture);
    const pages = manga.pages as {
      panels: { lines?: { speaker: string; text: string }[] }[];
    }[];
    pages[0]!.panels[0]!.lines = [
      { speaker: "hendy", text: "<ruby>朝会<rt>あさかい</rt></ruby>です。" },
    ];
    expect(mangaSchema.safeParse(manga).success).toBe(false);
  });

  it("article の本文にルビHTMLを手書きすると弾く", () => {
    const article = clone(articleFixture);
    (article.blocks as { text?: string }[])[1]!.text =
      "<ruby>報告<rt>ほうこく</rt></ruby>を します。";
    expect(articleSchema.safeParse(article).success).toBe(false);
  });

  it("link ブロックの参照先種別が6種以外だと弾く", () => {
    const article = clone(articleFixture);
    (article.blocks as { kind: string; type?: string; ref?: string }[]).push({
      kind: "link",
      type: "stage",
      ref: "m2-asakai",
    });
    expect(articleSchema.safeParse(article).success).toBe(false);
  });
});

describe("参照整合検査（checkReferenceIntegrity）", () => {
  function entriesOf(...raws: unknown[]) {
    return raws.map((raw, i) => ({
      file: `content/fixture-${i}.json`,
      content: contentSchema.parse(raw) as Content,
    }));
  }

  const wordStageRaw = () => {
    // stage12_asakai を名乗る最小の wordstage（参照整合の相手役）
    const word = (id: string, term: string, reading: string, meaningEn: string) => ({
      id,
      term,
      reading,
      meaningEn,
      wrongMeanings: [`${meaningEn} A`, `${meaningEn} B`, `${meaningEn} C`],
      explanationJa: `${term}の せつめいです。`,
      example: `${term}を つかいます。`,
    });
    return {
      kind: "wordstage",
      id: "stage12_asakai",
      title: "あさかいの ことば",
      description: "あさかいで つかう ことばを おぼえます。",
      fieldSequence: ["grass"],
      questionCount: 6,
      passRate: 70,
      words: [
        word("w1", "報告", "ほうこく", "report"),
        word("w2", "予定", "よてい", "plan"),
        word("w3", "会議", "かいぎ", "meeting"),
        word("w4", "共有", "きょうゆう", "sharing"),
        word("w5", "相談", "そうだん", "consultation"),
        word("w6", "連絡", "れんらく", "contact"),
      ],
    };
  };

  it("参照がすべて存在すれば指摘なし", () => {
    const entries = entriesOf(
      clone(stageFixture),
      clone(mangaFixture),
      clone(articleFixture),
      wordStageRaw(),
    );
    expect(checkReferenceIntegrity(entries)).toEqual([]);
  });

  it("stage.contents の参照切れを error で検出する", () => {
    const entries = entriesOf(clone(stageFixture), clone(mangaFixture), wordStageRaw());
    // article が無いので m2-asakai-article への参照が切れる
    const findings = checkReferenceIntegrity(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe("error");
    expect(findings[0]!.message).toContain("m2-asakai-article");
  });

  it("ref は同じ type のコンテンツでなければならない（idだけの一致は参照切れ）", () => {
    const stage = clone(stageFixture);
    stage.contents = [{ ref: "m2-asakai-manga", type: "article" }];
    const entries = entriesOf(stage, clone(mangaFixture), wordStageRaw());
    expect(checkReferenceIntegrity(entries)).toHaveLength(1);
  });

  it("wordStageIds の参照切れを error で検出する", () => {
    const entries = entriesOf(clone(stageFixture), clone(mangaFixture), clone(articleFixture));
    const findings = checkReferenceIntegrity(entries);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("stage12_asakai");
  });
});

describe("導線の一致検査（checkLinkOrder）", () => {
  function entriesOf(...raws: unknown[]) {
    return raws.map((raw, i) => ({
      file: `content/fixture-${i}.json`,
      content: contentSchema.parse(raw) as Content,
    }));
  }

  /** article → manga の順のステージ（article の直後は manga）。 */
  function articleFirstStage() {
    const stage = clone(stageFixture);
    stage.contents = [
      { ref: "m2-asakai-article", type: "article" },
      { ref: "m2-asakai-manga", type: "manga" },
    ];
    return stage;
  }

  it("link がステージの直後の教材と一致すれば指摘なし", () => {
    // articleFixture の link は m2-asakai-manga（＝直後）を指している
    const entries = entriesOf(articleFirstStage(), clone(mangaFixture), clone(articleFixture));
    expect(checkLinkOrder(entries)).toEqual([]);
  });

  it("直後の教材を飛ばす link を error で検出する", () => {
    const article = clone(articleFixture);
    (article.blocks as { kind: string; ref?: string; type?: string; label?: string }[])[5] = {
      kind: "link",
      ref: "sample_horenso",
      type: "quizset",
      label: "もんだいで たしかめる",
    };
    const findings = checkLinkOrder(entriesOf(articleFirstStage(), clone(mangaFixture), article));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.level).toBe("error");
    expect(findings[0]!.message).toContain("sample_horenso");
  });

  it("使い回しに厳しくしない — いずれかのステージの直後と一致すれば通る", () => {
    const otherStage = clone(stageFixture);
    otherStage.id = "m9-another";
    otherStage.step = 9;
    // こちらのステージでは article の直後が別の教材
    otherStage.contents = [
      { ref: "m2-asakai-article", type: "article" },
      { ref: "sample_horenso", type: "quizset" },
    ];
    const entries = entriesOf(
      articleFirstStage(),
      otherStage,
      clone(mangaFixture),
      clone(articleFixture),
    );
    expect(checkLinkOrder(entries)).toEqual([]);
  });

  it("どのステージからも参照されていない article は検査しない", () => {
    const entries = entriesOf(clone(mangaFixture), clone(articleFixture));
    expect(checkLinkOrder(entries)).toEqual([]);
  });
});
