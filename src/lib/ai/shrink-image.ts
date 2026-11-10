/**
 * 送る 前に 画像を 縮める（画像の デザイン判定・要望 #713）
 *
 * スクリーンショットは そのままだと 2〜8MB・長い 辺が 2000〜3000px に なる。Claude は 大きい 画像を
 * 自分で 縮める が、**送る 道の ぶん**（学生の 回線・関数の 受けとりの 上限）は 減らない。
 * だから 画面の 側で **長い 辺 1280px 以下の JPEG** に してから 送る（1枚 約1,200トークン・
 * 1回 約0.05円）。PNG・WebP・JPEG を 受ける（HEIC は 多くの ブラウザで 開けない ので 受けない）。
 *
 * 縦に 長い 画面（ページ 全体の スクリーンショット）は 長い 辺で 縮めると 字が 読めなく なる
 * ことが ある。判定が 見るのは 色・余白・文字の 形・写真の 感じ なので、それで 足りる。
 */

/** 受けとる 画像の 形（`<input accept>` にも 使う）。 */
export const SHRINK_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;

/** 縮めた あとの 長い 辺。 */
export const SHRINK_MAX_EDGE = 1280;

/** 開く 前に 断る 大きさ（これより 大きい ファイルは 端末が 重く なる）。 */
export const SHRINK_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** JPEG の 画質。 */
const JPEG_QUALITY = 0.82;

/** 長い 辺が `max` 以下に なる 大きさ（小さい 画像は そのまま）。 */
export function fitWithin(
  width: number,
  height: number,
  max: number = SHRINK_MAX_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long <= 0) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type ShrinkResult =
  | {
      readonly ok: true;
      /** base64（頭の `data:image/jpeg;base64,` は 付けない）。 */
      readonly data: string;
      readonly mediaType: "image/jpeg";
      /** 画面に 出す 見本（data URL）。 */
      readonly previewUrl: string;
      readonly width: number;
      readonly height: number;
    }
  | { readonly ok: false; readonly reason: "type" | "size" | "decode" };

/** ファイルを 縮めた JPEG に する。 */
export async function shrinkImage(file: File): Promise<ShrinkResult> {
  if (!(SHRINK_ACCEPT as readonly string[]).includes(file.type))
    return { ok: false, reason: "type" };
  if (file.size > SHRINK_MAX_FILE_BYTES) return { ok: false, reason: "size" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, reason: "decode" };
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { ok: false, reason: "decode" };
    // 透明な ところ（PNG）は JPEG で 黒く なる ので、先に 白で 塗る
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const previewUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const data = previewUrl.slice(previewUrl.indexOf(",") + 1);
    if (data === "") return { ok: false, reason: "decode" };
    return { ok: true, data, mediaType: "image/jpeg", previewUrl, width, height };
  } finally {
    bitmap.close();
  }
}
