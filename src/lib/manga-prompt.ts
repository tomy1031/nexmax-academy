/**
 * まんがの絵をつくるときのプロンプト
 *
 * 調査（2026-08-06）で分かった、外せない決まりをここに集める。
 * 画面ごとに書き分けると、1か所だけ古い書き方が残って画風が割れる。
 *
 * ## 1. 絵の中に日本語を描かせない（最重要）
 * 画像生成に日本語を描かせると漢字が崩れやすく、**ふりがな（ルビ）は実例が
 * 1件も見つからない**。拡散モデルは文字を言語ではなくピクセル模様として学習する
 * ため、通常サイズの漢字ですら不安定で、ルビは
 *   (a) 本文より小さい (b) 親文字との対応位置が厳密 (c) 画数の多い漢字の真上
 * という三重苦になる。国内の実務記事はそろって「文字なしで生成 → 後から重ねる」を
 * 定石として挙げている。
 * この方針は AGENTS.md 規律2（ルビHTMLを手書きしない・表示時に合成する）とも合い、
 * `lint:content` のふりがな全覆い検査もそのまま効く。
 * → 吹き出しは**空**で描かせ、セリフはアプリが重ねる。
 *
 * ## 2. キャラクターは設定画（シート）を参照画像として毎回渡す
 * プロンプトで毎回容姿を書くより確実。Google の consistent-imagery codelab も
 * 国内の実装記事も同じ結論。だからシートを先に1枚作る。
 *
 * ## 3. コマは1枚ずつ描かせる
 * 4コマを1枚で出すとコマ順とレイアウトが制御できず、読み順が崩れる報告が多い。
 * 枠とセリフはアプリ側（HTML）が持ち、AIには1コマ＝1枚の絵だけ描かせる。
 *
 * ## 4. 技術語は英語、描く中身は具体的に
 * 構図・光・画風のテクニカルワードは英語のほうが安定する。あいまいな語は
 * コマ間で解釈がドリフトするので、色や形は具体的に書く。
 *
 * 純関数だけ。テストから直接読める（tests/manga_prompt.test.ts）。
 */

import type { Character } from "@/content/schema";

/** まんがの画風（設計04「あおぞらパスウェイ」）。全部の絵で同じ文字列を使う。 */
const STYLE = [
  "clean modern Japanese manga / anime style, soft cel shading",
  "bright friendly palette, rounded shapes, no harsh shadows",
  "office and school settings, contemporary Japan",
].join(", ");

/**
 * 絵に入れてはいけないもの。
 * `no text` を必ず先頭に置く——ここが抜けると、モデルは吹き出しに
 * それらしい崩れた日本語を描き込んでしまう。
 */
const NO_TEXT = [
  "no text, no letters, no kanji, no kana, no numbers anywhere in the image",
  "speech balloons must be completely EMPTY (white inside, no writing)",
  "no watermark, no signature, no logo, no frame border",
].join(", ");

/** コマ間で崩れやすいものを、はじめから除外しておく。 */
const NEGATIVE = [
  "no six fingers, no extra limbs",
  "no costume changes between panels",
  "no duplicate faces of the same character in one panel",
].join(", ");

/**
 * キャラクターシート（設定画）。
 *
 * 三面図＋表情差分・白背景・枠線と文字なし、が確立した型。
 * グリッド線を入れると、正面と横顔で目の高さがそろいやすくなる。
 */
