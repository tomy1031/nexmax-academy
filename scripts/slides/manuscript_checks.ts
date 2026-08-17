/**
 * スライド組版原稿（scripts/slides/<教材ID>/index.html）の機械検査。
 *
 * slides 教材で学習者が実際に読む字の大半は、JSON（title / description / notes）
 * ではなく PDF の中にある。PDF は焼き上がりなので検査できないが、その原稿である
 * この HTML なら検査できる。ここを見ないと、禁止語（規律1）と国名（規律9）は
 * 原稿では人の目だけが頼りになる（2026-08-17 の ai_jidai 検収で実際に
 * 手動確認で代替した穴）。
 *
 * ファイル走査は scripts/lint_content.ts が受け持ち、ここは純関数だけ。
 * 語のリストと判定は src/lib/content-checks.ts の …InTexts 入口を共用する
 * （原稿側が別の判定を持つと、リストやガードの更新が片方だけに落ちる）。
 * このファイル自体を scripts/ に置くのは、原稿がこのリポジトリにしか無い
 * （スタジオからは見えない）ためで、fs に依存しているからではない。
 */
import {
  checkCountryNamesInTexts,
  checkForbiddenWordsInTexts,
  type Finding,
} from "../../src/lib/content-checks";

/** &…; の実体参照。原稿で使うぶんだけ戻す（一般の HTML を受ける入口ではない）。 */
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * 行を分けずに残す（前後の字と貼り付いたままにする）タグ。ruby の表記を
 * 復元するための一覧で、**ここに無いタグはすべて改行になる**。既定を
 * 「分ける」側に倒すのは、知らないタグで行が貼り付くと、カタカナ境界の
 * ガードが狂って国名検査が黙る（逆に偽エラーも出る）ため。
 */
const INLINE_TAGS = /^(?:a|b|code|em|i|rp|rt|ruby|small|span|strong|sub|sup|u)$/i;

/**
 * 属性値の中の `>`（title="人 > AI" など）で切れない開始タグ・自己完結タグの形。
 * 引用符の中を丸ごと読み飛ばしてから `>` を探す。
 */
const TAG = /<[a-zA-Z!/][^>"']*(?:"[^"]*"[^>"']*|'[^']*'[^>"']*)*>/g;

/**
 * `<style>` の中でも `content: "…"` の文字列だけは PDF に印字される
 * （実原稿の `.pageno::before { content: counter(slide) " / 22"; }` が現用）。
 * style を捨てる前に、その文字列を検査対象として抜き出す。
 * 直前に英字やハイフンが無い content だけ拾う（justify-content 等を除く）。
 */
function extractCssContentStrings(html: string): string[] {
  const out: string[] = [];
  for (const style of html.match(/<style[\s\S]*?<\/style>/gi) ?? []) {
    for (const decl of style.match(/(?<![a-zA-Z-])content\s*:[^;}]*/g) ?? []) {
      for (const quoted of decl.match(/"[^"]*"|'[^']*'/g) ?? []) {
        out.push(quoted.slice(1, -1));
      }
    }
  }
  return out;
}

/**
 * 原稿 HTML から、学習者が PDF で読む文だけを取り出す。
 *
 * - `<rt>`（ルビの読み）は除く。残すと「間違<rt>まちが</rt>いです」のように
 *   表記が読みで分断され、禁止語・国名が**連続した字として見えなくなる**。
 *   除いてからタグを畳むと、元の表記（間違いです）が復元されて検査に掛かる。
 *   閉じタグは HTML5 では省略できる（Chromium は省略でも正しく描く）ので、
 *   `</rt>` を待たず**次の rt/rp か `</ruby>` まで**を読みとして除く。
 * - `<head>`・`<style>`・`<script>`・コメントは印刷に出ないので除く
 *   （style の `content:` 文字列だけは上で先に拾う）。
 * - `<br>` と、INLINE_TAGS 以外の閉じタグは改行にする。別の行の字が貼り付くと、
 *   偶然の並びを禁止語・国名と誤認する（誤検出が多い検査は無視されるようになる）。
 */
export function extractManuscriptTexts(html: string): string[] {
  const cssTexts = extractCssContentStrings(html);
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<r[tp][^>]*>[\s\S]*?(?=<\/?r[tp][\s>]|<\/ruby[\s>]|$)/gi, "")
    .replace(/<\/r[tp]\s*>/gi, "");
  const flattened = visible
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (_, tag: string) =>
      INLINE_TAGS.test(tag) ? "" : "\n",
    )
    .replace(TAG, "");
  return [...flattened.split("\n"), ...cssTexts]
    .map((line) => line.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/**
 * 原稿1枚ぶんの検査（禁止語＋国名）。判定は JSON 側と同じ …InTexts 入口を使う。
 *
 * ふりがなの覆い（規律2）はここでは見ない——原稿は `<ruby>` を直書きする決まりで
 * （render_pdf.mjs 冒頭コメント）、読み辞書という仕組みが無い。ルビの無い漢字の
 * 検査は別の形になるため、この検査には含めていない。
 */
export function checkManuscript(file: string, html: string): Finding[] {
  const texts = extractManuscriptTexts(html);
  return [...checkForbiddenWordsInTexts(file, texts), ...checkCountryNamesInTexts(file, texts)];
}
