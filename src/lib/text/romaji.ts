/**
 * ローマ字 → ひらがな（単語テストの よみ入力で、OS の日本語入力を 使わせない ため）
 *
 * ## なぜ アプリの 中で 変換するのか（2026-09-28）
 * Windows・Mac の 日本語入力（IME）は、打って いる 途中に **予測の 候補**を 出す。
 * 学生は 読みを あてずっぽうで 打ち、候補に 画面と 同じ 漢字が 出たら その まま
 * 決定する——**答え合わせが 入力欄の 中で できて しまう**。候補の 窓は OS が
 * 出す もので、ページからは 見えないし 消せない。止める 方法は、入力欄で IME を
 * 動かさず、ローマ字を ここで ひらがなに する ことしか ない。
 *
 * ## 表は IME に そろえる
 * ヘボン式・訓令式の どちらでも 打てる（shi/si・chi/ti・tsu/tu・fu/hu・ji/zi・ja/zya/jya）。
 * 小さい 字は x か l を 先に、っ は 子音を 2つ、ー は `-`、ん は nn / n' / 子音の 前の n。
 *
 * ## 「ん」だけは IME どうしで 解釈が 割れる
 * 「konnichiha」を こんにちは と 読む IME も、こんいちは と 読む IME も ある
 * （nn を すぐ ん に する か どうか）。画面に 出すのは **nn → ん**（Windows の IME）だが、
 * 判定では **どちらに 読んでも** 正しい よみに なれば 当たりに する
 * （`romajiCandidates` が 両方を 返す）。学習者が 慣れた IME の 打ち方で 落ちない ように。
 */

const VOWELS = "aiueo";

/** 1かたまりの ローマ字 → かな。最長一致で 引く（4文字まで）。 */
const TABLE: Readonly<Record<string, string>> = (() => {
  const t: Record<string, string> = {};
  const row = (head: string, kana: string) => {
    [...VOWELS].forEach((v, i) => {
      const k = kana[i];
      if (k && k !== "_") t[head + v] = k;
    });
  };
  row("", "あいうえお");
  row("k", "かきくけこ");
  row("g", "がぎぐげご");
  row("s", "さしすせそ");
  row("z", "ざじずぜぞ");
  row("t", "たちつてと");
  row("d", "だぢづでど");
  row("n", "なにぬねの");
  row("h", "はひふへほ");
  row("b", "ばびぶべぼ");
  row("p", "ぱぴぷぺぽ");
  row("m", "まみむめも");
  row("y", "や_ゆ_よ");
  row("r", "らりるれろ");
  row("w", "わ_う_を");
  row("x", "ぁぃぅぇぉ");
  row("l", "ぁぃぅぇぉ");

  // 拗音（き＋ゃ など）
  const yoon: Record<string, string> = {
    ky: "き",
    gy: "ぎ",
    sy: "し",
    zy: "じ",
    jy: "じ",
    ty: "ち",
    cy: "ち",
    dy: "ぢ",
    ny: "に",
    hy: "ひ",
    by: "び",
    py: "ぴ",
    my: "み",
    ry: "り",
    fy: "ふ",
    vy: "ゔ",
  };
  const small = { a: "ゃ", i: "ぃ", u: "ゅ", e: "ぇ", o: "ょ" } as const;
  for (const [head, base] of Object.entries(yoon)) {
    for (const v of VOWELS) t[head + v] = base + small[v as keyof typeof small];
  }
  // 2文字で 打つ 拗音（sh・ch・j）
  for (const [head, base] of [
    ["sh", "し"],
    ["ch", "ち"],
    ["j", "じ"],
  ] as const) {
    t[head + "a"] = base + "ゃ";
    t[head + "u"] = base + "ゅ";
    t[head + "e"] = base + "ぇ";
    t[head + "o"] = base + "ょ";
  }
  Object.assign(t, {
    shi: "し",
    chi: "ち",
    ji: "じ",
    tsu: "つ",
    fu: "ふ",
    // 外来語の 音
    fa: "ふぁ",
    fi: "ふぃ",
    fe: "ふぇ",
    fo: "ふぉ",
    tsa: "つぁ",
    tsi: "つぃ",
    tse: "つぇ",
    tso: "つぉ",
    thi: "てぃ",
    thu: "てゅ",
    dhi: "でぃ",
    dhu: "でゅ",
    tha: "てゃ",
    the: "てぇ",
    tho: "てょ",
    dha: "でゃ",
    dhe: "でぇ",
    dho: "でょ",
    twu: "とぅ",
    dwu: "どぅ",
    kwa: "くぁ",
    gwa: "ぐぁ",
    hwa: "ふぁ",
    hwi: "ふぃ",
    hwe: "ふぇ",
    hwo: "ふぉ",
    wi: "うぃ",
    we: "うぇ",
    wha: "うぁ",
    whi: "うぃ",
    whu: "う",
    whe: "うぇ",
    who: "うぉ",
    yi: "い",
    ye: "いぇ",
    va: "ゔぁ",
    vi: "ゔぃ",
    vu: "ゔ",
    ve: "ゔぇ",
    vo: "ゔぉ",
    qa: "くぁ",
    qi: "くぃ",
    qu: "く",
    qe: "くぇ",
    qo: "くぉ",
    ca: "か",
    ci: "し",
    cu: "く",
    ce: "せ",
    co: "こ",
    // 小さい 字
    xyi: "ぃ",
    xye: "ぇ",
    lyi: "ぃ",
    lye: "ぇ",
    xya: "ゃ",
    xyu: "ゅ",
    xyo: "ょ",
    lya: "ゃ",
    lyu: "ゅ",
    lyo: "ょ",
    xtu: "っ",
    ltu: "っ",
    xtsu: "っ",
    ltsu: "っ",
    xwa: "ゎ",
    lwa: "ゎ",
    xka: "ゕ",
    xke: "ゖ",
    xn: "ん",
    "-": "ー",
  });
  return t;
})();

