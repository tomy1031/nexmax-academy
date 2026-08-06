import { describe, expect, it } from "vitest";
import { RESERVED_STAGE_IDS, stageSchema } from "../src/content/schema";
import {
  CONTENT_SEGMENTS,
  resolveStageContent,
  stageContentPath,
  stageContentSegments,
  stageRefPath,
} from "../src/lib/stage-routes";
import type { StageContentRef } from "../src/content/schema";

const ONE: StageContentRef[] = [
  { ref: "m2-asakai-manga", type: "manga" },
  { ref: "sample_asakai", type: "listening" },
];

const TWO_LISTENINGS: StageContentRef[] = [
  { ref: "m2-asakai-manga", type: "manga" },
  { ref: "listen-a", type: "listening" },
  { ref: "listen-b", type: "listening" },
];

describe("stageContentPath", () => {
  it("種別が1つなら ID を付けない", () => {
    expect(stageContentPath("asakai", ONE, 0)).toBe("/asakai/manga");
    expect(stageContentPath("asakai", ONE, 1)).toBe("/asakai/listening");
  });

  it("同じ種別が2つ以上あるときだけ ID を足す", () => {
    expect(stageContentPath("asakai", TWO_LISTENINGS, 0)).toBe("/asakai/manga");
    expect(stageContentPath("asakai", TWO_LISTENINGS, 1)).toBe("/asakai/listening-listen-a");
    expect(stageContentPath("asakai", TWO_LISTENINGS, 2)).toBe("/asakai/listening-listen-b");
  });

  it("範囲外は null", () => {
    expect(stageContentPath("asakai", ONE, 9)).toBeNull();
  });

  it("ref から引ける", () => {
    expect(stageRefPath("asakai", TWO_LISTENINGS, "listen-b")).toBe("/asakai/listening-listen-b");
    expect(stageRefPath("asakai", TWO_LISTENINGS, "nope")).toBeNull();
  });
});

describe("resolveStageContent", () => {
  it("組み立てたURLをそのまま読み戻せる", () => {
    for (const contents of [ONE, TWO_LISTENINGS]) {
      contents.forEach((item, index) => {
        const path = stageContentPath("asakai", contents, index)!;
        const segment = path.slice("/asakai/".length);
        expect(resolveStageContent(contents, segment)).toEqual(item);
      });
    }
  });

  it("種別だけのURLは その種別の最初の1つを指す", () => {
    expect(resolveStageContent(TWO_LISTENINGS, "listening")).toEqual(TWO_LISTENINGS[1]);
  });

  it("IDに - が入っていても種別を取り違えない", () => {
    expect(resolveStageContent(ONE, "manga-m2-asakai-manga")).toEqual(ONE[0]);
  });

  it("そのステージに無いものは null", () => {
    expect(resolveStageContent(ONE, "quiz")).toBeNull();
    expect(resolveStageContent(ONE, "listening-listen-b")).toBeNull();
    expect(resolveStageContent(ONE, "unknown")).toBeNull();
  });

  it("種別の名前どうしが前方一致しない（読み取りが壊れる条件）", () => {
    const segments = Object.values(CONTENT_SEGMENTS);
    for (const a of segments) {
      for (const b of segments) {
        if (a !== b) expect(b.startsWith(`${a}-`)).toBe(false);
      }
    }
  });
});

describe("stageContentSegments", () => {
  it("教材の数だけ 重複なく返す", () => {
    const segments = stageContentSegments(TWO_LISTENINGS);
    expect(segments).toEqual(["manga", "listening-listen-a", "listening-listen-b"]);
    expect(new Set(segments).size).toBe(segments.length);
  });
});

describe("ステージIDの予約語", () => {
  const base = {
    kind: "stage" as const,
    order: 1,
    title: "ほうこく",
    reading: "ほうこく",
    description: "せつめい",
    color: "sky" as const,
    status: "published" as const,
    contents: [{ ref: "x", type: "manga" as const }],
    wordStageIds: [],
  };

  it("アプリが使っている名前は保存できない", () => {
    for (const id of RESERVED_STAGE_IDS) {
      expect(stageSchema.safeParse({ ...base, id }).success).toBe(false);
    }
  });

  it("ふつうの名前は通る", () => {
    expect(stageSchema.safeParse({ ...base, id: "houkoku" }).success).toBe(true);
  });

  it("URLの1段目に出てくる名前を取りこぼしていない", () => {
    // 教材のURLの2段目に使う語がステージIDになっても衝突はしないが、
    // /listening や /quiz は1段目の実ルートなので予約されていること
    for (const reserved of ["map", "admin", "arcade", "listening", "quiz", "talk"]) {
      expect(RESERVED_STAGE_IDS).toContain(reserved);
    }
  });
});
