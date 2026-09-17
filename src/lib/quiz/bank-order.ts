/**
 * 語群（`wordbank`）の ふだを 画面に 並べる 順。
 *
 * ## なぜ データの 順の まま 出さないか
 * 語群は 書く 人（先生・AI）が **ふつうは「答えを 出た 順に → まぎらわしい 語」**と
 * 書く。そのまま 並べると、ふだを 左から 順に 押すだけで 穴が 埋まる
 *（2026-09-17「報告の問題の選択肢の順番が答えのまま」。報告だけでなく
 * 連絡・相談など **git の 語群 9問 すべて**が この 形だった）。
 *
 * 書く 人に「まぜて 書いて」と お願いしても、次に 作る 人が また 同じ 形で 書く。
 * だから **画面が データの 順に 頼らない**。
 *
 * ## なぜ 毎回 ちがう 順（Math.random）に しないか
 * もんだいの 画面は サーバでも 描くので、ブラウザで 順が 変わると
 * 描き直しの 食い違いが 起きる。**同じ もんだいなら いつも 同じ 順**に する
 *（もんだいの id と 語群から 種を 作る）。やり直しても 順が 動かないので、
 * 「さっき ここに あった 語」を 探し直させない。
 */

/**
 * 並びから 答えが どれだけ 見えて しまうか（0 が いちばん 見えない）。
 *
 * 1回 まぜた だけでは、答えの 一部が 答えの 順の まま 残る ことが ある
 *（検収で 見つかった 例: IT の 確認で 2〜4番目の 答えが となりどうしに 並び、
 * まぎらわしい 語を 飛ばして 左から 押すと 6つの 穴の うち 3つが 当たった）。
 * だから「まざって いるか」では なく **左から 押す 学習者が 何を 得るか**で 数える。
 *
 *  1. ふだを 左から ぜんぶ 押すと 当たる 穴の 数
 *  2. まぎらわしい 語を 飛ばして 左から 押すと 当たる 穴の 数（穴が 2つ 以上の とき。
 *     穴が 1つなら 答えは 1枚しか 無いので、飛ばせば 必ず 当たる——並びの せいでは ない）
 *  3. 答えだけを 左から 見て、答えの 順で となりあう 組の 数
 *
 * 穴が 3つの ときは、どう 並べても 1 より 下がらない（6通り すべてで 2 か 3 に
 * 当たる）。
 */
export function answerLeakScore(shown: readonly string[], blanks: readonly string[]): number {
  let score = 0;
  blanks.forEach((word, i) => {
    if (shown[i] === word) score += 1;
  });
  const answersShown = shown.filter((word) => blanks.includes(word));
  if (blanks.length >= 2) {
    answersShown.forEach((word, i) => {
      if (blanks[i] === word) score += 1;
    });
  }
  for (let k = 0; k + 1 < answersShown.length; k += 1) {
    if (blanks.indexOf(answersShown[k + 1]!) === blanks.indexOf(answersShown[k]!) + 1) score += 1;
  }
  return score;
}

/** 文字列から 32bit の 種（FNV-1a）。 */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 種から 決まる 乱数（mulberry32）。 */
function rngFrom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * まぜかたの 候補の 数。語群は 10語 前後なので、ほとんどは 数回で 0 に なる。
 * 0 に ならない とき（穴が 3つ など）も、この 中で いちばん 見えない ものを 選ぶ。
 */
const CANDIDATES = 64;

/**
 * 画面に 出す 語群の 順。
 *
 * 種を 1つずつ 変えて まぜ、`answerLeakScore` が いちばん 小さい 並びを 選ぶ
 *（0 が 出たら そこで 止める）。決まった 形の 受け皿は 置かない——
 * 置くと その 形じたいが 目印に なる。
 */
export function wordbankDisplayOrder(question: {
  id: string;
  bank: readonly string[];
  blanks: readonly string[];
}): string[] {
  const base = seedOf(`${question.id}\n${question.bank.join("\n")}`);
  let best: string[] = [...question.bank];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < CANDIDATES; attempt += 1) {
    const order = shuffled(question.bank, rngFrom(base + attempt));
    const score = answerLeakScore(order, question.blanks);
    if (score < bestScore) {
      best = order;
      bestScore = score;
      if (score === 0) break;
    }
  }
  return best;
}
