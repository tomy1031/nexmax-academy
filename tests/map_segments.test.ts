import { describe, expect, it } from "vitest";
import { parseMapSegments } from "../src/lib/map-segments";

/**
 * マップの背景セグメントの走査。
 *
 * ここが崩れると、先生が画像を1枚置いてもマップが伸びない（停留所がふえない）か、
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
