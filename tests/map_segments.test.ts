import { describe, expect, it } from "vitest";
import { composeMapBands, parseMapSegments } from "../src/lib/map-segments";

/**
 * マップの背景セグメントの走査と帯の合成。
 *
 * ここが崩れると、先生が画像を1枚置いてもマップが伸びない（ステップを足せない）か、
 * 逆に地図でない絵が途中の段に入り、学習者は道をたどれなくなる。
 * fs はモックせず、ファイル名の一覧を渡す純関数として確かめる。
 */

const names = (fileNames: string[]) => parseMapSegments(fileNames).map((s) => s.slug);

describe("背景セグメントの並び", () => {
  it("連番の順に並べる（ファイル名を渡した順ではない）", () => {
    expect(names(["map_seg3_coast.webp", "map_seg1_cambodia.webp", "map_seg2_ocean.webp"])).toEqual(
      ["cambodia", "ocean", "coast"],
    );
  });

  it("10枚目は9枚目のあと（文字列順だと seg10 が seg2 の前に来て地形が入れ替わる）", () => {
    const parsed = parseMapSegments(["map_seg10_x.webp", "map_seg2_ocean.webp", "map_seg9_x.webp"]);
    expect(parsed.map((s) => s.order)).toEqual([2, 9, 10]);
  });

  it("同じ番号が2枚あってもファイル名順で決着する（readdir の順はOS任せのため）", () => {
    const forward = names(["map_seg2_beta.webp", "map_seg2_alpha.webp"]);
    const reversed = names(["map_seg2_alpha.webp", "map_seg2_beta.webp"]);
    expect(forward).toEqual(["alpha", "beta"]);
    expect(reversed).toEqual(forward);
  });
});

describe("背景に使うファイルの選びわけ", () => {
  it("map_seg で始まらない画像は背景にしない（地図でない絵が段に挟まる）", () => {
    expect(
      parseMapSegments([
        "map_cambodia.webp",
        "japan_goal.webp",
        "title_keyart.webp",
        "welcome_bg.webp",
      ]),
    ).toEqual([]);
  });

  it("webp 以外の画像も拾う（先生の手元の書き出し形式をしばらない）", () => {
    expect(
      names(["map_seg1_a.png", "map_seg2_b.jpg", "map_seg3_c.jpeg", "map_seg4_d.avif"]),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("画像でないファイルは拾わない（.txt や .DS_Store が段になると真っ白になる）", () => {
    expect(parseMapSegments(["map_seg1_note.txt", ".DS_Store", "map_seg2_ocean.md"])).toEqual([]);
  });
});

describe("公開パス", () => {
  it("src はファイル名をそのまま /img/scenes/ の下に置いた形にする", () => {
    const parsed = parseMapSegments(["map_seg3_coast.webp"]);
    expect(parsed[0]?.src).toBe("/img/scenes/map_seg3_coast.webp");
    expect(parsed[0]?.order).toBe(3);
    expect(parsed[0]?.slug).toBe("coast");
  });
});

describe("ステップの絵（map_step）", () => {
  const TRIO = ["map_seg1_cambodia.webp", "map_seg2_ocean.webp", "map_seg3_coast.webp"];

  it("map_step は kind: step で拾い、番号は受け持つ STEP になる", () => {
    const parsed = parseMapSegments(["map_step6_tokyo.webp"]);
    expect(parsed[0]).toEqual({
      kind: "step",
      order: 6,
      slug: "tokyo",
      src: "/img/scenes/map_step6_tokyo.webp",
    });
  });

  it("元の絵（map_seg）が先、ステップの絵が後に並ぶ", () => {
    const parsed = parseMapSegments(["map_step6_tokyo.webp", ...TRIO]);
    expect(parsed.map((s) => s.kind)).toEqual(["base", "base", "base", "step"]);
  });
});

describe("帯の合成（composeMapBands）", () => {
  const TRIO = ["map_seg1_cambodia.webp", "map_seg2_ocean.webp", "map_seg3_coast.webp"];
  const compose = (files: string[], steps: number[]) =>
    composeMapBands(parseMapSegments(files), steps);

  it("STEP 5 までなら帯は元の絵だけ（いままでと同じ3枚）", () => {
    const { bands, baseBandCount } = compose(TRIO, [1, 2, 3, 4, 5]);
    expect(bands.map((b) => b.src)).toEqual([
      "/img/scenes/map_seg1_cambodia.webp",
      "/img/scenes/map_seg2_ocean.webp",
      "/img/scenes/map_seg3_coast.webp",
    ]);
    expect(baseBandCount).toBe(3);
  });

  it("STEP 6 の絵を置くと、その帯が元の絵のあとに足される", () => {
    const { bands } = compose([...TRIO, "map_step6_tokyo.webp"], [1, 2, 3, 4, 5, 6]);
    expect(bands).toHaveLength(4);
    expect(bands[3]?.src).toBe("/img/scenes/map_step6_tokyo.webp");
  });

  it("絵がまだ無い STEP 6 の帯は src: null（ステージは消さず、色だけの帯で出す）", () => {
    const { bands } = compose(TRIO, [1, 2, 3, 4, 5, 6]);
    expect(bands).toHaveLength(4);
    expect(bands[3]?.src).toBeNull();
    expect(bands[3]?.id).toBe("step-6");
  });

  it("帯はステージの step の並びに従う（絵だけあってステージが無い step は帯にならない）", () => {
    // 絵が先に届いてもマップは伸びない。伸びるのはステージを公開したとき。
    const { bands } = compose([...TRIO, "map_step9_osaka.webp"], [1, 2, 3]);
    expect(bands).toHaveLength(3);
  });

  it("元の絵が1枚も無くてもグラデーションの帯を1つ確保する", () => {
    const { bands, baseBandCount } = compose([], [1, 2, 6]);
    expect(baseBandCount).toBe(1);
    expect(bands.map((b) => b.src)).toEqual([null, null]);
    expect(bands[0]?.id).toBe("base-fallback");
  });

  it("STEP 5 以下に map_step の絵が置かれても使わない（元の3枚が優先）", () => {
    const { bands } = compose([...TRIO, "map_step3_x.webp"], [1, 2, 3, 4, 5]);
    expect(bands).toHaveLength(3);
    expect(bands.every((b) => b.src?.includes("map_seg"))).toBe(true);
  });
});
