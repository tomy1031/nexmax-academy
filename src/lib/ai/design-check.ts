/**
 * 画像の デザイン判定（記事の `aiImageCheck` ブロック・要望 #713）— 画面の 側の 決まり
 *
 * 旧アプリ nextmake-onboarding の「8.デザイン」: 学生が 参考サイトの 画面を 上げ、えらんだ 理由を
 * 書くと、AI の 山本社長が Aoba の ブランドに 合うかを 判定する（何枚でも 試せる）。
 *
 * ## ブランドの 決まりは ここに 置かない
 * 決まり（オフホワイト・明朝体・広い 余白…）は 学生に まだ 見せない 答え（規律6・constraints
 * 2026-11-10）。画面の プログラムは 配る 中身に 字の まま 載るので、指示文は Supabase の 関数
 *（`supabase/functions/ai-check/design.ts`）だけが 持つ。**ここから その ファイルを import しない**。
 * 判定の 名前（`au` など）が 2つで そろって いるかは `tests/design_check.test.ts` が 見る。
 *
 * ## 学習者が 読む 文の 漢字
 * 文字の チェック（`src/lib/quiz/ai-review.ts`）と 同じ 作り。使って よい ことばを こちらから
 * 渡し（`AI_KANJI_WORDS` ＋ デザインの ことば ＋ 教材の 読み辞書）、それ以外が 混ざったら
 * 1回だけ 言い直して もらう。それでも 残る 文は 落とす。検査と 画面の ルビは **同じ 索引**。
 *
 * ## 「白い 背景」を すすめさせない
 * 決まりは「真っ白は NG（和紙の ような オフホワイト）」。試した とき、Haiku 5.5 は「つぎ」で
 *「白い 背景の サイトを さがそう」と 書く ことが あった。指示文で 止めた うえで、ここでも
 * 見張る——書いて きたら 1回 言い直し、それでも なら「つぎ」を 出さない。
 */

import { AI_KANJI_WORDS, aiReplyFurigana } from "@/lib/ai-kanji";
import { requestClaudeDesign, type ClaudeToolResult } from "@/lib/ai/claude-check";
import {
  buildFuriganaIndex,
  uncoveredKanji,
  type FuriganaEntry,
  type FuriganaIndex,
} from "@/lib/text/furigana";

/** 判定（関数の `DESIGN_VERDICTS` と 同じ 名前）→ 画面の ことば。 */
export const DESIGN_VERDICT_LABELS = {
  au: "合う",
  sukoshi_chigau: "少し ちがう",
  awanai: "合わない",
} as const;
export type DesignVerdict = keyof typeof DESIGN_VERDICT_LABELS;

/** 判定の 返事（画面に 出す 形）。 */
export interface DesignReview {
  readonly verdict: DesignVerdict;
  /** 合って いる ところ（0〜3）。 */
  readonly good: readonly string[];
  /** ちがう ところ（0〜4）。 */
  readonly fix: readonly string[];
  /** つぎに する こと（無い ときは 空）。 */
  readonly next: string;
}

/**
 * デザインの 話で AIが 漢字で 書いて よい ことば（＋読み）。`AI_KANJI_FURIGANA` に 無い ものだけ。
 *
 * 送りがなで 読みが 変わる 字（細い／細かい・少し／少ない）は **送りがなまで 入れて** 置く
 *（1字だけで 置くと「細かい」に「ほそ」が 付く）。
 */
