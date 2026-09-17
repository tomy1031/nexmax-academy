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
 * 答えの 順が 画面から 見えて しまって いるか。次の どちらかなら 漏れと みる。
 *  - **いちばん 左の ふだが、1つ目の 穴の 答え**（左から 押すと 1つ目が 当たる。
 *    穴が 1つの ときも これで 見る）
 *  - 答えの 語が、あいだに ほかの 語を はさんでも **答えの 順の まま** 並んで いる
 */
export function leaksAnswerOrder(shown: readonly string[], blanks: readonly string[]): boolean {
  if (blanks.length === 0) return false;
  if (shown[0] === blanks[0]) return true;
  if (blanks.length === 1) return false;
  const positions = blanks.map((word) => shown.indexOf(word));
  if (positions.some((p) => p < 0)) return false;
  return positions.every((p, i) => i === 0 || p > positions[i - 1]!);
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

/** まぜ直す 回数の 上限。語群は 10語 前後なので、ほぼ 1回目で 決まる。 */
const MAX_ATTEMPTS = 8;

/**
 * 画面に 出す 語群の 順。**答えの 順が 見えない** ことを 約束する。
 *
 * まぜた 結果が たまたま 漏れて いたら、種を 変えて まぜ直す。
 * それでも だめなら「まぎらわしい 語 → 答えを 逆の 順」に 置く
 *（先頭は 答えでは なく、答えの 並びは 逆向きなので、必ず 漏れない）。
 */
export function wordbankDisplayOrder(question: {
  id: string;
  bank: readonly string[];
  blanks: readonly string[];
}): string[] {
  const base = seedOf(`${question.id}\n${question.bank.join("\n")}`);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const order = shuffled(question.bank, rngFrom(base + attempt));
    if (!leaksAnswerOrder(order, question.blanks)) return order;
  }
  const others = question.bank.filter((word) => !question.blanks.includes(word));
  const answers = [...question.blanks].reverse().filter((word) => question.bank.includes(word));
  return [...others, ...new Set(answers)];
}
