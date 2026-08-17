/**
 * スライド組版原稿（scripts/slides/<教材ID>/index.html）の機械検査。
 *
 * slides 教材で学習者が実際に読む字の大半は、JSON（title / description / notes）
 * ではなく PDF の中にある。PDF は焼き上がりなので検査できないが、その原稿である
 * この HTML なら検査できる。ここを見ないと、禁止語（規律1）と国名（規律9）は
 * 原稿では人の目だけが頼りになる（2026-08-17 の ai_jidai 検収で実際に
 * 手動確認で代替した穴）。
 *
 * ファイル走査は scripts/lint_content.ts が受け持ち、ここは純関数だけ
 * （checkGeneratedIndex と同じ分担。テストからも直接呼べる）。
 */
import { FORBIDDEN_LEARNER_WORDS } from "../../src/content/schema";
import { checkCountryNamesInTexts, type Finding } from "../../src/lib/content-checks";

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
 * 原稿 HTML から、学習者が PDF で読む文だけを取り出す。
 *
 * - `<rt>`（ルビの読み）は除く。残すと「間違<rt>まちが</rt>いです」のように
 *   表記が読みで分断され、禁止語・国名が**連続した字として見えなくなる**。
 *   除いてからタグを畳むと、元の表記（間違いです）が復元されて検査に掛かる。
 * - `<head>`・`<style>`・`<script>`・コメントは印刷に出ないので除く。
 * - ブロック要素の閉じと `<br>` は改行にする。別の行の字が貼り付くと、
 *   偶然の並びを禁止語・国名と誤認する（誤検出が多い検査は無視されるようになる）。
 */
export function extractManuscriptTexts(html: string): string[] {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, "")
    .replace(/<rp[^>]*>[\s\S]*?<\/rp>/gi, "");
  const flattened = visible
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(?:p|div|h[1-6]|li|ul|ol|section|figure|figcaption|table|tr|td|th|blockquote)>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, "");
  return flattened
    .split("\n")
    .map((line) => line.replace(/&[a-z0-9#]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/**
 * 原稿1枚ぶんの検査（禁止語＋国名）。
 *
 * 判定は JSON 側と同じものを使う: 禁止語は同じ FORBIDDEN_LEARNER_WORDS、
 * 国名は checkCountryNamesInTexts（合意済み・要確認のリストごと共用）。
 * ふりがなの覆い（規律2）はここでは見ない——原稿は `<ruby>` を直書きする決まりで、
 * 覆いの正しさは読み手側でなく組版時に人が見る（render_pdf.mjs 冒頭コメント）。
 */
export function checkManuscript(file: string, html: string): Finding[] {
  const texts = extractManuscriptTexts(html);
  const findings: Finding[] = [];
  for (const text of texts) {
    for (const word of FORBIDDEN_LEARNER_WORDS) {
      const at = text.indexOf(word);
      if (at < 0) continue;
      const near = text.slice(Math.max(0, at - 12), at + word.length + 12);
      findings.push({
        file,
        level: "error",
        message: `禁止語「${word}」が 原稿にある: 「…${near}…」 — フィードバックは励まし＋次の行動に（P8）`,
      });
    }
  }
  findings.push(...checkCountryNamesInTexts(file, texts));
  return findings;
}
