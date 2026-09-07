/**
 * 事前調査の 模擬ページ（`scenario.research.pages[].html`）を 画面へ 出す 前の ふるい。
 *
 * この HTML は **教材データ**で、`/admin` から 先生が 直せる。つまり
 * 「こちらが 書いた 固定の しるし」（quest の 敵SVG）とは 違い、
 * **あとから 中身が 変わりうる 場所**を そのまま innerHTML へ 流すことになる。
 * 先生を 疑うのでは なく、**1回の 貼りまちがい（コピー元に script が 混ざる）で
 * 学習者の 画面が 乗っ取られる 道を 残さない**ため、出す 直前に ふるいを かける。
 *
 * 消すのは 3つだけ:
 *  - 走る タグ（script / style / iframe / object / embed）— 中身ごと
 *  - `on*=` の 属性（onclick・onerror…）
 *  - `javascript:` で 始まる 行き先
 *
 * 見た目の タグ（div / span / ruby / b / img …）と class・style は 残す——
 * 模擬ページは **見た目が 教材**で、旧アプリの class に CSS が 当たっている
 *（`src/components/listening/research-page.module.css`）。
 *
 * 純関数。React も node:fs も 触らないので、サーバでも Worker でも 単体テストでも 動く。
 */

/** 中身ごと 落とすタグ。 */
const DANGEROUS_BLOCKS = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi;

/** 閉じタグの 無い 書き方（`<script src=...>` だけ 置く 形）も 落とす。 */
const DANGEROUS_OPEN = /<\/?(script|style|iframe|object|embed)\b[^>]*>/gi;

/** `on...="..."` / `on...='...'` / `on...=値` のどれも。 */
const EVENT_ATTR = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** `href="javascript:..."` のような 行き先（空白を はさむ 書き方も 見る）。 */
const JS_URL =
  /(href|src|xlink:href)(\s*=\s*(?:"|')?\s*)j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi;

export function sanitizeMockPage(html: string): string {
  return (
    html
      .replace(DANGEROUS_BLOCKS, "")
      .replace(DANGEROUS_OPEN, "")
      .replace(EVENT_ATTR, "")
      // 引用符の 形（" / ' / 無し）を 崩さない ように、**しくみの 名前だけ**取り替える。
      .replace(JS_URL, "$1$2blocked:")
  );
}