export const DESIGN_AI_FURIGANA: readonly FuriganaEntry[] = [
  ["抹茶色", "まっちゃいろ"],
  ["明朝体", "みんちょうたい"],
  ["雰囲気", "ふんいき"],
  ["縦書き", "たてがき"],
  ["真ん中", "まんなか"],
  ["真っ白", "まっしろ"],
  ["真っ黒", "まっくろ"],
  ["落ち着", "おちつ"],
  ["引き算", "ひきざん"],
  ["見出し", "みだし"],
  ["決まり", "きまり"],
  ["抹茶", "まっちゃ"],
  ["茶室", "ちゃしつ"],
  ["背景", "はいけい"],
  ["余白", "よはく"],
  ["写真", "しゃしん"],
  ["和紙", "わし"],
  ["和柄", "わがら"],
  ["和風", "わふう"],
  ["模様", "もよう"],
  ["画像", "がぞう"],
  ["参考", "さんこう"],
  ["全体", "ぜんたい"],
  ["派手", "はで"],
  ["元気", "げんき"],
  ["上品", "じょうひん"],
  ["空気", "くうき"],
  ["空間", "くうかん"],
  ["欧文", "おうぶん"],
  ["英語", "えいご"],
  ["中心", "ちゅうしん"],
  ["感じ", "かんじ"],
  ["一番", "いちばん"],
  ["黄色", "きいろ"],
  ["茶色", "ちゃいろ"],
  ["灰色", "はいいろ"],
  ["原色", "げんしょく"],
  ["細い", "ほそい"],
  ["細く", "ほそく"],
  ["太い", "ふとい"],
  ["太く", "ふとく"],
  ["広い", "ひろい"],
  ["広く", "ひろく"],
  ["広さ", "ひろさ"],
  ["多い", "おおい"],
  ["多く", "おおく"],
  ["多す", "おおす"],
  ["少し", "すこし"],
  ["少な", "すくな"],
  ["弱い", "よわい"],
  ["暗い", "くらい"],
  ["近い", "ちかい"],
  ["近く", "ちかく"],
  ["明る", "あかる"],
  ["温か", "あたたか"],
  ["小さ", "ちいさ"],
  ["飾り", "かざり"],
  ["静", "しず"],
  ["探", "さが"],
  ["選", "えら"],
  ["合", "あ"],
  ["並", "なら"],
  ["置", "お"],
  ["塗", "ぬ"],
  ["左", "ひだり"],
  ["右", "みぎ"],
  ["黒", "くろ"],
  ["白", "しろ"],
  ["緑", "みどり"],
  ["赤", "あか"],
  ["青", "あお"],
  ["色", "いろ"],
  ["線", "せん"],
  ["字", "じ"],
  ["絵", "え"],
  ["和", "わ"],
  ["品", "ひん"],
];

/**
 * AIの 文を 検査して 描く ときの 読み（AIの 一覧 ＋ デザインの ことば ＋ 教材の 読み辞書）。
 * 教材の ぶんを あとに 置いて 勝たせる（`aiReplyFurigana` と 同じ 決まり）。
 */
export function designReplyFurigana(material: readonly FuriganaEntry[]): readonly FuriganaEntry[] {
  return aiReplyFurigana([...DESIGN_AI_FURIGANA, ...material]);
}

/**
 * AIに「漢字で 書いて よい」と 渡す ことば。
 *
 * 教材の 読み辞書の **1字だけの 見出しは 渡さない**（「見」を 渡すと「意見」も 書いて よいと
 * 読まれる）。描く ときの 索引には 入って いるので、1字の 語が 返って きても ルビは 付く。
 */
export function designPromptWords(material: readonly FuriganaEntry[]): string[] {
  const material2 = material.map(([word]) => word).filter((word) => [...word].length >= 2);
  return [
    ...new Set([...DESIGN_AI_FURIGANA.map(([word]) => word), ...AI_KANJI_WORDS, ...material2]),
  ].filter((word) => /[一-鿿々]/u.test(word) && word.length <= 12);
}

/** 「無い」を 表す 字（道具の 引数は null を 持てないので 文字で 返って くる）。 */
const EMPTY_WORDS = ["null", "none", "なし", "無し", "ない", "-", "—"];

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return EMPTY_WORDS.includes(trimmed) ? "" : trimmed;
}

function lines(value: unknown, max: number): string[] {
  return (Array.isArray(value) ? value : [])
    .map(text)
    .filter((line) => line !== "")
    .slice(0, max);
}

