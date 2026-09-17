/**
 * 朝礼・夕礼の **点数と ふりかえり** — 画面に 出す 形を ここで 決める
 *
 * ## なぜ 点数を 出すのか
 * 2026-09-17 の 指定「モーダルや 最終結果の UIの 情報が 足りません。
 * 添付のように なるように、AI側の 採点などを しっかりと 作って ください」。
 *
 * 前は「開いた カード / まだの カード」の 2行だけだった。**何が どう よくて、
 * 何を 直すのか**が 画面から 読めないので、学習者は 同じ ところで つまずき つづける。
 *
 * ## 3つの ものさし（100点）
 * - **報告の 内容**（40）… 4つの 型を 言えたか。**アプリが 数える**（AIの さじ加減で 動かない）
 * - **伝わりやすさ**（30）… 相手が 分かる 言い方か。AIが 見る
 * - **仕事の 日本語**（30）… ですます・助詞・動詞の 形。AIが 見る
 *
 * **鍵が 無い 端末では 内容だけ 出す**（BYOK。`judge-api.ts` の 覚え書き）。
 * 見て いない ものに 点を つけない——「0点」と 出すと、言えて いるのに
 * 落とされたと 読める（規律1: 結果を ぼかさない ＝ 見て いない ことも ぼかさない）。
 */

/** 3つの ものさしの 満点。 */
export const CONTENT_MAX = 40;
export const CLARITY_MAX = 30;
export const JAPANESE_MAX = 30;

/** 1つの 札が どう 伝わったか。 */
export type RowMark =
  /** 最初の 報告で 言えた。 */
  | "first"
  /** 聞き返しの あとで 言えた。 */
  | "probe"
  /** 数を まちがえて、聞き返しの あとで 直した。 */
  | "fixed"
  /** 2回 聞いても 言えなかった。 */
  | "missing";

export interface RowReview {
  readonly panelId: string;
  readonly label: string;
  readonly mark: RowMark;
}

/**
 * 内容の 点（0〜40）。
 *
 * ⭕（`full`）の 札の 割合で 出す。**開いただけ（`open`）は 数えない**——
 * 箱が 3つ ある 札で 1つしか 言えて いない のに 満点に なると、
 * 画面の 数と 会話が 別の ことを 言う（2026-09-11 の 直しと 同じ 理由）。
 */
export function contentScore(fullCards: number, totalCards: number): number {
  if (totalCards <= 0) return 0;
  const ratio = Math.max(0, Math.min(fullCards, totalCards)) / totalCards;
  return Math.round(CONTENT_MAX * ratio);
}

/**
 * 総合（0〜100）。**AIの 2つが そろって いる ときだけ 出す**。
 *
 * 鍵が 無い 端末では `null` を 返し、画面は 内容だけを 出す。
 */
export function totalScore(
  content: number,
  clarity: number | null,
  japanese: number | null,
): number | null {
  if (clarity === null || japanese === null) return null;
  return Math.round(content + clarity + japanese);
}

/** 画面に 出す 数（0〜max に 丸める）。AIが はみ出した 値を 返しても 崩れない。 */
export function clampScore(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(value, max)));
}

/**
 * その日の カードが 1枚 どう 伝わったかを 決める。
 *
 * - 聞き返しが 0回で ⭕ … `first`
 * - 聞き返しの あとで ⭕ … `probe`（数を まちがえて いた ときは `fixed`）
 * - ⭕ に ならなかった … `missing`
 */
export function markOf({
  full,
  attempts,
  wrongNumber = false,
}: {
  readonly full: boolean;
  readonly attempts: number;
  readonly wrongNumber?: boolean;
}): RowMark {
  if (!full) return "missing";
  if (attempts <= 0) return "first";
  return wrongNumber ? "fixed" : "probe";
}

/**
 * 進捗の 札で **その日の 数では ない 数**を 言って いたか。
 *
 * 「45%です。先ほどの 70%は 間違いです。」の ような 言い直しを
 *「質問後に 修正」と 出す ための 目印。当たりことば（`45%`）を 正に して、
 * 発話の 中の ほかの パーセントを 探す。
 */
export function saidWrongPercent(utterance: string, expected: string | null): boolean {
  if (!expected) return false;
  const found = [...utterance.matchAll(/(\d{1,3})\s*[%％]/gu)].map((hit) => hit[1]);
  if (found.length === 0) return false;
  return found.some((value) => value !== expected);
}

/** 当たりことば（`45%`）から その日の 数だけを 取り出す。 */
export function expectedPercentOf(keywords: readonly string[]): string | null {
  for (const word of keywords) {
    const hit = /^(\d{1,3})\s*[%％]$/u.exec(word.trim());
    if (hit) return hit[1] ?? null;
  }
  return null;
}
