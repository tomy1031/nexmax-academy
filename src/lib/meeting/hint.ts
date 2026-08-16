/**
 * 型文（かたぶん）— 「こう 言えます」の足場をどう見せ、どう覚えておくか
 *
 * ## なぜ 既定で 見えるのか
 * 対象は N5〜N4 の学習者で、**声で日本語を話すのが いちばん こわい**。
 * 型文をボタンの向こうに隠すと、ボタンの存在に気づかないまま固まり、
 * その教材は丸ごと失敗する。設計05 §5.5 のレベル対応表も初級は
 * 「穴あき型文を常時表示」を求めている。だから**既定は 見える**にして、
 * 隠すのは「もう 足場は いらない」と学習者が決めたときだけにする（設計01 P11:
 * 負荷の調整装置は 学習者自身が 握る）。
 *
 * ## ◯◯ は 名前では ない
 * `ask` と `echo` の `◯◯` は**学習者の呼び名**に置きかわる目印だが、
 * `hint` の `◯◯` は**学習者が 自分の ことばを 入れる 穴**である
 *（`src/content/schema.ts`「答え方の足場。穴あきの型文にする」）。
 * ここを呼び名で埋めると「わたしは ソピアから 来ました。」のような型文が出て、
 * 足場が足場でなくなる。だから穴のまま見せ、見た目で穴だと分かるようにする。
 *
 * ## 保存は 進捗ストアと 同じ 入れ物
 * `nexmax:v1` 名前空間に鍵を1つ足すだけ（record.ts と同じ流儀）。
 * 教材ごとに分けないのは、**次の教材でも同じ設定でいてほしい**から——
 * 教材を開くたびに足場の有無が変わると、学習者は毎回 探すことになる。
 * DBには送らない（先生が見る成績ではなく、学習者の見せ方の好み）。
 */

import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 学習者が 自分の ことばを 入れる 場所の 目印。 */
export const HINT_BLANK = "◯◯";

/* ------------------------------------------------------------------ *
 * 文字列づくり（純粋）
 * ------------------------------------------------------------------ */

/** 言い方が2つ以上あるときの区切り（「〜です。」／「〜です。」）。 */
const ALTERNATIVE = /[／/]/u;
/** いちばん外側の かぎかっこ。中の かぎかっこは 残す。 */
const WRAPPED = /^[「『]([\s\S]*)[」』]$/u;

/**
 * 型文を「そのまま 口に 出せる 1文」の並びに ほどく。
 *
 * 教材の `hint` は かぎかっこ付きで持つ決まりで、言い方が2つあるときは
 * 「／」でつなぐ（例:「すこし むずかしいです。」／「たのしいです。」）。
 * かぎかっこを一度はずすのは、**画面側で必ず同じ形に付け直す**ため——
 * 付けている教材と付けていない教材が混ざると、同じ画面で見え方が変わる。
 */
export function hintPatterns(hint: string): readonly string[] {
  return hint
    .split(ALTERNATIVE)
    .map((part) => unwrap(part.trim()))
    .filter((part) => part !== "");
}

function unwrap(text: string): string {
  return WRAPPED.exec(text)?.[1]?.trim() ?? text;
}

/** 型文の1かけら。`blank` が true なら「自分の ことばを 入れる 場所」。 */
export interface HintSegment {
  readonly text: string;
  readonly blank: boolean;
}

/**
 * 型文を、穴（◯◯）と 地の文に 分ける。
 *
 * 画面が `split` を自前で書くと、穴が2つある型文で目印だけ消えたり、
 * 空の断片が余分な `<span>` になったりする。分け方はここに1つだけ置く。
 */
export function hintSegments(pattern: string): readonly HintSegment[] {
  const segments: HintSegment[] = [];
  for (const [i, part] of pattern.split(HINT_BLANK).entries()) {
    if (i > 0) segments.push({ text: HINT_BLANK, blank: true });
    if (part !== "") segments.push({ text: part, blank: false });
  }
  return segments;
}

/* ------------------------------------------------------------------ *
 * 見せる／かくす の 記おく
 * ------------------------------------------------------------------ */

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";
const KEY = `${NAMESPACE}:meeting-hint`;

const listeners = new Set<() => void>();

/**
 * 端末の保存値は「外の入れ物」なので、React からは購読して読む
 *（効果の中で読んで state に入れると、描画のたびに書き込みが連鎖する）。
 */
export function subscribeHintShown(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * 型文を 見せるか。
 * **保存が無いとき・壊れているときは true**（＝見える）。ここを false に倒すと、
 * 端末を替えた学習者や プライベートモードの学習者だけが 足場なしで 声を出すことになる。
 */
export function readHintShown(backend: ProgressBackend = defaultBackend()): boolean {
  return backend.get(KEY) !== "false";
}

/** サーバでは端末の保存値が読めない。既定（見える）で描いて、画面が出てから差し替える。 */
export function readHintShownOnServer(): boolean {
  return true;
}

export function saveHintShown(shown: boolean, backend: ProgressBackend = defaultBackend()): void {
  backend.set(KEY, String(shown));
  for (const listener of listeners) listener();
}
