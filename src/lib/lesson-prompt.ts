/**
 * もんだい と ページ を AIに作らせるときの頼み文と形
 *
 * まんが（`manga-prompt.ts`）と同じ流儀にそろえてある:
 *   - 頼み文は純関数。Codex にも Gemini にも同じものを渡す
 *   - 形（JSON Schema）は1つだけ持ち、`outputSchema` と `responseSchema` に共用する
 *   - 学習者に見える文の決まりは、頼み文に**毎回**書く（守られなかったぶんは検査が落とす）
 *
 * ## 産出フェーズに選択式を出さない（規律3）
 * `quizSetSchema` の superRefine が保存時に落とすが、**落とす前に作らせない**。
 * 落ちてから作り直させると、先生は理由が分からないまま2回待つことになる。
 * だから `phase` に応じて、頼み文から選択式そのものを消す。
 */

import type { Content } from "@/content/schema";

/** 学習者に見える文の決まり。もんだいも ページも同じ。 */
const LEARNER_RULES = [
  "- 1文は 30字いない。長い文は 分ける",
  "- 学習者を 否定する 言い方を しない。うまくいかないときも、次に する ことを 1つ 見せる",
  "- **読み辞書（furigana）に、学習者が読む文の 漢字を 1つ残らず 入れる**",
  "- ルビを HTML で書かない（読み辞書だけに 入れる）",
  "- 日本・カンボジア いがいの 国名を 出さない",
].join("\n");

/** 読み辞書の形（どの教材でも同じ）。 */
const FURIGANA_SCHEMA = {
  type: "array",
  description: "読み辞書。[表記, よみ] の組。漢字を1つも残さない",
  items: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 2 },
} as const;

/* ------------------------------------------------------------------ */
/* もんだい（quizset）                                                  */
/* ------------------------------------------------------------------ */

/**
 * もんだいの形。
 *
 * **産出フェーズでは選択式（choose / multi / emotion）を外す。**
 * 読解確認は「分かったか」を見る場面なので選ばせてよいが、
 * 産出は「言えるか」を見る場面なので、選択肢から選ばせると練習にならない（規律3）。
 */
export function quizSchemaFor(phase: "research" | "production") {
  const types =
    phase === "production"
      ? ["keyword", "wordbank"]
      : ["choose", "multi", "keyword", "wordbank", "emotion"];

  return {
    type: "object",
    properties: {
      title: { type: "string", description: "もんだいの見出し（15文字いない）" },
      description: { type: "string", description: "1文の説明" },
      furigana: FURIGANA_SCHEMA,
      questions: {
        type: "array",
        /*
         * 名前は `src/content/schema.ts` の quizQuestionSchema に合わせてある
         *（q / explain / options / answer …）。ここでずらすと、
         * AIの返事を教材へ写すときに全部詰め替えることになり、詰め替えを間違える。
         */
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: types },
            q: { type: "string", description: "設問の文" },
            explain: {
              type: "string",
              description: "正しくても まちがえても 読ませる解説。しごとの場面に つなげる",
            },
            options: {
              type: "array",
              description: "choose は4つ、multi は4〜6つ。えらぶ もんだいのときだけ",
              items: { type: "string" },
            },
            answer: {
              type: "string",
              description:
                "choose のときは options の番号（0から）を文字で。keyword のときは 答えの文",
            },
            answers: {
              type: "array",
              description: "multi のとき、正しい options の番号（0から）",
              items: { type: "number" },
            },
            accept: {
              type: "array",
              description: "keyword のとき、意味として同じ別解だけ（表記ゆれは書かない）",
              items: { type: "string" },
            },
            lines: {
              type: "array",
              description: "wordbank のとき、1行ずつの文。空欄は ___ で書く",
              items: { type: "string" },
            },
            blanks: {
              type: "array",
              description: "wordbank のとき、空欄の正解（出てくる順）",
              items: { type: "string" },
            },
            bank: {
              type: "array",
              description: "wordbank のとき、画面に並べる語（正解＋まぎらわしい語）",
              items: { type: "string" },
            },
          },
          required: ["type", "q", "explain"],
        },
      },
    },
    required: ["title", "description", "furigana", "questions"],
  } as const;
}

