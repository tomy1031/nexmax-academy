/**
 * 言えて いない 札の **ヒント**（答えを 出さない 型文）
 *
 * 2026-09-19 の 指定「数値など 正しく 言えて いない 場合は 答えは 出さず、
 * 『○○画面全体の 進捗は ○%です。』の ように ヒントに する」。
 *
 * ## ことばは 教材の 聞き返しから 取る（新しく 作らない・規律10）
 * 教材の 札は 聞き返しを 2つ 持ち、**2つめ**が 型を 渡す ことば に なって いる
 *（「『今、決済フロントエンド機能 ぜんたいの 進捗は ◯◯%です』の 形で お願いします。」）。
 * 司会が 声で 言う ものと 同じ ことばを 画面にも 出すので、ヒントと 会話が 食いちがわない。
 *
 * - 「…」の 中に ◯ が ある → その 型文（いちばん はじめの もの）
 * - ◯ が 無く「…」だけ ある → いちばん 長い「…」（「ありません」より
 *  「今の ところ 問題は ありません」——言い方の 形を 見せる ほう）
 * - 「…」が 無い → 聞き返しの 文 そのもの（夕礼の「作業記録を そのまま 読まずに、
 *   まとめて 話して ください。」の ように、型では なく 手順で 助ける 札が ある）
 *
 * 2つめが 空なら 1つめを 使う。どちらも 空なら 空（画面は ヒントを 出さない）。
 */
export function hintOf(followups: readonly string[]): string {
  const source = [followups[1], followups[0]].find((one) => (one ?? "").trim() !== "") ?? "";
  const text = source.trim();
  if (text === "") return "";
  const quoted = [...text.matchAll(/「([^」]+)」/gu)].map((match) => (match[1] ?? "").trim());
  const blank = quoted.find((one) => one.includes("◯"));
  const picked =
    blank ??
    quoted.reduce<string | undefined>(
      (longest, one) => (longest === undefined || one.length > longest.length ? one : longest),
      undefined,
    );
  if (picked === undefined) return text;
  /* 型文は「…」に 入れて 出す。句点が 無ければ 足す（画面で 1文に 読める ように）。 */
  return `「${/[。！？]$/u.test(picked) ? picked : `${picked}。`}」`;
}
