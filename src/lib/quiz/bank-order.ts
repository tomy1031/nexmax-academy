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
 *  4. 同じく、答えの **逆の 順**で となりあう 組の 数（穴が 3つ 以上の とき）。
 *     数えないと「右から 押せば ぜんぶ 当たる」逆さの 並びが 0 に なり、穴 4つでは
 *     4回に 1回 選ばれて いた（再検収で 連絡の r_blank1 が ちょうど 逆さだった）。
 *     穴が 2つなら 答えの 順で ない 並びは 逆さしか 無いので 数えない
 *
 * 穴が 3つの ときは、どう 並べても 1 より 下がらない（`lowestLeakScore`）。
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
    const step = blanks.indexOf(answersShown[k + 1]!) - blanks.indexOf(answersShown[k]!);
    if (step === 1) score += 1;
    if (step === -1 && blanks.length >= 3) score += 1;
  }
  return score;
}

/**
 * 並べかたで 下げられる 見え具合の 下限。
 *
 * 穴が 3つの ときだけ 1。答えの 並びは 6通りしか 無く、ABC 以外の 5通りも
 * 「飛ばして 押すと 1つ 当たる」か「となりあう 組が 1つ ある」の どちらかに 必ず 当たる
 *（ACB・BAC は 当たり＋逆の 組、BCA・CAB は 順の 組、CBA は 当たり＋逆の 組 2つ）。
 * ほかの 穴の 数は、まぎらわしい 語が 1つ あれば 0 まで 下げられる。
 */
