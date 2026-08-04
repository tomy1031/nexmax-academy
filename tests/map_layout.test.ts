import { describe, expect, it } from "vitest";
import {
  BASE_STOP_COUNT,
  characterSlots,
  mapGeometry,
  routePath,
  stopPositions,
} from "@/lib/map-layout";

/** routePath と同じ丸めかたで座標を文字にする（d の中を探すため）。 */
const fixed2 = (value: number): string => String(Number(value.toFixed(2)));

describe("stopPositions", () => {
  it("たのまれた数だけ停留所を返す", () => {
    expect(stopPositions(2)).toHaveLength(2);
    expect(stopPositions(5)).toHaveLength(5);
    expect(stopPositions(12)).toHaveLength(12);
  });

  it("上から下へ、かならず順番に下がっていく", () => {
    // 逆戻りすると、学習者には「道を戻る地図」に見える。
    for (const count of [1, 2, 5, 8, 20]) {
      const ys = stopPositions(count).map((stop) => stop.y);
      for (let i = 1; i < ys.length; i += 1) {
        expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
      }
    }
  });

  it("何個ふえてもマップの中に収まる", () => {
    // 0未満・100超に出ると、そのステージのピンは画面外で永久に押せなくなる。
    for (const count of [1, 3, 6, 10, 30]) {
      for (const stop of stopPositions(count)) {
        expect(stop.y).toBeGreaterThan(0);
        expect(stop.y).toBeLessThan(100);
        expect(stop.x).toBeGreaterThan(0);
        expect(stop.x).toBeLessThan(100);
      }
    }
  });

  it("右・左・右…と交互にふれる", () => {
    const xs = stopPositions(7).map((stop) => stop.x);
    xs.forEach((x, index) => {
      if (index % 2 === 0) expect(x).toBeGreaterThan(50);
      else expect(x).toBeLessThan(50);
    });
  });

  it("5個のときは今までの見た目から大きくずれない", () => {
    // 既存マップの実測値。ここが大きく動くと背景画像と停留所の位置がちぐはぐになる。
    const legacy = [
      { x: 58, y: 20 },
      { x: 41, y: 34 },
      { x: 62, y: 49 },
      { x: 39, y: 65 },
      { x: 58, y: 80 },
    ];
    const stops = stopPositions(5);

    stops.forEach((stop, index) => {
      expect(Math.abs(stop.y - legacy[index]!.y)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(stop.x - legacy[index]!.x)).toBeLessThanOrEqual(3);
    });
  });

  it("0個なら空 — 停留所ゼロでも計算が落ちない", () => {
    expect(stopPositions(0)).toEqual([]);
  });
});

describe("mapGeometry — 1ステージ = 1枚の絵", () => {
  const BASE_STEPS = [1, 2, 3, 4, 5];

  it("STEP 5 までなら、いままでの並べ方と同じ座標になる", () => {
    // 帯を増やさない限り、元の3枚の絵の上での立ち位置は1ミリも動かさない。
    const geometry = mapGeometry(BASE_STEPS, 3);
    expect(geometry.bandCount).toBe(3);
    expect(geometry.stops).toEqual(stopPositions(5));
  });

  it("STEP 6 を足すと帯が1つ増え、停留所は自分の帯のまんなかに立つ", () => {
    const geometry = mapGeometry([...BASE_STEPS, 6], 3);
    expect(geometry.bandCount).toBe(4);
    expect(geometry.stops).toHaveLength(6);
    // 4帯のうち4つめの帯: 75%〜100%。そのまんなか = 87.5。
    expect(geometry.stops[5]!.y).toBeCloseTo(87.5, 5);
  });

  it("下にステージが増えても、STEP 1〜5 の絵の上での立ち位置は動かない", () => {
    // y は「マップ全体の％」なので、マップが伸びると値は縮む。ただし
    // 帯の座標（y × 帯数 ÷ 100 = 何枚めの絵のどこか）は変わらないこと。
    const before = mapGeometry(BASE_STEPS, 3);
    const after = mapGeometry([...BASE_STEPS, 6, 7], 3);
    before.stops.forEach((stop, i) => {
      const bandBefore = (stop.y * before.bandCount) / 100;
      const bandAfter = (after.stops[i]!.y * after.bandCount) / 100;
      expect(bandAfter).toBeCloseTo(bandBefore, 5);
      expect(after.stops[i]!.x).toBe(stop.x);
    });
  });

  it("左右のつづら折りは STEP 6 以降も続く", () => {
    const { stops } = mapGeometry([1, 2, 3, 4, 5, 6, 7, 8], 3);
    stops.forEach((stop, index) => {
      if (index % 2 === 0) expect(stop.x).toBeGreaterThan(50);
      else expect(stop.x).toBeLessThan(50);
    });
  });

  it("step がとびとび（6が無くて8だけ）でも帯と停留所は1対1", () => {
    const geometry = mapGeometry([1, 2, 8], 3);
    expect(geometry.bandCount).toBe(4);
    expect(geometry.stops).toHaveLength(3);
    expect(geometry.stops[2]!.y).toBeCloseTo(87.5, 5);
  });

  it("元の絵が0枚でもグラデーションの帯を1つ確保する", () => {
    // 0にすると高さが消え、停留所が団子になってマップとして読めなくなる。
    const geometry = mapGeometry([1, 2], 0);
    expect(geometry.bandCount).toBe(1);
    for (const stop of geometry.stops) {
      expect(stop.y).toBeGreaterThan(0);
      expect(stop.y).toBeLessThan(100);
    }
  });

  it("BASE_STOP_COUNT は元の3枚の絵が受け持つ 5", () => {
    // ここが変わると「どの step から絵が1枚いるか」の境目がずれ、
    // 検査（checkStageSteps）と画面の帯割りが食い違う。
    expect(BASE_STOP_COUNT).toBe(5);
  });
});

