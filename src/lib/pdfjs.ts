/**
 * pdf.js の読み込み（ブラウザ専用）
 *
 * スライド教材は PDF を**ブラウザの中で**描く。サーバで画像に変換する道は
 * 採っていない（Cloudflare Workers に変換の置き場が無い — schema.ts の slidesSchema）。
 *
 * ## バンドルに入れない
 * `import "pdfjs-dist"` と書くと、Turbopack は client 用と SSR 用の**両方**に
 * 500KB の束を作る。SSR 側は Cloudflare Workers に載る手荷物になるが、サーバは
 * canvas を1枚も描かないので まるごと むだである（載せられるのは圧縮して3MBまで。
 * docs/constraints.md「無料枠内で運用する」）。
 *
 * そこで実物を public/ に置き（scripts/copy_pdf_worker.mjs が写す）、
 * **開いた人のブラウザだけが取りに行く**形にする。URL を変数にしてあるのは、
 * バンドラに「これは自分の仕事ではない」と分からせるため——文字列で直に書くと、
 * 取り込もうとして 解決に失敗する。
 *
 * 学習者の画面（スライドを見る）と 先生の画面（枚数を数える）で**同じものを読む**。
 * 別のやり方で開くと「スタジオでは 12まいと 出たのに 学習者の画面では ひらかない」が起こる。
 */

// 型だけを借りる（`import type` はコンパイルで消えるので、束には1バイトも入らない）。
import type * as Pdfjs from "pdfjs-dist";

/** pdf.js 一式の置き場（worker・cmaps・standard_fonts も同じ所）。 */
export const PDFJS_DIR = "/pdfjs";

type PdfjsModule = typeof Pdfjs;

/** pdf.js 本体（legacy ビルド＝古い端末でも動くように変換ずみ）。 */
export async function loadPdfjs(): Promise<PdfjsModule> {
  const url = `${PDFJS_DIR}/pdf.min.mjs`;
  const pdfjs = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ url
  )) as PdfjsModule;
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_DIR}/pdf.worker.min.mjs`;
  return pdfjs;
}

/**
 * 日本語のPDFを 白いまま出さないための設定。
 *
 * PDF が「この文字は書体のここ」という対応表（cmap）を**自分の中に持たず**、
 * 名前で呼んでいることがある（日本語のPDFでよくある）。渡しておかないと、
 * 本文が まるごと 出ない資料が混じる。
 */
export const PDFJS_FONT_OPTIONS = {
  cMapUrl: `${PDFJS_DIR}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_DIR}/standard_fonts/`,
} as const;
