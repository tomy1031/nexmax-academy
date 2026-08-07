/**
 * まんがを 作る 段どり（そうだん → すじがき → わりつけ → 絵）
 *
 * ユーザーの言葉:
 *   「作りたいもの → AIが明確なストーリーを作る → 修正・承認
 *    → ページごとの内容とコマ割り → 承認後生成」
 *
 * ## なぜ段を分けるのか
 * 一発で全部作らせると、**直したいところが1か所でも全部作り直し**になる。
 * 話の筋が違うのか、コマの割り方が違うのか、絵が違うのかを分けて直せると、
 * やり直しの単位が小さくなる。
 *
 * それ以上に大きいのは**承認するまで教材に書き込まない**こと。
 * いまの作りは生成した瞬間に教材へ流し込むので、2回目を押すと
 * 前のコマと生成ずみの絵が確認なしで消える。先生が「もう一度押すのが怖い」
 * 状態になり、結局使われない。
 *
 * ## 過去の教材を踏まえる
 * 「AIが（過去の内容を理解しながら）作る」ため、すでにある教材から
 * **すでに習った語**と**前の話の終わり**を集めて渡す。
 * 渡す量には上限を置く（`MAX_CONTEXT_CHARS`）——全部渡すと、
 * 課が増えるほど頼み文が伸びて、肝心の依頼が薄まる。
 *
 * 純関数だけ。段の進み方はここで決め、画面は表示と操作に専念する。
 */

import type { Character, Content } from "@/content/schema";

/** いまどの段にいるか。 */
export type StoryStep = "brief" | "story" | "layout" | "art";

export const STORY_STEPS: readonly { id: StoryStep; label: string; hint: string }[] = [
  { id: "brief", label: "① そうだん", hint: "何を つくるか を 1行で" },
  { id: "story", label: "② すじがき", hint: "話の ながれ を きめる" },
  { id: "layout", label: "③ わりつけ", hint: "コマと セリフ を きめる" },
  { id: "art", label: "④ 絵", hint: "コマごとに 1枚ずつ" },
];

/** AIが返す「話の骨組み」。まだ教材ではない。 */
export interface StoryOutline {
  readonly title: string;
  readonly logline: string;
  readonly teachingPoint: string;
  readonly beats: readonly {
    readonly panel: number;
    readonly what: string;
    readonly why: string;
  }[];
}

/** `outputSchema` と Gemini の `responseSchema` に同じものを渡す。 */
export const STORY_OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "まんがの見出し（15文字いない）" },
    logline: { type: "string", description: "1文で どんな話か" },
    teachingPoint: { type: "string", description: "この回で 身につくこと（1文）" },
    beats: {
      type: "array",
      description: "コマの数だけ。1コマで 何が起きるか",
      items: {
        type: "object",
        properties: {
          panel: { type: "number", description: "何コマ目か（1から）" },
          what: { type: "string", description: "そのコマで 起きること" },
          why: { type: "string", description: "なぜ その コマが 要るか" },
        },
        required: ["panel", "what", "why"],
      },
    },
  },
  required: ["title", "logline", "teachingPoint", "beats"],
} as const;

/** 渡す文脈の上限。これを超えると、肝心の依頼が薄まる。 */
export const MAX_CONTEXT_CHARS = 1200;

/**
 * すでに作った教材から「AIに踏まえてほしいこと」を集める。
 *
 * 集めるのは2つだけ:
 *   - **すでに習った語**（重複を避ける・前の課を思い出させる）
 *   - **前のまんがの終わり**（話が続いていると学習者は覚えやすい）
 *
 * 全部渡さないのは、課が増えるほど頼み文が伸びるため。
 * 新しいものから詰めて、上限で打ち切る。
 */
export function buildStoryContext(contents: readonly Content[]): string {
  const terms: string[] = [];
  const endings: string[] = [];

  for (const content of contents) {
    if (content.kind === "wordstage") {
      terms.push(...content.words.map((w) => w.term));
    } else if (content.kind === "manga") {
      const last = content.pages.at(-1)?.panels.at(-1)?.lines.at(-1)?.text;
      if (last) endings.push(`「${content.title}」の さいご: ${last}`);
    }
  }

  const parts: string[] = [];
  if (terms.length > 0) {
    parts.push(
      `## すでに 習った ことば（同じ語を 使ってよい。新しい語は 1〜3語まで）\n${[...new Set(terms)].join("・")}`,
    );
  }
  if (endings.length > 0) {
    parts.push(`## 前の まんがの おわり（話が つながると 覚えやすい）\n${endings.join("\n")}`);
  }

  const joined = parts.join("\n\n");
  return joined.length <= MAX_CONTEXT_CHARS
    ? joined
    : `${joined.slice(0, MAX_CONTEXT_CHARS)}\n…（ここまで）`;
}