describe("routePath", () => {
  it("マップの上端から始まり下端で終わる", () => {
    const d = routePath(stopPositions(6));
    expect(d.startsWith("M 50 0")).toBe(true);
    expect(d.endsWith("50 100")).toBe(true);
  });

  it("道はすべての停留所の上を通る", () => {
    // 通らないと、点線とピンがずれた地図になる（どこへ進むのか読めなくなる）。
    for (const count of [1, 5, 8]) {
      const stops = stopPositions(count);
      const d = routePath(stops);
      for (const stop of stops) {
        expect(d).toContain(`${fixed2(stop.x)} ${fixed2(stop.y)}`);
      }
    }
  });

  it("停留所が0個でも道は消えない", () => {
    const d = routePath([]);
    expect(d.startsWith("M 50 0")).toBe(true);
    expect(d).toContain("C ");
    expect(d.endsWith("50 100")).toBe(true);
  });

  it("数値は小数2桁まで — 桁あふれで d が読めなくならない", () => {
    const d = routePath(stopPositions(7));
    for (const token of d.split(" ")) {
      if (token === "M" || token === "C") continue;
      expect(token).toMatch(/^-?\d+(\.\d{1,2})?$/);
    }
  });

  it("道は停留所の外がわへふくらむ — 直線にすると道のりの長さが伝わらない", () => {
    // 元の手描きの道は制御点が x=82 や x=20 まで振れていた。点を内がわで
    // なめらかに結ぶだけにすると、つづら折りが消えてほぼ縦線になる。
    for (const count of [3, 5, 8]) {
      const stops = stopPositions(count);
      const controlXs = controlPoints(routePath(stops)).map((point) => point.x);
      const right = Math.max(...stops.map((stop) => stop.x));
      const left = Math.min(...stops.map((stop) => stop.x));
      expect(Math.max(...controlXs)).toBeGreaterThan(right + 5);
      expect(Math.min(...controlXs)).toBeLessThan(left - 5);
    }
  });

  it("ふくらみは画面の外へ出ない — 端で道が切れて見えてしまう", () => {
    for (const count of [1, 2, 5, 12, 30]) {
      for (const point of controlPoints(routePath(stopPositions(count)))) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(100);
      }
    }
  });
});

/** d 属性から C コマンドの制御点だけを取り出す（ふくらみ具合を測るため）。 */
function controlPoints(d: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const match of d.matchAll(/C ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)/g)) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
    points.push({ x: Number(match[3]), y: Number(match[4]) });
  }
  return points;
}

describe("characterSlots", () => {
  it("最後の停留所のぶんは作らない", () => {
    // ゴール手前は画面の下端に近く、キャラを置くと見きれる。
    expect(characterSlots(stopPositions(5))).toHaveLength(4);
    expect(characterSlots(stopPositions(8))).toHaveLength(7);
    expect(characterSlots(stopPositions(1))).toHaveLength(0);
    expect(characterSlots([])).toHaveLength(0);
  });

  it("停留所の外がわ・すこし下に立つ", () => {
    // 内がわに来るとピンや点線に重なって、押せるはずのピンが押せなくなる。
    const stops = stopPositions(6);
    const slots = characterSlots(stops);

    slots.forEach((slot, index) => {
      const stop = stops[index]!;
      if (stop.x > 50) expect(slot.x).toBeGreaterThan(stop.x);
      else expect(slot.x).toBeLessThan(stop.x);
      expect(slot.y).toBeGreaterThan(stop.y);
    });
  });

  it("停留所が何個でも画面の外へ出ない", () => {
    for (const count of [2, 5, 9, 16, 40]) {
      for (const slot of characterSlots(stopPositions(count))) {
        expect(slot.x).toBeGreaterThanOrEqual(0);
        expect(slot.x).toBeLessThanOrEqual(100);
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.y).toBeLessThanOrEqual(100);
      }
    }
  });
});
