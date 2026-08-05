/**
 * 空の下書きと、エディタで使う選択肢（コンテンツスタジオ）
 *
 * 「＋ステージ」を押した直後の形をここで決める。スキーマ（src/content/schema.ts）が
 * 要求する必須項目は最初から枠だけ用意しておき、先生が空欄を埋めるだけで済むようにする。
 * 中身が空のままでは保存時の検査で止まるが、それは意図どおり（検査が公開可否を決める — 設計07 §2）。
 */

import type {
  Article,
  ArticleBlock,
  ContentRefType,
  ImageSlot,
  Manga,
  MangaPage,
  MangaPanel,
  QuizQuestion,
  QuizSet,
  Stage,
} from "@/content/schema";

/** 画像スロットの初期値（「あとで」の状態）。 */
export function emptyImageSlot(): ImageSlot {
  return { refs: [], status: "empty" };
}

export function emptyStage(): Stage {
  return {
    kind: "stage",
    id: "",
    step: 1,
    title: "",
    reading: "",
    description: "",
    color: "sky",
    status: "draft",
    contents: [],
    wordStageIds: [],
  };
}

export function emptyManga(): Manga {
  return {
    kind: "manga",
    id: "",
    format: "yonkoma",
    title: "",
    description: "",
    characters: [],
    pages: [emptyMangaPage()],
  };
}

export function emptyMangaPanel(): MangaPanel {
  return { size: "normal", image: emptyImageSlot(), lines: [] };
}

export function emptyMangaPage(): MangaPage {
  return { panels: [emptyMangaPanel()] };
}

export function emptyArticle(): Article {
  return {
    kind: "article",
    id: "",
    title: "",
    description: "",
    blocks: [],
  };
}

/** ブロックの種類 → 追加したときの初期値。 */
export function emptyArticleBlock(kind: ArticleBlock["kind"]): ArticleBlock {
  switch (kind) {
    case "heading":
      return { kind: "heading", level: 2, text: "見出し" };
    case "paragraph":
      return { kind: "paragraph", text: "ここに 本文を 書きます。" };
    case "image":
      return { kind: "image", ...emptyImageSlot() };
    case "callout":
      return { kind: "callout", tone: "point", text: "ここが たいせつです。" };
    case "list":
      return { kind: "list", items: ["ひとつめ"] };
    case "steps":
      return { kind: "steps", items: ["さいしょに すること"] };
    case "vocab":
      return { kind: "vocab", items: [{ term: "ことば", reading: "ことば", meaning: "いみ" }] };
    case "link":
      return { kind: "link", ref: "", type: "article", label: "つぎを ひらく" };
  }
}

/**
 * 空の問題セット。
 *
 * phase は research（読んだ・聞いたことの確認）から始める。production は
 * 「自分で日本語を出す」フェーズで、選択式を置けない（AGENTS.md 規律3）ため、
 * 最初から production にすると1問目の追加でいきなり止まってしまう。
 */
export function emptyQuizSet(): QuizSet {
  return {
    kind: "quizset",
    id: "",
    title: "",
    description: "",
    nekumax: "book",
    phase: "research",
    passRate: 70,
    questions: [{ ...emptyQuizQuestion("choose"), id: "q1" }],
  };
}

/**
 * 問題の型 → 追加したときの初期値。
 *
 * 選択肢はスキーマの下限の数だけ枠を出す（choose は2・multi は3・emotion は3）。
 * 足りない状態で生まれると、先生は「なぜ保存できないのか」を保存するまで知れない。
 * IDは空で返す。連番は追加する側（QuizEditor）が、既にある問題を見て決める。
 */
export function emptyQuizQuestion(type: QuizQuestion["type"]): QuizQuestion {
  const base = { id: "", q: "", explain: "", points: 1 };
  switch (type) {
    case "choose":
      return { ...base, type: "choose", options: ["", ""], answer: 0 };
    case "multi":
      return { ...base, type: "multi", options: ["", "", ""], answers: [0, 1] };
    case "keyword":
      return { ...base, type: "keyword", answer: "", accept: [] };
    case "wordbank":
      return { ...base, type: "wordbank", lines: [""], blanks: [""], bank: ["", ""] };
    case "emotion":
      return {
        ...base,
        type: "emotion",
        feelings: ["", "", ""],
        answerFeeling: 0,
        replyQ: "",
        replies: ["", "", ""],
        answerReply: 0,
      };
  }
}

/** エディタの選択肢（先生向けの表示名）。 */
export const ARTICLE_BLOCK_OPTIONS: readonly { value: ArticleBlock["kind"]; label: string }[] = [
  { value: "heading", label: "見出し" },
  { value: "paragraph", label: "本文" },
  { value: "image", label: "画像" },
  { value: "callout", label: "ポイント枠" },
  { value: "list", label: "かじょうがき" },
  { value: "steps", label: "てじゅん" },
  { value: "vocab", label: "ことばチップ" },
  { value: "link", label: "つぎへのリンク" },
];

export const CONTENT_TYPE_OPTIONS: readonly { value: ContentRefType; label: string }[] = [
  { value: "manga", label: "まんが" },
  { value: "article", label: "よみもの" },
  { value: "meeting", label: "ミーティング" },
  { value: "quizset", label: "もんだい" },
  { value: "scenario", label: "おきゃくさまと はなす" },
  { value: "wordstage", label: "ことばのゲーム" },
];

export const STAGE_COLOR_OPTIONS: readonly { value: Stage["color"]; label: string }[] = [
  { value: "leaf", label: "みどり" },
  { value: "sky", label: "そら" },
  { value: "coral", label: "コーラル" },
  { value: "sky-soft", label: "うすい そら" },
];

export const PANEL_SIZE_OPTIONS: readonly { value: MangaPanel["size"]; label: string }[] = [
  { value: "normal", label: "ふつう" },
  { value: "wide", label: "よこ長（決めゴマ）" },
  { value: "tall", label: "たて長" },
];