export function buildQuizPrompt(brief: {
  readonly request: string;
  readonly count: number;
  readonly phase: "research" | "production";
  readonly context: string;
}): string {
  const phaseNote =
    brief.phase === "production"
      ? [
          "## これは **産出**（じぶんで 言う・書く）の もんだいです",
          "**選択式を 作らないでください。** 自由入力（keyword）と 語ならべ（wordbank）だけ 使います。",
          "選ばせると「言えるか」が わからないためです。",
        ].join("\n")
      : [
          "## これは **読解確認**（分かったか たしかめる）の もんだいです",
          "4択（choose）・複数選択（multi）・自由入力（keyword）・語ならべ（wordbank）・",
          "気もち2段階（emotion）から えらんで 作ってください。",
        ].join("\n");

  return [
    "あなたは、カンボジアのIT専攻学生（日本語 N5〜N3）向けの教材を作る先生です。",
    `つぎの ねらいで、もんだいを ${brief.count}問 作ってください。`,
    "",
    "## 先生の依頼",
    brief.request,
    "",
    phaseNote,
    brief.context ? `\n${brief.context}` : "",
    "",
    "## 守ること",
    LEARNER_RULES,
    "- ヒントは 答えそのものを 言わない（言い方の 型まで）",
    "- 4択の まちがいの 選択肢は、**まよう理由が あるもの**にする（明らかに変なものを 並べない）",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* ページ（article）                                                  */
/* ------------------------------------------------------------------ */

/**
 * ページの形。
 *
 * **`link` ブロックは作らせない。** 「つぎは これ」の行き先はステージの学習順で
 * 決まるもので、AIには知りようがない。作らせると導線一致の検査（`checkLinkOrder`）が
 * 必ず落ちる。先生があとで足す。
 */
export const ARTICLE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "ページの見出し（15文字いない）" },
    description: { type: "string", description: "1文の説明" },
    furigana: FURIGANA_SCHEMA,
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["heading", "paragraph", "callout", "list", "steps", "vocab"],
          },
          level: { type: "number", description: "heading のとき 2 か 3" },
          text: { type: "string", description: "heading / paragraph / callout の本文" },
          tone: { type: "string", enum: ["point", "care"], description: "callout のとき" },
          items: {
            type: "array",
            description: "list / steps のとき。vocab のときは 語のリスト",
            items: { type: "string" },
          },
          vocab: {
            type: "array",
            description: "vocab のとき、語・よみ・やさしい意味",
            items: {
              type: "object",
              properties: {
                term: { type: "string" },
                reading: { type: "string" },
                meaning: { type: "string" },
              },
              required: ["term", "reading", "meaning"],
            },
          },
        },
        required: ["kind"],
      },
    },
  },
  required: ["title", "description", "furigana", "blocks"],
} as const;

export function buildArticlePrompt(brief: {
  readonly request: string;
  readonly sections: number;
  readonly context: string;
}): string {
  return [
    "あなたは、カンボジアのIT専攻学生（日本語 N5〜N3）向けの教材を作る先生です。",
    `つぎの ねらいで、ページを ${brief.sections}つの 見出しで 作ってください。`,
    "",
    "## 先生の依頼",
    brief.request,
    brief.context ? `\n${brief.context}` : "",
    "",
    "## 組み立て方",
    "- 見出し（heading・level 2）で 区切る",
    "- 見出しごとに、みじかい だんらく（paragraph）を 1〜2つ",
    "- 手じゅんは steps、ならびは list、大事なことは callout（tone: point）",
    "- 気をつけることは callout（tone: care）",
    "- あたらしい ことばは vocab に まとめる（語・よみ・やさしい意味）",
    "- **「つぎは これ」のような 行き先は 作らないでください**（先生が あとで 足します）",
    "",
    "## 守ること",
    LEARNER_RULES,
    "- しごとの ことばを かんたんな ことばに 置きかえない（「要件定義」を「決めること」に しない）。",
    "  ほんものの ことばを 見せて、意味を そえる",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* 共通: 過去の教材を ふまえる                                          */
/* ------------------------------------------------------------------ */

/** 渡す文脈の上限（`manga-story.ts` と同じ理由・同じ値）。 */
export const MAX_CONTEXT_CHARS = 1200;

/**
 * すでに習った ことば を集めて渡す。
 *
 * まんがと違って「前の話のおわり」は使わない——もんだいと ページは
 * 話の続きではないので、**語の重なり**だけが効く。
 */
export function buildLessonContext(contents: readonly Content[]): string {
  const terms = contents.flatMap((content) =>
    // 参照で 持つ ステージの 語は、読み出しの ときに 埋まる（ここは 生の Content）
    content.kind === "wordstage" ? (content.words ?? []).map((w) => w.term) : [],
  );
  if (terms.length === 0) return "";

  const line = [...new Set(terms)].join("・");
  const body = `## すでに 習った ことば（これを 使うと 復習になる。新しい語は 1〜3語まで）\n${line}`;
  return body.length <= MAX_CONTEXT_CHARS
    ? body
    : `${body.slice(0, MAX_CONTEXT_CHARS)}\n…（ここまで）`;
}