export function buildCharacterSheetPrompt(character: {
  name: string;
  role: string;
  looks: string;
  personality?: string;
}): string {
  return [
    "A character model sheet for a Japanese language-learning manga.",
    "",
    "Layout: front view (full body, T-pose) on the left, right side view and back view next to it,",
    "and a column of 6 bust-up facial expressions on the right",
    "(neutral, smiling, worried, surprised, thinking, apologetic).",
    "White background. Light grid lines overlay to keep eye level consistent across views.",
    "",
    `Character: ${character.role} — ${character.looks}`,
    character.personality
      ? `Personality (affects posture and expression): ${character.personality}`
      : "",
    "",
    `Style: ${STYLE}.`,
    `Avoid: ${NO_TEXT}, ${NEGATIVE}.`,
    "",
    // 名前を絵に書かせない。書かれると差し替えができなくなる
    "Do NOT write the character's name or any label on the sheet.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * セリフを**絵の中に焼く**コマの指示。
 *
 * 通常の `buildPanelPrompt` と分けてあるのは、禁止事項が正反対になるから。
 * こちらは「文字を描け」と言う必要がある一方で、
 * **かな以外は描かせない**（漢字はふりがなを焼けないので学習者が読めない・規律2）。
 *
 * 焼く文字は呼ぶ側が機械変換で用意する（`kanaOf`）。ここでは
 * **逐語で1回だけ**書く——言い換えられると、データのセリフと絵の字がずれる。
 *
 * 画像生成の日本語は長いほど崩れるので、スキーマ側で20文字・1コマ2吹き出しに
 * 絞ってある。ここではその前提で「大きく・はっきり」を頼む。
 *
 * ## 実測（2026-08-07・Codex image_gen / gpt-image-2）
 * 「おはようございます。」「あさかいを はじめます。」の2つの吹き出しを、
 * **1回の生成で崩れゼロ・分かち書きの空白まで保って**描けた。
 * かな限定にしたのは学習者が読めるようにするためだが、
 * **生成の安定にも効いている**（漢字を混ぜないほど字形が崩れない）。
 */
export function buildBakedPanelPrompt(brief: PanelBrief & { texts: readonly string[] }): string {
  const cast = brief.cast
    .map((person, index) => `Character ${index + 1} (${person.role}): ${person.looks}`)
    .join("\n");

  const balloons = brief.texts
    .map(
      (text, i) =>
        `  Balloon ${i + 1} must contain exactly this text, copied character for character:\n    ${text}`,
    )
    .join("\n");

  return [
    "One single manga panel (not a page, not a grid) for a Japanese language-learning lesson.",
    "",
    `Scene: ${brief.scene}`,
    brief.camera ? `Camera: ${brief.camera}` : "",
    cast ? `\n${cast}` : "",
    brief.cast.length > 0
      ? "Keep each character's face, hair and outfit exactly as in the reference model sheets."
      : "",
    "",
    `Draw ${brief.texts.length} speech balloon(s), placed so they do not cover any face.`,
    balloons,
    "",
    "Rules for the text inside the balloons:",
    "- Copy it EXACTLY. Do not translate, rephrase, shorten, or add anything.",
    "- It is Japanese hiragana/katakana only. Do NOT add kanji.",
    "- Do NOT add furigana or any small text above the characters.",
    "- Write it large and clearly legible, in a plain rounded manga lettering style.",
    "- No other writing anywhere in the image.",
    "",
    `Style: ${STYLE}.`,
    `Avoid: ${NEGATIVE}, no watermark, no signature, no logo, no frame border.`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/** 1コマぶんの指示（先生が書くのはここだけ）。 */
export interface PanelBrief {
  /** そのコマで何が起きているか。 */
  readonly scene: string;
  /** 出てくる人物（シートを参照画像として渡す）。 */
  readonly cast: readonly Pick<Character, "name" | "role" | "looks">[];
  /** カメラ（英語の技術語。空でよい）。 */
  readonly camera?: string;
  /** 吹き出しをいくつ描くか。セリフの数だけ空の吹き出しを置く。 */
  readonly balloons: number;
}

/**
 * まんが1コマの絵。
 *
 * 吹き出しは「いくつ・だいたいどこ」まで指示して**中身は空**にする。
 * 空の吹き出しが無いと、あとからセリフを重ねる場所が絵の上に無い。
 */
export function buildPanelPrompt(brief: PanelBrief): string {
  const cast = brief.cast
    .map((person, index) => `Character ${index + 1} (${person.role}): ${person.looks}`)
    .join("\n");

  return [
    "One single manga panel (not a page, not a grid) for a Japanese language-learning lesson.",
    "",
    `Scene: ${brief.scene}`,
    brief.camera ? `Camera: ${brief.camera}` : "",
    cast ? `\n${cast}` : "",
    brief.cast.length > 0
      ? "Keep each character's face, hair and outfit exactly as in the reference model sheets."
      : "",
    "",
    brief.balloons > 0
      ? `Draw ${brief.balloons} empty speech balloon(s), placed so they do not cover any face. The balloons must contain NO writing at all — the text is added afterwards by the app.`
      : "No speech balloons.",
    "",
    `Style: ${STYLE}.`,
    `Avoid: ${NO_TEXT}, ${NEGATIVE}.`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 「やりたいこと」→ コマ割りとセリフを作らせる指示（文字だけ。絵はここでは作らない）。
 *
 * **ふりがなを必ず全部つけさせる。** ここで漏れると、保存の検査
 *（lint:content のふりがな全覆い — AGENTS.md 規律2）で必ず止まる。
 * 止まってから先生が手で足すのは、1課ぶんで数十語ぶんの仕事になる。
 */
export function buildMangaScriptPrompt(brief: {
  /** 先生の一言（例:「トラブルを 先輩に 報告する場面」）。 */
  readonly request: string;
  /** 出てくる人物。 */
  readonly cast: readonly Pick<Character, "id" | "name" | "role" | "personality">[];
  /** 何コマにするか。 */
  readonly panels: number;
}): string {
  const cast =
    brief.cast.length > 0
      ? brief.cast
          .map(
            (p) =>
              `- id: ${p.id} / 名前: ${p.name} / 立場: ${p.role}${p.personality ? ` / ${p.personality}` : ""}`,
          )
          .join("\n")
      : "- id: narration / せつめい（ナレーション）";

  return `あなたは、カンボジアのIT専攻学生（日本語 N5〜N3）向けの教材を作る先生です。
次の場面の まんがを ${brief.panels}コマ で作ってください。

## 先生の依頼
${brief.request}

## 登場人物（speaker には この id を使う。ナレーションは "narration"）
${cast}

## 守ること
1. セリフは**みじかく**。1つの吹き出しは 25文字いないにする。
2. N4より上の語を使うときは、その場で意味が分かる文脈にする。
3. 学習者を 否定する 言い方を しない。まちがいを 指摘するときも、
   できたところを 先に 言い、つぎに どうすれば よいかを 書く（設計01 P8）。
4. **漢字には ぜんぶ ふりがなを つける。** furigana に [表記, よみ] の組で入れる。
   - 送りがなを含む語は、漢字の部分だけを表記にする（例: ["話", "はな"]）。
   - 熟語は熟語のまま入れる（例: ["報告", "ほうこく"]）。長いほうを優先する。
   - **1つでも 漏れると 保存できません。** セリフ・見出し・説明に出てくる漢字を
     すべて 数えて、もれなく 入れてください。
5. scene（そのコマの絵の内容）は、**人物の動きと場所**が分かるように書く。
   絵の中に文字は描かせないので、セリフの内容を scene に書かない。

## 出す形
JSON だけを返してください。`;
}

/** コマ割りの返し方（responseSchema）。 */
export const MANGA_SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "まんがの見出し（15文字いない）" },
    description: { type: "string", description: "1文の説明" },
    furigana: {
      type: "array",
      description: "読み辞書。[表記, よみ] の組。漢字を1つも残さない",
      items: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 2,
      },
    },
    panels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "そのコマの絵（人物の動きと場所）" },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                speaker: { type: "string" },
                text: { type: "string" },
              },
              required: ["speaker", "text"],
            },
          },
        },
        required: ["scene", "lines"],
      },
    },
  },
  required: ["title", "description", "furigana", "panels"],
} as const;
