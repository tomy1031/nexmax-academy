/**
 * ホバーで 出す 大きい絵を、画面の どこに 置くかの 計算。
 *
 * 見た目から 切り離してあるのは、**ここが 唯一 まちがえる ところ**だから。
 * 画面の 右はしの 絵に のせたとき、右へ 出すと 画面の外に 出て 見えない。
 * 縦も 同じで、下のほうの 絵では はみ出す。DOM が 要らない 計算なので、
 * ここだけ 取り出して 検査できるようにしてある（tests/hover_zoom_spot.test.ts）。
 */

/** 出す絵の 一辺（px）の 上限。画面が 小さい ときは 画面に あわせて 縮める。 */
export const HOVER_ZOOM_MAX_SIZE = 480;
/** 小さい絵と ポップアップの すきま（px）。画面のふちからも これだけ 空ける。 */
export const HOVER_ZOOM_GAP = 12;

export interface HoverZoomSpot {
  left: number;
  top: number;
  size: number;
}

/** 引き金になった 小さい絵の 位置（getBoundingClientRect の 使う ぶんだけ）。 */
export interface TriggerRect {
  left: number;
  right: number;
  top: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * 小さい絵の となりに 置く。右に 入らなければ 左へ、縦は 画面の中へ 押しこむ。
 *
 * 左へ 逃がしても 入らないほど 狭い ときは、ふちに くっつける（Math.max）。
 * 隠れて 何も 見えないより、少し はみ出しても 出ているほうが よい。
 */
export function hoverZoomSpot(rect: TriggerRect, viewport: Viewport): HoverZoomSpot {
  const gap = HOVER_ZOOM_GAP;
  const size = Math.min(HOVER_ZOOM_MAX_SIZE, viewport.width - gap * 2, viewport.height - gap * 2);
  const right = rect.right + gap;
  const left = right + size <= viewport.width ? right : Math.max(gap, rect.left - gap - size);
  const wanted = rect.top + rect.height / 2 - size / 2;
  const top = Math.max(gap, Math.min(wanted, viewport.height - size - gap));
  return { left, top, size };
}