/** 表の キーの 書き出し（打ちかけの 判定に 使う）。 */
const PREFIXES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (const key of Object.keys(TABLE)) {
    for (let i = 1; i < key.length; i++) set.add(key.slice(0, i));
  }
  set.add("tc"); // tch（っち）の 打ちかけ
  return set;
})();

/** 「っ」に なる 子音の 重ね（kk・tt・ss…）。n は ん に 使うので 入れない。 */
const DOUBLE_CONSONANTS = "bcdfghjklmpqrstvwxyz";

/** この 入力欄で 受け付ける 文字（英字・ハイフン・アポストロフィ）。 */
export const ROMAJI_KEY = /^[a-z'-]$/;

/** 読めた かな 1つ分と、その もとの ローマ字。 */
type Token = { readonly src: string; readonly kana: string };

/** 1つの 読み方。`pending` は まだ かなに ならない 打ちかけ（"k"・"ky" など）。 */
type Parse = { readonly tokens: readonly Token[]; readonly pending: string };

/** 解釈が 割れたとき、いくつまで 追うか（語は 短いので 実際は 数本）。 */
const MAX_PARSES = 32;
/**
 * 探索の 歩数の 上限。「nn＋母音」の 分かれ道は 1つごとに 探索が 倍に なるので、
 * 成功した 数だけで なく **歩いた 回数**で 打ち切る（キーを 押す たびに 呼ばれる）。
 */
const MAX_STEPS = 2000;

/**
 * ローマ字を ひらがなに 読む。読めた 解釈を **ぜんぶ** 返す（先頭が 画面に 出す 解釈）。
 * 途中で 読めない 字が あれば 空配列。
 */
function parseAll(raw: string): Parse[] {
  const out: Parse[] = [];
  let steps = 0;
  const walk = (i: number, tokens: readonly Token[]): void => {
    if (out.length >= MAX_PARSES || ++steps > MAX_STEPS) return;
    if (i >= raw.length) {
      out.push({ tokens, pending: "" });
      return;
    }
    const rest = raw.slice(i);
    const c = rest[0]!;
    const next = rest[1];
    const take = (len: number, kana: string) =>
      walk(i + len, [...tokens, { src: rest.slice(0, len), kana }]);

    if (c === "n") {
      if (next === undefined) {
        // 語の おわりの n は まだ 決まらない（na・nya の 打ちかけかも しれない）
        out.push({ tokens, pending: "n" });
        return;
      }
      if (next === "'") return take(2, "ん");
      if (next === "n") {
        // nn → ん（Windows の IME）。母音・y が つづく ときは「n＋な行」とも 読む
        take(2, "ん");
        const after = rest[2];
        if (after !== undefined && (VOWELS.includes(after) || after === "y")) take(1, "ん");
        return;
      }
      if (!VOWELS.includes(next) && next !== "y") return take(1, "ん");
      // na・nya などは 表で 引く
    }

    if (next !== undefined && c === next && DOUBLE_CONSONANTS.includes(c)) return take(1, "っ");
    if (c === "t" && rest.startsWith("tch")) return take(1, "っ");

    for (let len = Math.min(4, rest.length); len >= 1; len--) {
      const hit = TABLE[rest.slice(0, len)];
      if (hit) return take(len, hit);
    }
    // 打ちかけ（語の おわりだけ 許す）
    if (PREFIXES.has(rest)) out.push({ tokens, pending: rest });
  };
  walk(0, []);
  return out;
}

const kanaOf = (p: Parse) => p.tokens.map((t) => t.kana).join("");

/** 画面に 出す 形（かな＋打ちかけの 英字）。読めない 入力なら null。 */
export function romajiDisplay(raw: string): string | null {
  const first = parseAll(raw)[0];
  return first ? kanaOf(first) + first.pending : null;
}

/** この 字を 足しても 読める か（読めない 字は 入力欄に 入れない）。 */
export function canAppendRomaji(raw: string, key: string): boolean {
  return ROMAJI_KEY.test(key) && parseAll(raw + key).length > 0;
}

/**
 * 決定（Enter）した ときの よみの 候補。先頭が 画面と 同じ 解釈。
 * おわりの n は ん に する。打ちかけが 残る（"kais" など）なら 空配列＝まだ 決められない。
 */
export function romajiCandidates(raw: string): string[] {
  const seen = new Set<string>();
  for (const p of parseAll(raw)) {
    if (p.pending === "n") seen.add(kanaOf(p) + "ん");
    else if (p.pending === "") seen.add(kanaOf(p));
  }
  return [...seen].filter(Boolean);
}

/**
 * 1文字 消す（Backspace）。IME と 同じく **かな 1つ**を 消す——
 * 「shi」の i だけを 消して「sh」を 見せる ことは しない。
 */
export function romajiBackspace(raw: string): string {
  const first = parseAll(raw)[0];
  if (!first || first.pending) return raw.slice(0, -1);
  /*
   * のこった かなを、**その かなだけで 読める 形**に 書き直す。
   * 「kitte」から て を 消すと「kit」＝「きt」に なって しまうので、
   * 重ねの っ は xtu、子音の 前の n は nn に する（IME と 同じく「きっ」「かん」が 残る）。
   */
  return first.tokens
    .slice(0, -1)
    .map((t) => {
      if (t.kana === "っ" && t.src.length === 1) return "xtu";
      if (t.kana === "ん" && t.src === "n") return "nn";
      return t.src;
    })
    .join("");
}
