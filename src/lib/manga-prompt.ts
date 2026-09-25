/**
 * まんがの絵をつくるときのプロンプト
 *
 * 調査（2026-08-06）で分かった、外せない決まりをここに集める。
 * 画面ごとに書き分けると、1か所だけ古い書き方が残って画風が割れる。
 *
 * ## 1. 文字の 入れかたは 2通り（2026-09-25 に 改めた）
 * - **セリフ入り（`buildBakedPanelPrompt`）**: 吹き出しに セリフを 焼く、ふつうの カラー漫画の 形。
 *   **字は 横書き**、**漢字には 1つ残らず ふりがな**（読みは 読み辞書から 逐語で 渡す）。
 *   2026-08-06 は「画像生成に ルビは 焼けない（実例ゼロ）」と 判断して かなに 縛って いたが、
 *   image-gen-2 で 漢字＋ふりがな＋ローマ字の 吹き出しが 崩れずに 描けた（2026-08-19・願い #115。
 *   2026-09-18 の 夕礼の しごと絵でも 画面の 字に ふりがなを 焼けて いる）。
 *   ユーザーの 指定（2026-09-25）「一般的なカラー漫画の形式」「全ての漢字には正確なふりがな」
 *   「吹き出しの文字は横」。**焼いた 絵は 1枚ずつ 目で 字と 読みを 照合する**（崩れたら 撮り直す）。
 * - **絵だけ（`buildPanelPrompt`）**: 吹き出しは 空で 描かせ、セリフは アプリが 重ねる。
 *   設定画・口パクなど、文字が あると 困る 絵は こちら（`NO_TEXT`）。
 *
 * ## 2. キャラクターは設定画（シート）を参照画像として毎回渡す
 * プロンプトで毎回容姿を書くより確実。Google の consistent-imagery codelab も
 * 国内の実装記事も同じ結論。だからシートを先に1枚作る。
 *
 * ## 3. コマは1枚ずつ描かせる（スタジオの 既定）
 * 4コマを1枚で出すとコマ順とレイアウトが制御できず、読み順が崩れる報告が多い。
 * スタジオでは 枠とセリフはアプリ側（HTML）が持ち、AIには1コマ＝1枚の絵だけ描かせる。
 * 例外: カラー漫画の 1ページを 1枚で 描く 教材（`size: "page"`）は、台帳
 *（`scripts/images/<id>.json`）で コマの 並びを 1コマずつ 言葉で 指定して 描かせる。
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

/** 口の形（母音5つ＋閉じ）と、絵に頼む言い方。 */
export const MOUTH_SHAPES = [
  { key: "closed", mouth: "mouth closed, relaxed gentle smile" },
  { key: "a", mouth: 'mouth wide open saying "AH", jaw dropped, tongue visible' },
  { key: "i", mouth: 'mouth stretched wide saying "EE", upper and lower teeth visible' },
  { key: "u", mouth: 'lips pursed forward in a small circle saying "OO"' },
  { key: "e", mouth: 'mouth half open saying "EH", upper teeth visible' },
  { key: "o", mouth: 'lips rounded in an oval saying "OH"' },
] as const;

export type MouthShapeKey = (typeof MOUTH_SHAPES)[number]["key"];

/**
 * 口パク用のバストアップ。**口以外は動かさない**ことが全部。
 *
 * 6枚を切り替えて口を動かすので、背景・髪・目・服が1枚でも違うと、
 * 切り替えのたびに画面がちらつく（2026-08-13 に実際に起きた——背景が
 * 青と白で混ざっていた）。だから絵にも「同じにしろ」と強く言い、
 * そのうえでスタジオ側が**口の部分だけを重ねて**作り直す。
 */
export function buildMouthPrompt(
  character: { role: string; looks: string },
  shape: (typeof MOUTH_SHAPES)[number],
): string {
  return [
    "A bust-up portrait for a talking-head animation frame.",
    "",
    `Character: ${character.role} — ${character.looks}`,
    "",
    "Framing: head and shoulders, facing the camera straight on, centered,",
    "eyes looking at the camera, neutral friendly expression.",
    /*
     * 背景は1色。**濃いめの青灰色**にする——Zoomの枠が濃紺なので、淡い水色だと
     * 切り抜きを貼ったように浮いて見えた（実測して 2026-08-13 に差し替えた）。
     */
    "Background: a single flat muted blue-grey color (#b8c9db), like a plain office wall.",
    "No gradient, no pattern, no props.",
    "",
    `Mouth: ${shape.mouth}.`,
    "Everything else (background color, hair, eyes, eyebrows, head angle, clothing, framing, lighting)",
    "must be EXACTLY the same as the reference image. Change ONLY the mouth.",
    "",
    `Style: ${STYLE}.`,
    `Avoid: ${NO_TEXT}, ${NEGATIVE}.`,
  ].join("\n");
}

/**
 * 絵に 焼く 字の 決まり（横書き・漢字には ふりがな）。**台帳の 絵でも 同じ 文を 使う**
 *（`scripts/images/renraku_manga_v2.json` の `noText` は ここを 逐語で 写した もの）。
 */
export const RUBY_LETTERING = [
  "All lettering is HORIZONTAL (left to right, yokogaki) — never vertical.",
  "Copy every text EXACTLY as given, character for character: do not translate, rephrase, shorten, or add anything.",
  "Directly above EVERY kanji, print its reading in small hiragana (furigana), centred over that kanji, clearly separated from it, at about 45% of the kanji height.",
  "Use exactly the readings listed below — never guess a reading.",
  "Hiragana, katakana, Latin letters, digits and symbols take no furigana.",
  "Letter it large and clearly legible in a plain rounded manga font.",
].join(" ");

/**
 * セリフを**絵の中に焼く**コマの指示。
 *
 * 通常の `buildPanelPrompt` と分けてあるのは、禁止事項が正反対になるから。
 * こちらは「文字を描け」と言う。焼く文字は **セリフそのもの**（`bakedText`）で、
 * ここでは **逐語で1回だけ**書く——言い換えられると、データのセリフと絵の字がずれる。
 * 漢字の 読みは 呼ぶ側が 読み辞書から 渡す（`bakedReadings`）。モデルに 読ませると
 * 文脈と ちがう 読み（「行」を ぎょう 等）を 焼く ことが ある。
 *
 * ## 実測
 * - 2026-08-07: 「おはようございます。」「あさかいを はじめます。」（かな）を 崩れゼロで 描けた。
 * - 2026-08-19: 「これから 私と Zoom」＋「私」の 上に「わたし」を 1回で 描けた（願い #115）。
 */
export function buildBakedPanelPrompt(
  brief: PanelBrief & {
    texts: readonly string[];
    readings?: readonly (readonly [string, string])[];
  },
): string {
  const cast = brief.cast
    .map((person, index) => `Character ${index + 1} (${person.role}): ${person.looks}`)
    .join("\n");

  const balloons = brief.texts
    .map(
      (text, i) =>
        `  Balloon ${i + 1} must contain exactly this text, copied character for character:\n    ${text}`,
    )
    .join("\n");

  const readings = brief.readings ?? [];

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
    `Lettering: ${RUBY_LETTERING}`,
    readings.length > 0
      ? `Furigana readings (kanji → hiragana): ${readings.map(([surface, reading]) => `${surface} → ${reading}`).join(" / ")}`
      : "",
    "No other writing anywhere in the image.",
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
    description: {
      type: "string",
      description:
        "1文の説明。中身だけを 書く（ステージ・クリア・スキップ など アプリの 仕組みの 話は 書かない）",
    },
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