/** 段①→②の頼み文。まだコマ割りもセリフも作らせない。 */
export function buildStoryPrompt(brief: {
  readonly request: string;
  readonly panels: number;
  readonly cast: readonly Pick<Character, "id" | "name" | "role" | "personality">[];
  readonly context: string;
}): string {
  const cast =
    brief.cast.length > 0
      ? brief.cast
          .map((p) => `- ${p.name}（${p.role}）${p.personality ? `: ${p.personality}` : ""}`)
          .join("\n")
      : "- せつめい（ナレーション）だけ";

  return [
    "あなたは、カンボジアのIT専攻学生（日本語 N5〜N3）向けの教材を作る先生です。",
    `${brief.panels}コマの まんがの **話の骨組みだけ** を作ってください。`,
    "**セリフは まだ 書きません。** どんな話にするかを 先に 決めます。",
    "",
    "## 先生の依頼",
    brief.request,
    "",
    "## 登場人物",
    cast,
    brief.context ? `\n${brief.context}` : "",
    "",
    "## 守ること",
    "- 1コマ1つのことだけ起こす。詰め込むと 学習者が 追えません",
    "- さいごの コマで「できるようになったこと」が 見えるようにする",
    "- 学習者を 否定する 話に しない。うまくいかない場面は、直す道すじまで 見せる",
    "- 説明する文は みじかく（30字いない）",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * 段②→③の頼み文。**承認された骨組みを逐語で渡す**。
 *
 * 骨組みを言い換えさせないのは、先生が承認したのは「その文」だからである。
 * 言い換えたものからコマを作ると、承認の意味が無くなる。
 */
export function buildLayoutPrompt(approved: {
  readonly outline: StoryOutline;
  readonly cast: readonly Pick<Character, "id" | "name" | "role" | "personality">[];
}): string {
  const cast =
    approved.cast.length > 0
      ? approved.cast.map((p) => `- id: ${p.id} / ${p.name}（${p.role}）`).join("\n")
      : "- id: narration / せつめい";

  const beats = approved.outline.beats.map((b) => `${b.panel}コマ目: ${b.what}`).join("\n");

  return [
    "先生が 承認した 話の骨組みを、そのまま コマ割りと セリフに してください。",
    "**骨組みを 変えないでください。** 言い換え・順番の入れかえ・コマの増減を しないこと。",
    "",
    `## 承認ずみの 骨組み（見出し: ${approved.outline.title}）`,
    `ねらい: ${approved.outline.teachingPoint}`,
    beats,
    "",
    '## 登場人物（speaker には この id を使う。ナレーションは "narration"）',
    cast,
    "",
    "## 守ること",
    "1. セリフは みじかく。1つの吹き出しは 25文字いない",
    "2. 1コマの 吹き出しは 2つまで",
    "3. 学習者を 否定する 言い方を しない",
    "4. **読み辞書（furigana）に、セリフの 漢字を 1つ残らず 入れる**",
    "5. 各コマの scene に、絵の 指示（人物の動きと 場所）を 書く",
  ].join("\n");
}

/** 骨組みの形をたしかめる（教材に入る前の関門）。 */
export function validateOutline(
  value: unknown,
): { ok: true; value: StoryOutline } | { ok: false; problem: string } {
  if (typeof value !== "object" || value === null) {
    return { ok: false, problem: "JSONオブジェクトでは ありません" };
  }
  const raw = value as Record<string, unknown>;
  for (const key of ["title", "logline", "teachingPoint"]) {
    if (typeof raw[key] !== "string" || (raw[key] as string).length === 0) {
      return { ok: false, problem: `${key} が ありません` };
    }
  }
  if (!Array.isArray(raw.beats) || raw.beats.length === 0) {
    return { ok: false, problem: "beats が 空です" };
  }
  for (const [i, beat] of raw.beats.entries()) {
    const b = beat as Record<string, unknown>;
    if (typeof b?.what !== "string" || b.what.length === 0) {
      return { ok: false, problem: `beats[${i}].what が ありません` };
    }
    if (typeof b?.why !== "string") return { ok: false, problem: `beats[${i}].why が ありません` };
    if (typeof b?.panel !== "number")
      return { ok: false, problem: `beats[${i}].panel が 数字では ありません` };
  }
  return { ok: true, value: raw as unknown as StoryOutline };
}
