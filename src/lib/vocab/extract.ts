/**
 * ステージの本文から「単語ステージにできそうな語」を抜き出す — 頼み方と、返事の見分け方
 *
 * ネットワークに触る部分（/api/studio/vocab）から切り離して純関数だけを置く。
 * 理由は2つある:
 *  - **何をAIに頼むか**は教材の質そのもの（誤答が意味的に近いか・解説がやさしいか）で、
 *    実際にGeminiを呼ばずに読んで直せる場所に置いておきたい。
 *  - **返事のどれを信じるか**が抜けると、先生の画面に「読みがカタカナ」「誤答が日本語」の
 *    候補が並び、単語ステージを保存する段になって初めてスキーマで落ちる。
 *    先生には落ちた理由が見えないので、選び直しを延々くり返すことになる。
 *
 * したがって、ここでの原則は「少なく出すのは直せるが、壊れたものは出さない」。
 * wordSchema を通らない候補は黙って捨てる。
 */

import { wordSchema } from "@/content/schema";
import type { z } from "zod";

/** 抜き出しの候補1語。単語ステージ（DATA DIVE）の語とまったく同じ形。 */
export type VocabCandidate = z.infer<typeof wordSchema>;

/**
 * 1回に頼む語数の上限。
 * 単語ステージは6語から作れる（wordStageSchema）ので、先生が選び落としても
 * 6語に届くだけの候補を出しつつ、一覧が読み切れない長さにはしない。
 */
export const MAX_CANDIDATES = 20;

/**
 * プロンプトに載せる本文の長さの上限（文字）。
 *
 * ステージが漫画・記事・リスニングを全部ぶら下げていると本文は簡単に数万字になる。
 * そのまま送ると Worker の実行時間とモデルの入力の両方を押し上げるが、
 * 抜き出しに要るのは「その課で使われている語」なので、頭から一定量あれば足りる。
 */
export const MAX_PROMPT_CHARS = 8000;

/**
 * Gemini に返させる形（responseSchema）。
 *
 * 「JSONで返して」と頼むだけにしない（設計01 P12: プロンプト頼みにしない）。
 * id は入れていない。モデルに振らせると重複して、単語ステージ側の
 * 「words の id が重複している」で保存できなくなるため、サーバで振る。
 */
export const VOCAB_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    words: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          reading: { type: "STRING" },
          romaji: { type: "STRING" },
          meaningEn: { type: "STRING" },
          wrongMeanings: { type: "ARRAY", items: { type: "STRING" } },
          explanationJa: { type: "STRING" },
          example: { type: "STRING" },
        },
        required: ["term", "reading", "meaningEn", "wrongMeanings", "explanationJa", "example"],
      },
    },
  },
  required: ["words"],
} as const;

/**
 * 教材の本文をつないでプロンプトにする。
 *
 * 本文は `collectLearnerTexts`（content-checks.ts）が集めた「学習者が読む文」で、
 * 見出しも例文もまざった短い断片の列。区切りを入れて渡すのは、
 * モデルが文をまたいで語をつなげて存在しない語を作らないようにするため。
 */
export function buildVocabPrompt(texts: readonly string[]): string {
  const body = joinWithinBudget(texts);

  return [
    "あなたは日本語の教材を作る先生の助手です。",
    "カンボジアのIT専攻の学生（日本語はN4のあたり）が読む教材の本文をわたします。",
    "この本文の中から、学生がつまずきそうな「仕事のことば」と「ITのことば」を選んで、",
    "単語ゲームの問題にできる形にしてください。",
    "",
    "## えらび方",
    `- ${MAX_CANDIDATES}語まで。少なくてもよいので、本文に出てくる語だけを選ぶ。`,
    "- 本文に無い語を足さない。言い換えもしない（本文の表記のまま）。",
    "- N5・N4の基本語（学校・先生・行く・見る など）は選ばない。",
    "- 会社の名前・人の名前・地名は選ばない。",
    "- 仕事の場面でくりかえし使う語を先に選ぶ（報告・要件・納期・障害 など）。",
    "",
    "## それぞれの語に書くこと",
    "- term: 本文にある表記のまま。",
    "- reading: ひらがなだけで書く。カタカナの語もひらがなにする（リリース → りりーす）。",
    "- romaji: reading をローマ字にしたもの（小文字の英字だけ）。",
    "- meaningEn: 英語だけで書く。日本語をまぜない。",
    "- wrongMeanings: 英語の誤答をちょうど3つ。意味が近くてまよう語にする。",
    "  まったく関係のない語をならべると、選ぶ問題として成り立たない。",
    "  正解と同じ意味の語は入れない。3つが同じ意味にならないようにする。",
    "- explanationJa: やさしい日本語（N4くらい）で1〜2文。文節のあいだにスペースを入れる。",
    "  HTMLやルビ（<ruby>など）は書かない。ふりがなは画面が付ける。",
    "- example: 本文と同じ場面の短い例文。その語を必ず使う。",
    "- explanationJa と example は、やさしい漢字とひらがなで書く。",
    "  むずかしい漢字を足すと、学生がそこで読めなくなって止まる。",
    "",
    "## 教材の本文",
    body,
    "",
    "JSONだけを返してください。説明の文は要りません。",
  ].join("\n");
}

