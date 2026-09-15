/**
 * セリフ（かな）→ 口の 形の 並び（1モーラ 1コマ）
 *
 * ## なぜ要るか
 * 作り置きの 声を 鳴らす とき、口の 形を「母音を 順に 送る」だけに すると、
 * **言って いる ことばと 口が 関係なく 動く**（「おはよう」でも あいうえお）。
 * 声の 何割まで 進んだかが 分かれば、セリフの **その 位置の 音**の 形を 出せる。
 * そのために、セリフを **時間の 長さが だいたい そろった 区切り（モーラ）**に 並べる。
 *
 * ## 1コマに 数える もの
 * - かな 1字 … その 母音（カタカナも ひらがなに 直して 読む。ヘンディ・ミーティング）
 * - 小さい ゃゅょぁぃぅぇぉ … **前の 字と 合わせて 1モーラ**（きゃ＝1つ）。前の コマの 形を 置きかえる
 * - ー … 前の 形を のばす
 * - っ … いったん 閉じる
 * - ん … 閉じる（くちびるを 合わせる 音に 見える）
 * - 、。！？ … 息つぎ。**2コマ** 閉じる（声も そこで 少し 止まる）
 * - ◯ … 「まる」と 読む（`scripts/make_meeting_audio.ts` が 声を 作る ときと 同じ 読み）。
 *   「では 次に ◯◯さん」を 数えないと、声より 4コマ 短く なり 後ろの 口が 前に ずれる
 *
 * 漢字は 読めないので 数えない。呼ぶ側が `kanaOf` で かなに してから 渡す。
 */

export type Viseme = "closed" | "a" | "i" | "u" | "e" | "o";

const ROWS: readonly (readonly [Viseme, string])[] = [
  ["a", "あかさたなはまやらわがざだばぱ"],
  ["i", "いきしちにひみりぎじぢびぴ"],
  ["u", "うくすつぬふむゆるぐずづぶぷゔ"],
  ["e", "えけせてねへめれげぜでべぺ"],
  ["o", "おこそとのほもよろをごぞどぼぽ"],
];
const SMALL: Readonly<Record<string, Viseme>> = {
  ゃ: "a",
  ぁ: "a",
  ぃ: "i",
  ゅ: "u",
  ぅ: "u",
  ぇ: "e",
  ょ: "o",
  ぉ: "o",
};
const PAUSE = "、。，．,.！？!?…";

/** カタカナ → ひらがな（ー は そのまま）。 */
function toHiragana(char: string): string {
  const code = char.charCodeAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : char;
}

function vowelOf(kana: string): Viseme | null {
  for (const [shape, row] of ROWS) if (row.includes(kana)) return shape;
  return null;
}

/** セリフ（かな）を 1モーラ 1コマの 口の 形に 並べる。 */
export function visemeTimeline(text: string): Viseme[] {
  const out: Viseme[] = [];
  for (const raw of text) {
    const char = toHiragana(raw);
    const small = SMALL[char];
    if (small) {
      /* きゃ・ティ … 前の 字と 1つ。前が 無ければ 1コマとして 数える */
      if (out.length > 0 && out[out.length - 1] !== "closed") out[out.length - 1] = small;
      else out.push(small);
      continue;
    }
    if (char === "ー") {
      out.push(out[out.length - 1] ?? "closed");
      continue;
    }
    if (char === "っ" || char === "ん") {
      out.push("closed");
      continue;
    }
    if (PAUSE.includes(char)) {
      out.push("closed", "closed");
      continue;
    }
    if (char === "◯") {
      out.push("a", "u");
      continue;
    }
    const vowel = vowelOf(char);
    if (vowel) out.push(vowel);
  }
  /* 文末の 息つぎは 数えない（声は もう 終わって いる） */
  while (out.length > 0 && out[out.length - 1] === "closed") out.pop();
  return out;
}

/**
 * 声の 進み（0〜1）で、いま 出す 口の 形を 選ぶ。
 * 並びが 空・進みが 読めない ときは null（呼ぶ側が 別の やり方に 戻す）。
 */
export function visemeAt(timeline: readonly Viseme[], progress: number | null): Viseme | null {
  if (timeline.length === 0 || progress === null || !Number.isFinite(progress)) return null;
  const clamped = Math.min(Math.max(progress, 0), 1);
  return timeline[Math.min(timeline.length - 1, Math.floor(clamped * timeline.length))]!;
}