/** 道具の 引数を 読む。判定が 読めなければ null（「見て もらえなかった」）。 */
export function parseDesignReview(input: unknown): DesignReview | null {
  if (!input || typeof input !== "object") return null;
  const bag = input as Record<string, unknown>;
  const verdict = bag.hantei;
  if (typeof verdict !== "string" || !Object.hasOwn(DESIGN_VERDICT_LABELS, verdict)) return null;
  return {
    verdict: verdict as DesignVerdict,
    good: lines(bag.yoi_tokoro, 3),
    fix: lines(bag.naosu_tokoro, 4),
    next: text(bag.tsugi),
  };
}

/**
 * 「白い 背景」を すすめて いるか（「つぎ」だけ 見る）。
 * 「ちがう ところ」で「背景が 真っ白です」と 書くのは 正しい 指摘なので 見ない。
 * 「オフホワイト」は よい（決まりの 色）。
 */
export function suggestsWhite(next: string): boolean {
  return /白い|しろい|真っ白|まっしろ|(?<!オフ)ホワイト/u.test(next);
}

/** 返事の 文が ぜんぶ 読めるか（読めない 漢字が 無いか）。 */
function readable(value: string, index: FuriganaIndex): boolean {
  return value === "" || uncoveredKanji(value, index).length === 0;
}

function allReadable(review: DesignReview, index: FuriganaIndex): boolean {
  return [...review.good, ...review.fix, review.next].every((line) => readable(line, index));
}

/** 2回目でも 読めない 文・白を すすめる「つぎ」を 落とす。判定は 残す（ぼかさない）。 */
function keepReadable(review: DesignReview, index: FuriganaIndex): DesignReview {
  const next = readable(review.next, index) && !suggestsWhite(review.next) ? review.next : "";
  return {
    verdict: review.verdict,
    good: review.good.filter((line) => readable(line, index)),
    fix: review.fix.filter((line) => readable(line, index)),
    next,
  };
}

export type DesignCheckResult =
  | { readonly ok: true; readonly review: DesignReview }
  | { readonly ok: false; readonly reason: string; readonly closed: boolean };

/**
 * 1枚を 判定して もらう。読めない 漢字・白を すすめる「つぎ」が あれば 1回だけ 言い直して もらう。
 * `request` は テストで AIを 差しかえる ため。
 */
export async function runDesignCheck(
  input: {
    check: string;
    reason: string;
    image: { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
    /** 教材の 読み辞書。 */
    material: readonly FuriganaEntry[];
  },
  request: (
    body: Parameters<typeof requestClaudeDesign>[0],
  ) => Promise<ClaudeToolResult> = requestClaudeDesign,
): Promise<DesignCheckResult> {
  const index = buildFuriganaIndex(designReplyFurigana(input.material));
  const base = {
    check: input.check,
    reason: input.reason,
    image: input.image,
    words: designPromptWords(input.material),
  };
  const first = await request({ ...base, retry: { kanji: false, white: false } });
  if (!first.ok) return first;
  let review = parseDesignReview(first.input);
  if (!review) return { ok: false, reason: "badShape", closed: false };

  const retry = { kanji: !allReadable(review, index), white: suggestsWhite(review.next) };
  if (retry.kanji || retry.white) {
    const again = await request({ ...base, retry });
    // 2回目が だめなら 1回目を 使う（読めない 文は 下で 落とす）
    const parsed = again.ok ? parseDesignReview(again.input) : null;
    if (parsed) review = parsed;
  }
  return { ok: true, review: keepReadable(review, index) };
}

/** 先生の 表に 残す 1文（「合って いる ところ: …／ちがう ところ: …／つぎ: …」）。 */
export function designReviewSummary(review: DesignReview): string {
  const parts: string[] = [];
  if (review.good.length > 0) parts.push(`合って いる ところ: ${review.good.join("／")}`);
  if (review.fix.length > 0) parts.push(`ちがう ところ: ${review.fix.join("／")}`);
  if (review.next !== "") parts.push(`つぎ: ${review.next}`);
  return parts.join("　");
}