/**
 * AIの返事から、そのまま先生に見せてよい候補だけを取り出す。
 *
 * 返事が壊れていても投げない。抜き出しは教材づくりの入口なので、
 * ここで例外にすると先生の画面が「エラー」で止まり、手で単語を選ぶ道まで閉じてしまう。
 * 取れなければ0件で返し、画面には「見つかりませんでした」と出させる。
 */
export function parseVocabCandidates(raw: string): VocabCandidate[] {
  const entries = readEntries(raw);
  const candidates: VocabCandidate[] = [];
  const usedIds = new Set<string>();
  const usedTerms = new Set<string>();

  entries.forEach((entry, index) => {
    const shaped = shapeEntry(entry, index, usedIds);
    if (!shaped) return;

    const parsed = wordSchema.safeParse(shaped);
    if (!parsed.success) return;

    const word = parsed.data;
    // 選択肢の重複は wordStageSchema が落とす。ここで捨てておかないと、
    // 先生が選んだあとの「単語ステージをつくる」で初めて落ちる。
    if (hasDuplicateChoices(word)) return;
    // 同じ語が2回出ると、同じ問題が2回出る（学習者には手抜きに見える）。
    if (usedTerms.has(word.term)) return;

    usedIds.add(word.id);
    usedTerms.add(word.term);
    candidates.push(word);
  });

  return candidates.slice(0, MAX_CANDIDATES);
}

/* ------------------------------------------------------------------ *
 * ここから下は内部の道具
 * ------------------------------------------------------------------ */

/** 本文を上限の文字数まで詰める。途中で切れた文はそのまま渡す（語の抜き出しには足りる）。 */
function joinWithinBudget(texts: readonly string[]): string {
  const lines: string[] = [];
  let used = 0;

  for (const text of texts) {
    const line = typeof text === "string" ? text.trim() : "";
    if (!line) continue;
    if (used + line.length > MAX_PROMPT_CHARS) {
      const room = MAX_PROMPT_CHARS - used;
      if (room > 0) lines.push(line.slice(0, room));
      break;
    }
    lines.push(line);
    used += line.length;
  }

  return lines.join("\n");
}

/**
 * 返事の本文から候補の配列を取り出す。
 * responseSchema を付けていても、モデルが ```json で囲んだり配列だけを返すことがある。
 */
function readEntries(raw: string): unknown[] {
  const parsed = parseJsonLoosely(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const words = (parsed as { words?: unknown }).words;
    if (Array.isArray(words)) return words;
  }
  return [];
}

function parseJsonLoosely(raw: string): unknown {
  if (typeof raw !== "string") return null;
  const unfenced = raw.replace(/```(?:json)?/gi, "").trim();
  if (!unfenced) return null;

  try {
    return JSON.parse(unfenced);
  } catch {
    // 前後に文がまざっている場合。いちばん外側の { } / [ ] を拾って読み直す
    const sliced = sliceOutermost(unfenced);
    if (!sliced) return null;
    try {
      return JSON.parse(sliced);
    } catch {
      return null;
    }
  }
}

function sliceOutermost(text: string): string | null {
  for (const [open, close] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start >= 0 && end > start) return text.slice(start, end + 1);
  }
  return null;
}

/**
 * 1件を wordSchema に渡せる形に整える（型は直さない）。
 *
 * 前後の空白を落とすだけで、種類の違うもの（数値・null）はそのまま渡す。
 * ここで無理に文字列へ変換すると、壊れた候補が検査をすり抜けてしまう。
 */
function shapeEntry(entry: unknown, index: number, usedIds: Set<string>): unknown {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const source = entry as Record<string, unknown>;

  const romaji = trimmed(source.romaji);
  const shaped: Record<string, unknown> = {
    id: makeId(source.id, romaji, index, usedIds),
    term: trimmed(source.term),
    reading: trimmed(source.reading),
    meaningEn: trimmed(source.meaningEn),
    wrongMeanings: Array.isArray(source.wrongMeanings)
      ? source.wrongMeanings.map(trimmed)
      : source.wrongMeanings,
    explanationJa: trimmed(source.explanationJa),
    example: trimmed(source.example),
  };
  if (typeof romaji === "string" && romaji.length > 0) shaped.romaji = romaji;
  return shaped;
}

function trimmed(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

/**
 * 語のIDを決める。
 *
 * 既存の単語ステージ（content/wordstages/）は読みのローマ字をIDにしているので、
 * それに合わせる。読めない・重複するときだけ連番にする。
 * IDは学習者には見えないが、先生がJSONを読むときの手がかりになる。
 */
function makeId(rawId: unknown, romaji: unknown, index: number, usedIds: Set<string>): string {
  const fromModel = typeof rawId === "string" ? slug(rawId) : "";
  const fromRomaji = typeof romaji === "string" ? slug(romaji) : "";
  const base = fromModel || fromRomaji;
  if (base && !usedIds.has(base)) return base;
  return base ? `${base}-${index + 1}` : `w${index + 1}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 正解と誤答（または誤答どうし）が同じ意味になっていないか。wordStageSchema と同じ判定。 */
function hasDuplicateChoices(word: VocabCandidate): boolean {
  const meanings = [word.meaningEn, ...word.wrongMeanings].map((m) => m.trim().toLowerCase());
  return new Set(meanings).size !== meanings.length;
}
