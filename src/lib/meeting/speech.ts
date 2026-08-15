/**
 * 相手の ことばに 差し込む — `◯◯` を 何で 埋めるか（純粋な文字列づくり）
 *
 * ## 同じ `◯◯` でも 役が ちがう（`src/content/schema.ts`）
 * - `ask`（相手の質問）・`closing`・`reward` … **学習者の呼び名**に置きかわる
 * - `echo`（受け答え）… **学習者の答え**に置きかわる（おうむ返し＋共感）
 * - `hint`（型文）… **どちらでもない**。学習者が自分のことばを入れる穴なので
 *   穴のまま見せる（差し込みは `src/lib/meeting/hint.ts` の担当）
 *
 * ## なぜ ここに 切り出したか（実際に 壊れていた）
 * 画面には呼び名を差し込む `withName()` が1つだけあり、受け答えを作るときも
 * まず それを 通していた:
 *
 * ```ts
 * echo: withName(question.echo).replaceAll(NAME_MARK, coreOf(utterance))
 * ```
 *
 * `withName()` が先に `◯◯` を**全部**呼び名へ変えてしまうので、後ろの置換は
 * 当たる先が残っていない。AI判定が使えない教室（キー未登録＝標準）では、
 * 「そうです、**ソピア**ですね。サービスの ページを 見たんですね。」と、
 * 相手が学習者の名前を答えとして復唱していた。
 *
 * 役ごとに関数を分けて、テストで固定する。画面側に置くと、レイアウトを直すたびに
 * 順番が入れかわり、同じ壊れ方が黙って戻ってくる。
 */

/** 相手の ことばの 中で、置きかわる ところの 目印。 */
export const NAME_MARK = "◯◯";

/** 呼び名が まだ 決まっていない ときの 呼び方（`◯◯` を 画面に 残さない）。 */
export const NO_NAME = "あなた";

/**
 * 呼び名を 差し込む（`ask` / `closing` / `reward` 用）。
 * 名前が まだ 無い 学習者にも 文として 読める ように「あなた」で 埋める。
 */
export function fillName(text: string, learnerName: string): string {
  return text.replaceAll(NAME_MARK, learnerName.trim() || NO_NAME);
}

/**
 * 学習者の 答えを 差し込む（`echo` 用）。
 *
 * 答えが 空の ときは **空文字**を返す。おうむ返しは「聞こえたことを もう一度」
 * なので、聞こえていない ときに 出す 文は 無い（画面は 空なら 何も 出さない）。
 * ここで `◯◯` の ままにすると、目印が そのまま 学習者の 目に 入る。
 */
export function fillAnswer(echo: string, answer: string): string {
  const core = answer.trim();
  if (core === "") return "";
  return echo.replaceAll(NAME_MARK, core);
}