export function lowestLeakScore(holes: number): number {
  return holes === 3 ? 1 : 0;
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
 * さがす 手数の 上限。見えない 並びは たくさん あるので、ふつうは 数十手で 見つかる。
 * 上限に 当たったら 見え具合を 1つ ゆるめて さがし直す（`wordbankDisplayOrder`）。
 */
const STEP_LIMIT = 5000;

/**
 * さがす 語群の 大きさの 上限。さがしかたは 1語ごとに 1段 深く なるので、
 * 何千語も ある 語群では 描画中に 呼び出しの 深さが 尽きる（5001語で 実測）。
 * 教材の 語群は 10語 前後なので、これを 超える ものは まぜた だけで 返す。
 */
const SEARCH_WORD_LIMIT = 200;

/**
 * 見え具合が `allow` 以下の 並びを さがす。2段に 分ける。
 *
 *  1. **答えどうしの 順**を 1語ずつ 決める（`answerLeakScore` の 2・3・4 は これだけで 決まる）
 *  2. その 順を 崩さずに、**まぎらわしい 語を あいだへ 差しこむ**（1 は ここで 決まる）
 *
 * 置く 候補の 順は 種で まぜる（同じ もんだいなら 同じ 結果）。置いた 瞬間に 見え具合を
 * 足し、`allow` を 超えたら その 置きかたは 捨てる。
 *
 * - 1回 まぜて 当たりを 待つ やりかたでは、穴 5つで 0 に なるのが 100回に 1回ほどで、
 *   下限に 届かない もんだいが 残った
 * - 全部の 語を 1段で さがすと、見え具合に 関わらない **まぎらわしい 語どうしの 並べ替え**
 *   ばかり 試して 手数が 尽きた（まぎらわしい 語 8つで 半分が 届かなかった）
 */
function searchOrder(
  bank: readonly string[],
  blanks: readonly string[],
  allow: number,
  rng: () => number,
  stepLimit: number,
): string[] | null {
  const answers = bank.filter((word) => blanks.includes(word));
  const others = shuffled(
    bank.filter((word) => !blanks.includes(word)),
    rng,
  );
  const sequence: string[] = [];
  const used = answers.map(() => false);
  let steps = 0;

  /* 2段目: まぎらわしい 語を 差しこむ。左から 穴の 数までの 位置だけが 見え具合に 関わる。 */
  const interleave = (cost: number): string[] | null => {
    const order: string[] = [];
    const fill = (a: number, d: number, spent: number): boolean => {
      if (order.length === bank.length) return true;
      steps += 1;
      if (steps > stepLimit) return false;
      const answersLeft = sequence.length - a;
      const othersLeft = others.length - d;
      // 残りの 数に 比例して 先に 試す 種類を 決める（刈り込みが 無ければ 一様な 差しこみに なる）
      const answerFirst = rng() * (answersLeft + othersLeft) < answersLeft;
      for (const kind of answerFirst ? ["answer", "other"] : ["other", "answer"]) {
        if (kind === "answer") {
          if (answersLeft === 0) continue;
          const word = sequence[a]!;
          const added = blanks[order.length] === word ? 1 : 0;
          if (spent + added > allow) continue;
          order.push(word);
          if (fill(a + 1, d, spent + added)) return true;
        } else {
          if (othersLeft === 0) continue;
          order.push(others[d]!);
          if (fill(a, d + 1, spent)) return true;
        }
        order.pop();
        if (steps > stepLimit) return false;
      }
      return false;
    };
    return fill(0, 0, cost) ? order : null;
  };

  /* 1段目: 答えどうしの 順。 */
  const arrange = (cost: number): string[] | null => {
    if (sequence.length === answers.length) return interleave(cost);
    steps += 1;
    if (steps > stepLimit) return null;
    const k = sequence.length;
    const lastRank = k > 0 ? blanks.indexOf(sequence[k - 1]!) : -1;
    const candidates = shuffled(
      answers.map((_, i) => i).filter((i) => !used[i]),
      rng,
    );
    for (const i of candidates) {
      const word = answers[i]!;
      let added = 0;
      if (blanks.length >= 2 && blanks[k] === word) added += 1;
      if (k > 0) {
        const step = blanks.indexOf(word) - lastRank;
        if (step === 1) added += 1;
        if (step === -1 && blanks.length >= 3) added += 1;
      }
      if (cost + added > allow) continue;
      used[i] = true;
      sequence.push(word);
      const found = arrange(cost + added);
      if (found) return found;
      sequence.pop();
      used[i] = false;
      if (steps > stepLimit) return null;
    }
    return null;
  };

  return arrange(0);
}

/**
 * 画面に 出す 語群の 順。見え具合（`answerLeakScore`）が **下限**
 *（`lowestLeakScore`）の 並びを 返す。
 *
 * 手数の 上限に 当たったら 見え具合を 1つずつ ゆるめる。ゆるめる 先は 見え具合の
 * 最大（左から 当たる 穴・飛ばして 当たる 穴・となりあう 組を ぜんぶ 数えた 数）まで。
 * そこでも 見つからない（語群が 手数の 上限より 大きい など、教材では ありえない 形）
 * ときと、語群が `SEARCH_WORD_LIMIT` を 超える ときだけ、まぜた だけの 並びを 返す——
 * **必ず 終わる** ことを 優先する。
 *
 * `stepLimit` は テストで ゆるめる 道を 通す ための もの。画面からは 渡さない。
 */
export function wordbankDisplayOrder(
  question: {
    id: string;
    bank: readonly string[];
    blanks: readonly string[];
  },
  stepLimit: number = STEP_LIMIT,
): string[] {
  const base = seedOf(`${question.id}\n${question.bank.join("\n")}`);
  if (question.bank.length > SEARCH_WORD_LIMIT) return shuffled(question.bank, rngFrom(base));
  const ceiling = question.blanks.length * 2 + question.bank.length;
  for (let allow = lowestLeakScore(question.blanks.length); allow <= ceiling; allow += 1) {
    const order = searchOrder(
      question.bank,
      question.blanks,
      allow,
      rngFrom(base + allow),
      stepLimit,
    );
    if (order) return order;
  }
  return shuffled(question.bank, rngFrom(base));
}
