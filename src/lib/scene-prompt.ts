/**
 * エリアの絵（ステージの背景）を作るときのプロンプト
 *
 * 先生が書くのは「どんな景色か」だけにする。画風・比率・入れてはいけないものは
 * 毎回同じでなければならない——1枚だけ画風の違う土地があると、地図をスクロールした
 * ときにそこで世界が切れる。だから決まりの部分はここに1つだけ置く。
 *
 * **国名を入れない**（AGENTS.md 規律9）。地図のエリアは景色の名前で呼ぶ決まりなので、
 * 絵の指示にも国名を持ち込まない。文字を描かせないのも同じ理由——絵の中の文字は
 * 差し替えられないし、学習者が読めない言語が混ざる。
 *
 * 純関数。テストから直接読める（tests/scene_prompt.test.ts）。
 */

/** まなびマップの背景はすべてこの比率。地図は縦にスクロールする。 */
export const SCENE_ASPECT = "3:4";

/** 画風の決まり（設計04「あおぞらパスウェイ」）。 */
const STYLE = [
  "children's-book style digital illustration, soft gouache texture",
  "bright airy palette: sky blue, warm sand, fresh leaf green",
  "gentle rounded shapes, no harsh shadows, no dark or cyberpunk mood",
  "wide aerial vista seen from a plane, horizon in the upper third",
  "top 10% and bottom 10% fading into flat pale sky blue so the tiles join seamlessly",
].join(", ");

/** 入れてはいけないもの。 */
const AVOID = [
  "no text, letters, numbers or signage of any language",
  "no country names, flags, or national symbols",
  "no people in the foreground, no characters, no logos",
  "no borders, no frame, no watermark",
].join(", ");

/**
 * 先生の書いた景色の説明から、そのまま画像生成に渡せる指示文を組み立てる。
 * `note`（地図に添える一言）は雰囲気の手がかりとして足す。空でもよい。
 */
export function buildScenePrompt(scenery: string, note = ""): string {
  const subject = scenery.trim();
  const mood = note.trim();
  return [
    `A vertical ${SCENE_ASPECT} background tile for a language-learning map.`,
    `Scenery: ${subject}.`,
    mood ? `Mood: ${mood}.` : "",
    `Style: ${STYLE}.`,
    `Avoid: ${AVOID}.`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
