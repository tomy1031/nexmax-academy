import { describe, expect, it } from "vitest";
import {
  HOVER_ZOOM_GAP as GAP,
  HOVER_ZOOM_MAX_SIZE as MAX,
  hoverZoomSpot,
  type TriggerRect,
} from "../src/components/studio/hover-zoom-spot";

/** ふつうの ノートPC。 */
const SCREEN = { width: 1440, height: 900 };

/** 80px の サムネイル。left を 決めれば 位置が 決まる。 */
const thumb = (left: number, top: number): TriggerRect => ({
  left,
  right: left + 80,
  top,
  height: 80,
});

describe("hoverZoomSpot", () => {
  it("ふつうは 絵の 右どなりに 出す", () => {
    const spot = hoverZoomSpot(thumb(100, 300), SCREEN);
    expect(spot.left).toBe(180 + GAP);
    expect(spot.size).toBe(MAX);
  });

  it("右に 入らない ときは 左に 逃がす（画面の外に 出さない）", () => {
    const spot = hoverZoomSpot(thumb(1300, 300), SCREEN);
    expect(spot.left).toBe(1300 - GAP - MAX);
    expect(spot.left + spot.size).toBeLessThanOrEqual(SCREEN.width);
  });

  it("上のほうの 絵でも 画面の上に はみ出さない", () => {
    const spot = hoverZoomSpot(thumb(100, 0), SCREEN);
    expect(spot.top).toBe(GAP);
  });

  it("下のほうの 絵でも 画面の下に はみ出さない", () => {
    const spot = hoverZoomSpot(thumb(100, SCREEN.height - 80), SCREEN);
    expect(spot.top + spot.size).toBeLessThanOrEqual(SCREEN.height - GAP);
  });

  it("画面が 小さい ときは 画面に あわせて 縮める", () => {
    const small = { width: 390, height: 700 };
    const spot = hoverZoomSpot(thumb(20, 200), small);
    expect(spot.size).toBe(small.width - GAP * 2);
    expect(spot.left).toBeGreaterThanOrEqual(0);
    expect(spot.left + spot.size).toBeLessThanOrEqual(small.width);
  });

  it("どんな 場所でも 大きい絵は 小さい絵より 大きい", () => {
    for (const left of [0, 400, 900, 1360]) {
      for (const top of [0, 400, 860]) {
        expect(hoverZoomSpot(thumb(left, top), SCREEN).size).toBeGreaterThan(80);
      }
    }
  });
});
