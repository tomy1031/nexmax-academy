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
  Character,
  ContentRefType,
  ImageSlot,
  Manga,
  MangaPage,
  MangaPanel,
  Meeting,
  MeetingQuestion,
  QuizQuestion,
  QuizSet,
  Slides,
  Stage,
  WordStage,
} from "@/content/schema";

/** 画像スロットの初期値（「あとで」の状態）。 */
export function emptyImageSlot(): ImageSlot {
  return { refs: [], status: "empty" };
}

export function emptyStage(): Stage {
  return {
    kind: "stage",
    id: "",
    order: 1,
    title: "",
    reading: "",
    description: "",
    color: "sky",
    status: "draft",
    // 新しいステージは 地図に出す（外すのは「はじめに」のような案内だけ）。
    listed: true,
    contents: [],
    wordStageIds: [],
  };
}

/**
 * ステージの中で作る教材のID。
 *
 * 先生に打たせない。ステージのURLと種別から機械的に決めれば、打ちまちがいで
 * 参照切れになることが無い（2つめ以降は末尾に番号を足す）。
 */
export function nextContentId(
  stageId: string,
  type: ContentRefType,
  taken: ReadonlySet<string>,
): string {
  const base = `${stageId.length > 0 ? stageId : "stage"}-${type}`;
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${taken.size + 1}`;
}

export function emptyCharacter(): Character {
  return {
    kind: "character",
    id: "",
    name: "",
    reading: "",
    role: "",
    looks: "",
    sheet: emptyImageSlot(),
    references: [],
  };
}

export function emptyWordStage(): WordStage {
  return {
    kind: "wordstage",
    id: "",
    title: "",
    description: "",
    // ことばアーケードの景色。既存の単語ステージと同じ並びにしておく
    //（ここだけ違うと、同じゲームなのに課によって見た目が変わる）。
    fieldSequence: ["forest", "sky", "space"],
    questionCount: 6,
    passRate: 70,
    words: [],
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
    castIds: [],
    // 既定はセリフを絵に焼かない。画像に日本語を描かせると漢字が崩れやすく、
    // ふりがなは実例がゼロ（規律2の機械検査も効かなくなる）。
    speechInImage: false,
    pages: [emptyMangaPage()],
  };
}

export function emptyMangaPanel(): MangaPanel {
  // bakedText は「絵に焼いた文字」。空で始め、焼くモードにしたときだけ機械変換で入る
  return { size: "normal", image: emptyImageSlot(), lines: [], bakedText: [] };
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

/**
 * 空のスライド教材。
 *
 * `fileUrl` は空で始める（PDFを上げるまで 保存で止まる＝意図どおり）。
 * `pageCount` は 1 から。上げた PDF を ブラウザが読んで 正しい枚数に置きかえるので、
 * 先生が数えることは無い。
 */
export function emptySlides(): Slides {
  return {
    kind: "slides",
    id: "",
    title: "",
    description: "",
    fileUrl: "",
    pageCount: 1,
    notes: [],
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
    case "extlink":
      return { kind: "extlink", url: "https://", label: "サイトを ひらく" };
    case "characters":
      // ref は空で始める。先生が人物カードを選ぶまで、参照切れの警告が出て気づける。
      return {
        kind: "characters",
        items: [{ ref: "", role: "せんぱい", note: "ここに しょうかいを 書きます。" }],
      };
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

/**
 * ミーティングの相手（Live）に渡す 話し方の ひな型。
 *
 * 空で始めない。persona が空の Live は「ふつうのAI」として長い日本語で話し出し、
 * N5の学習者は1問目で置いていかれる。**おうむ返し＋共感→次の質問**という
 * 進め方が この教材の芯なので、それを最初から入れておく（先生は言い回しを直せばよい）。
 */
const DEFAULT_MEETING_PERSONA = [
  "あなたは 日本の 会社の 先輩です。日本語を 勉強して いる 学生と Zoomで はじめて 話します。",
  "やさしい 日本語で、みじかく 話して ください。1回の 返事は 2文までです。",
  "学生が 答えたら、かならず おうむ返し（聞いた ことを くりかえす）を してから、共感（いいですね／わたしも そうでした）を 言います。",
  "そのあとで つぎの 質問を 1つだけ します。",
  "学生が だまったら、答え方の れいを 1つ 見せて ください。",
  "学生を 否定する 言い方は しません。できた ことを 先に 言って ください。",
].join("");

/**
 * 学習者の日本語を どう見るかの ひな型。
 *
 * 人格と分けてあるのは、**話し方を直しても採点の基準は動かない**ようにするため。
 * 直すところを1つに絞るのは、3つ返すと学習者はどれから直すか決められないからである。
 */
const DEFAULT_MEETING_JUDGE = [
  "学生の 日本語を 見て、つぎの 3つを 短く 返して ください。",
  "1) できた ところを 1つ ほめる。",
  "2) 直すと もっと よく なる ところを 1つだけ 言う（多く 言わない）。",
  "3) その 直した 言い方の れいを 1つ 見せる。",
  "見るのは「ていねいさ（です・ます）」「文の 長さ」「つたわるか」です。",
  "文法の 名前（助詞・活用など）は 使わないで、言い方の れいで 見せて ください。",
].join("");

/** ミーティングの質問1つぶんの空欄。 */
export function emptyMeetingQuestion(): MeetingQuestion {
  return { id: "", ask: "", hint: "", keywords: [], echo: "" };
}

/**
 * 「＋ミーティング」を押した直後の形。
 *
 * 質問は3つから（`meetingSchema` の下限）。下限より少ない枠で始めると、
 * 先生は保存を押すまで「3つ要る」ことを知れない。
 */
export function emptyMeeting(): Meeting {
  return {
    kind: "meeting",
    id: "",
    title: "",
    description: "",
    focus: "",
    persona: DEFAULT_MEETING_PERSONA,
    judgePrompt: DEFAULT_MEETING_JUDGE,
    host: { id: "", name: "", role: "", accent: "sky" },
    questions: [emptyMeetingQuestion(), emptyMeetingQuestion(), emptyMeetingQuestion()],
    closing: "",
    discover: [],
  };
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
  { value: "extlink", label: "外部リンク" },
  { value: "characters", label: "とうじょう人物カード" },
];

export const CONTENT_TYPE_OPTIONS: readonly { value: ContentRefType; label: string }[] = [
  { value: "manga", label: "まんが" },
  { value: "article", label: "ページ" },
  { value: "slides", label: "スライド（PDF）" },
  { value: "listening", label: "リスニング" },
  { value: "quizset", label: "もんだい" },
  { value: "scenario", label: "おきゃくさまと はなす" },
  { value: "meeting", label: "ミーティング（Zoom）" },
  { value: "wordstage", label: "ことばのゲーム" },
];

export const STAGE_COLOR_OPTIONS: readonly { value: Stage["color"]; label: string }[] = [
  { value: "leaf", label: "みどり" },
  { value: "sky", label: "そら" },
  { value: "coral", label: "コーラル" },
  { value: "sky-soft", label: "うすい そら" },
];

/**
 * 地図に出すか（`listed`）。true/false のままだと どちらが どちらか 読めないので、
 * 先生の画面では「どこに 置くか」の選択にする。
 */
export const LISTED_OPTIONS: readonly { value: "map" | "url"; label: string }[] = [
  { value: "map", label: "地図に ならべる" },
  { value: "url", label: "地図に 出さない（URLだけ）" },
];

export const PANEL_SIZE_OPTIONS: readonly { value: MangaPanel["size"]; label: string }[] = [
  { value: "normal", label: "ふつう" },
  { value: "wide", label: "よこ長（決めゴマ）" },
  { value: "tall", label: "たて長" },
];
