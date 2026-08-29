import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentSchema } from "../src/content/schema";
import { mediaKind } from "../src/components/listening/listening-checks";
import { parseYouTubeId, youTubeEmbedUrl, youTubeThumbnail } from "../src/lib/video";

/**
 * 動画（2026-08-29 の 指定「動画ブロック追加」「リスニングも動画の場合も対応できるように」）
 *
 * 見張るのは 2つ:
 *  - **リスニングは 音か 動画の どちらか 1つ**。両方 置けると、どちらが 鳴るかが
 *    データから 読めない——片方が 黙って 無視されるのは 先生から いちばん 見えない
 *    壊れ方なので、保存の 時点で 止める
 *  - **よみものの 動画ブロックは `src` が 要る**。空の まま 保存できると、
 *    学習者の 画面に 黒い 枠だけが 出る
 */

function loadListening(): Record<string, unknown> {
  const raw = readFileSync(
    join(__dirname, "..", "content", "listening", "houkoku_listening.json"),
    "utf8",
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("リスニングの 音と 動画", () => {
  it("音だけの 教材は これまでどおり 通る", () => {
    expect(contentSchema.safeParse(loadListening()).success).toBe(true);
  });

  it("動画だけの 教材も 通る", () => {
    const video = { ...loadListening(), audioUrl: undefined, videoUrl: "/video/x.mp4" };
    expect(contentSchema.safeParse(video).success).toBe(true);
  });

  it("YouTube だけの 教材も 通る", () => {
    const yt = { ...loadListening(), audioUrl: undefined, youtube: "https://youtu.be/dQw4w9WgXcQ" };
    expect(contentSchema.safeParse(yt).success).toBe(true);
  });

  it.each([
    ["音と 動画", { videoUrl: "/video/x.mp4" }],
    ["音と YouTube", { youtube: "https://youtu.be/dQw4w9WgXcQ" }],
  ])("%s の 両方は 置けない", (_name, extra) => {
    const both = { ...loadListening(), ...extra };
    const parsed = contentSchema.safeParse(both);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("どれか 1つだけ");
  });

  it("どちらも 無ければ 台本を 読む 画面（音は 任意の まま）", () => {
    const silent = { ...loadListening(), audioUrl: undefined };
    expect(contentSchema.safeParse(silent).success).toBe(true);
  });
});

describe("mediaKind — 画面が 出す 札を 決める", () => {
  it("動画が あれば 動画", () => {
    expect(mediaKind({ videoUrl: "/video/x.mp4" })).toBe("video");
  });

  it("音だけなら 音", () => {
    expect(mediaKind({ audioUrl: "/audio/x.wav" })).toBe("audio");
  });

  it("どちらも 無ければ none（台本を 読む 画面）", () => {
    expect(mediaKind({})).toBe("none");
  });

  it("両方 来たら 動画（DBに 古い 行が 残って いても 画面を 落とさない）", () => {
    expect(mediaKind({ audioUrl: "/audio/x.wav", videoUrl: "/video/x.mp4" })).toBe("video");
  });

  it("YouTube も 見わけられる", () => {
    expect(mediaKind({ youtube: "https://youtu.be/dQw4w9WgXcQ" })).toBe("youtube");
  });
});

describe("YouTube の 貼り方（先生は 見て いる ページの URL を そのまま 貼る）", () => {
  const ID = "dQw4w9WgXcQ";

  it.each([
    ["ID そのもの", ID],
    ["watch の URL", `https://www.youtube.com/watch?v=${ID}`],
    ["時間つきの watch", `https://www.youtube.com/watch?v=${ID}&t=42s`],
    ["youtu.be の 短い形", `https://youtu.be/${ID}`],
    ["youtu.be ＋ 時間", `https://youtu.be/${ID}?t=42`],
    ["embed", `https://www.youtube.com/embed/${ID}`],
    ["Shorts", `https://www.youtube.com/shorts/${ID}`],
    ["スマホの m.youtube", `https://m.youtube.com/watch?v=${ID}`],
    ["nocookie", `https://www.youtube-nocookie.com/embed/${ID}`],
    ["http で 貼った", `http://www.youtube.com/watch?v=${ID}`],
    ["頭が 無い", `www.youtube.com/watch?v=${ID}`],
    ["前後に 空白", `  https://youtu.be/${ID}  `],
  ])("%s から ID が 取れる", (_name, input) => {
    expect(parseYouTubeId(input)).toBe(ID);
  });

  it.each([
    ["空", ""],
    ["ただの 文", "あとで 貼ります"],
    ["YouTube では ない", "https://vimeo.com/12345"],
    ["v が 無い", "https://www.youtube.com/watch"],
    ["ID が 短い", "https://youtu.be/abc"],
    ["ファイルの パス", "/video/hourensou/x.mp4"],
  ])("%s は 読み取れない（黙って 消さずに 画面で 知らせる）", (_name, input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });

  it("埋め込みは プライバシー強化モード＋日本語字幕を たのむ", () => {
    const url = youTubeEmbedUrl(ID);
    expect(url.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(url).toContain("cc_load_policy=1");
    expect(url).toContain("cc_lang_pref=ja");
    // 押す 前に 鳴らさない（autoplay は 押した ときだけ）
    expect(url).not.toContain("autoplay");
    expect(youTubeEmbedUrl(ID, { autoplay: true })).toContain("autoplay=1");
  });

  it("絵は どの 動画にも ある hqdefault を 使う", () => {
    expect(youTubeThumbnail(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});

describe("よみものの 動画ブロック", () => {
  function articleWith(block: unknown): unknown {
    return {
      kind: "article",
      id: "video_test",
      title: "テスト",
      description: "テストです。",
      blocks: [block],
    };
  }

  it("場所（src）が あれば 通る", () => {
    const ok = articleWith({ kind: "video", src: "/video/x.mp4" });
    expect(contentSchema.safeParse(ok).success).toBe(true);
  });

  it("YouTube でも 通る", () => {
    const ok = articleWith({ kind: "video", youtube: "https://youtu.be/dQw4w9WgXcQ" });
    expect(contentSchema.safeParse(ok).success).toBe(true);
  });

  it("どちらも 空だと 通らない（黒い 枠だけの ブロックを 作らせない）", () => {
    const bad = articleWith({ kind: "video" });
    expect(contentSchema.safeParse(bad).success).toBe(false);
  });

  it("ファイルと YouTube の 両方は 置けない", () => {
    const both = articleWith({ kind: "video", src: "/video/x.mp4", youtube: "abcdefghijk" });
    const parsed = contentSchema.safeParse(both);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("両方は 置けない");
  });

  it("見るところ（note）と 読み上げ用（caption）も 持てる", () => {
    const full = articleWith({
      kind: "video",
      src: "/video/x.mp4",
      poster: "/img/x.webp",
      caption: "そうだんする 場面",
      note: "どこを 見るか を 書きます。",
    });
    expect(contentSchema.safeParse(full).success).toBe(true);
  });

  it("note に ルビHTMLは 書けない（規律2 — ルビは エンジンが 合成する）", () => {
    const ruby = articleWith({
      kind: "video",
      src: "/video/x.mp4",
      note: "<ruby>相談<rt>そうだん</rt></ruby>します。",
    });
    expect(contentSchema.safeParse(ruby).success).toBe(false);
  });
});
