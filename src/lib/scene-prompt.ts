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

/**
 * まなびマップの背景はすべてこの比率。**正方形**にしてあるのは、地図が絵を
 * 画面の形に合わせて切り取る（`object-cover`）ためである。エリアの帯は
 * PCで横長（およそ 1440×680）・スマホで縦長（390×940）なので、縦長の絵を渡すと
 * PCでは真ん中の3割しか残らず、横長の絵を渡すとスマホで真ん中の3割しか残らない。
 * 正方形は そのどちらでも 半分ちかくが残る、いちばんましな形。
 */
export const SCENE_ASPECT = "1:1";

/** 画風の決まり（設計04「あおぞらパスウェイ」・既存のタイルに合わせる）。 */
const STYLE = [
  "highly detailed isometric miniature diorama seen from a high bird's-eye angle",
  "like a tilt-shift toy town or a colourful city-builder game",
  "tiny crisp buildings, tiny trees, tiny boats and vehicles, thin clean outlines",
  "bright saturated cheerful palette, soft even daylight, no harsh shadows, no gloom",
].join(", ");

/**
 * 構図の決まり。**島にしない**のが要点（2026-09-07 の指定「島でなくてOK」）。
 *
 * 以前は「四辺すべてが海」を契約にしていたので、島でない土地まで まるい島になり、
 * まわりの空色の余白ぶんだけ 景色が小さく写っていた。継ぎ目は `CloudBand` の雲海が
 * 完全に覆うので、絵の端がどんな色でも継ぎ目は出ない——島にする必要がそもそも無い。
 *
 * かわりに要るのが**まん中に寄せること**。地図は絵を切り取って出すので、
 * 外側の4分の1は どちらかの画面で消える。
 */
const FRAME = [
  "the land fills the whole square frame and runs off all four edges",
  "never a floating island: no round patch of land ringed by empty water, no flat empty margin",
  "the landmark of the place stands in the centre and fills about the middle third",
  "the outer quarter of the frame is ordinary streets, fields, forest, roofs or water (it may be cropped away)",
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
    `A square ${SCENE_ASPECT} background tile for a language-learning map.`,
    `Scenery: ${subject}.`,
    mood ? `Mood: ${mood}.` : "",
    `Style: ${STYLE}.`,
    `Composition: ${FRAME}.`,
    `Avoid: ${AVOID}.`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}
