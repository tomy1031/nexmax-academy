/**
 * リスニングの聞き取り判定（純関数）
 *
 * 旧アプリ（listening/soudan・listening/renraku）の移植。
 * 原典は **入力欄が1つ** で、そこに入れた言葉が
 *   ①キーワードか ②キーワードを含むか ③本文に出てくるか
 * を順に見て、点数を変えながら原稿の該当箇所を開いていく作りだった。
 * 「キーワード発見」と「原稿リベール」は別々の機能ではなく、
 * ひとつの入力に対する結果の大小でしかない。
 *
 * ## ひらがなで 打っても 当たる（2026-09-04 に 直した）
 * 前は `normalizeReading` を 1回 通すだけ だった。これは **カタカナを ひらがなに
 * するだけ**で 漢字は 漢字の まま 残る——だから 原稿の 「達成感」に 対して
 * 「たっせいかん」と 打っても **絶対に 当たらなかった**。学習者は 聞いた とおりに
 * かなで 打つ のに、漢字で 書かないと 点に ならない 作りに なっていた。
 *
 * いまは **原稿も 入力も、教材の 読み辞書（furigana）で かなへ 倒してから 比べる**
 *（`annotateRuby` → 読みへ 置換）。辞書に 無い 漢字の ために、素の 形の 見かたも
 * 同時に 持ち、**どちらかに 当たれば 当たり**に する。
 */

import { looseReading, normalizeReading } from "@/lib/text/normalize";
import { annotateRuby, type FuriganaIndex } from "@/lib/text/furigana";

/** 判定の種類。点数と文言はここで決まる（原典の配点をそのまま使う）。 */
export type HitKind =
  /** キーワードそのもの（原稿の表記と一致）。 */
  | "keyword"
  /** キーワードの読み・別表記。 */
  | "hiragana"
  /** 複数のキーワードを含む言い方。 */
  | "contains"
  /** キーワードは含むが、本文にその言い方では出てこない。 */
  | "close"
  /** キーワードではないが本文に出てくる。 */
  | "partial"
  /** 短すぎて判定できない。 */
  | "tooShort"
  /**
   * さっき 打った ことば。
   *
   * **`miss` と 混ぜない**（2026-09-04 の 指摘）。前は 同じ ことばを 2回 打つと
   * 「まだ 出ていないみたい」と 出て いた——1回目に「本文に ある」と 言われた
   * ばかりの ことばなのに、である。出て いない のでは なく **もう 見つけて いる**。
   */
  | "repeat"
  /**
   * 本文には あるが、入力の **途中まで**しか 合って いない。
   * 「まだ 出ていないみたい」だけでは 何が ちがうのか 分からない
   *（2026-09-04 の 指摘「意味不明」）ので、**どこまで 合って いたか**を 返す。
   */
  | "partway"
  /** ローマ字（英字）で 打った。 */
  | "romaji"
  /** 本文に まったく 出て こない。 */
  | "miss";

/**
 * 長い言葉ほど点が高い。
 *
 * 1語ずつ拾うより、聞こえた**ひとかたまり**を書き取るほうが難しく、
 * 聞き取りの練習としても価値が高い。短い語の連打で稼げるままだと、
 * 学習者はいちばん楽な当て方に寄っていく。
 */
export function lengthBonus(text: string, rules: ListeningRules): number {
  const extra = normalizeReading(text).length - rules.minLength;
  return extra <= 0 ? 0 : Math.min(10, extra);
}

export const POINTS: Record<HitKind, number> = {
  keyword: 5,
  hiragana: 3,
  contains: 5, // 含まれていたキーワード1つにつき
  close: 0,
  partial: 2,
  tooShort: 0,
  repeat: 0,
  partway: 0,
  romaji: 0,
  miss: 0,
};

/** ミスできる回数の既定（教材ごとに変えられる — listeningSchema の check）。 */
export const MAX_MISS = 3;

/** 受けつける最小の文字数の既定。 */
export const MIN_LENGTH = 3;

/** 聞き取りチェックの設定（教材から渡す）。 */
export interface ListeningRules {
  /** ひらがなだけの入力を、何文字から受けつけるか。 */
  readonly minLength: number;
  readonly maxMiss: number;
}

export const DEFAULT_RULES: ListeningRules = { minLength: MIN_LENGTH, maxMiss: MAX_MISS };

/**
 * 原稿を「かなに 倒した 並び」と、その 1文字ずつが **元の どこから 来たか**の 対応表。
 *
 * 読みは 表記と 長さが ちがう（達成感=3字 → たっせいかん=6字）ので、
 * かなの 1文字が 元の 1文字に 対応するとは 限らない。だから **読みの どこに 当たっても
 * その ことば まるごとを ひらく**——漢字を 半分だけ ひらいても 読めないからである。
 */
interface KanaView {
  readonly kana: string;
  /** kana[i] を ひらく ときに 開ける 元の 位置（複数）。 */
  readonly owners: readonly (readonly number[])[];
}

export interface ListeningState {
  readonly transcript: string;
  readonly keywords: readonly string[];
  readonly rules: ListeningRules;
  /**
   * 隠せる文字の数（かな・漢字・数字）。表示率の分母。
   *
   * 以前は原稿の長さを分母にしていたので、句読点や空白は最初から見えている
   * ぶんだけ**何も当てていないのに 11% から始まっていた**。
   * 学習者から見ると「もう1割わかった」と嘘をつかれたことになる。
   */
  readonly hideableCount: number;
  /** 見つけたキーワード。 */
  readonly foundKeywords: readonly string[];
  /** 一度当てた入力（同じ語で二度稼げないようにする）。 */
  readonly usedInputs: readonly string[];
  readonly score: number;
  readonly kanjiHits: number;
  readonly hiraganaHits: number;
  readonly otherHits: number;
  readonly misses: number;
  /** 原稿の見えている文字の位置。 */
  readonly revealed: ReadonlySet<number>;
  /** 読み辞書で かなへ 倒した 見かた（ひらがな入力は これに 当てる）。 */
  readonly kanaView: KanaView;
  /** 素の 見かた（辞書に 無い 漢字・英字は こちらで 当てる）。 */
  readonly rawView: KanaView;
  /** 入力を かなへ 倒す ための 辞書。 */
  readonly furigana: FuriganaIndex;
  /**
   * 長音を 母音に 開いた 見かた（「さーばー」＝「さあばあ」）。
   * `looseReading` は 1文字を 1文字に 置きかえる ので 長さが 変わらず、
   * 位置の 対応表（owners）は そのまま 使える。
   */
  readonly looseViews: readonly KanaView[];
  /** 入力の履歴（新しい順に画面へ出す）。 */
  readonly log: readonly LogEntry[];
}

export interface LogEntry {
  readonly input: string;
  readonly kind: HitKind;
  readonly points: number;
  /** 見つかったキーワード（contains のときは複数）。 */
  readonly keywords: readonly string[];
  /**
   * 外れた ときの 手がかり（「はじめの『じしゃ』は ありました」など）。
   * 何が ちがうのか 分からない まま 打ち直させない ため。
   */
  readonly hint?: string;
}

/**
 * 原稿を かなの 並びへ 倒し、1文字ずつ「元の どこか」を 覚える。
 *
 * `withReadings` が true の ときだけ 読み辞書を 使う（漢字→読み）。
 * false の ときは 1文字ずつ `normalizeReading` を 通すだけ——
 * 辞書に 無い 漢字や 英字（SES など）は こちらで 当てる。
 */
function buildView(transcript: string, index: FuriganaIndex, withReadings: boolean): KanaView {
  const owners: (readonly number[])[] = [];
  let kana = "";
  let at = 0;
  const segments = withReadings ? annotateRuby(transcript, index) : [{ text: transcript }];
  for (const segment of segments) {
    const reading = "reading" in segment ? segment.reading : undefined;
    if (withReadings && reading) {
      // 読みの どこに 当たっても、その ことば まるごとを ひらく
      const whole = Array.from({ length: segment.text.length }, (_, k) => at + k);
      const piece = normalizeReading(reading);
      for (let k = 0; k < piece.length; k += 1) owners.push(whole);
      kana += piece;
    } else {
      for (let c = 0; c < segment.text.length; c += 1) {
        const plain = normalizeReading(segment.text[c] ?? "");
        // 読みの 見かたでは 英字も 1文字ずつ 開く（SES → えすいーえす）
        const piece = withReadings ? spellLatin(plain) : plain;
        for (let k = 0; k < piece.length; k += 1) owners.push([at + c]);
        kana += piece;
      }
    }
    at += segment.text.length;
  }
  return { kana, owners };
}

/**
 * 英字 1文字ずつの 読み。**リスニングでは 字が 想像できない**ので、
 * 「SES」を 聞いて「えすいーえす」と 打つ 学習者を 落とさない
 *（2026-09-04 の 指定「できる限り 許容範囲を 広げて欲しい」）。
 */
const LATIN_KANA: Record<string, string> = {
  a: "えー",
  b: "びー",
  c: "しー",
  d: "でぃー",
  e: "いー",
  f: "えふ",
  g: "じー",
  h: "えいち",
  i: "あい",
  j: "じぇー",
  k: "けー",
  l: "える",
  m: "えむ",
  n: "えぬ",
  o: "おー",
  p: "ぴー",
  q: "きゅー",
  r: "あーる",
  s: "えす",
  t: "てぃー",
  u: "ゆー",
  v: "ぶい",
  w: "だぶりゅー",
  x: "えっくす",
  y: "わい",
  z: "ぜっと",
};

/** 英字の 連なりを 1文字ずつの 読みに 開く（ses → えすいーえす）。 */
function spellLatin(text: string): string {
  return [...text].map((ch) => LATIN_KANA[ch] ?? ch).join("");
}

/** 入力を 読み辞書で かなへ 倒す（辞書に 無い 漢字は そのまま 残る）。 */
function toKana(text: string, index: FuriganaIndex): string {
  return annotateRuby(text, index)
    .map((segment) =>
      segment.reading
        ? normalizeReading(segment.reading)
        : spellLatin(normalizeReading(segment.text)),
    )
    .join("");
}

export function createListening(
  transcript: string,
  keywords: readonly string[],
  rules: ListeningRules = DEFAULT_RULES,
  furigana: FuriganaIndex = { entries: [], maxLength: 0 },
): ListeningState {
  const kanaView = buildView(transcript, furigana, true);
  const rawView = buildView(transcript, furigana, false);
  // 記号・空白は最初から見えている（形だけ分かると「発掘」しやすい）
  const revealed = new Set<number>();
  let hideableCount = 0;
  for (let i = 0; i < transcript.length; i += 1) {
    if (isHideable(transcript[i])) hideableCount += 1;
    else revealed.add(i);
  }
  return {
    transcript,
    keywords,
    rules,
    furigana,
    kanaView,
    rawView,
    looseViews: [kanaView, rawView].map((view) => ({
      kana: looseReading(view.kana),
      owners: view.owners,
    })),
    hideableCount,
    foundKeywords: [],
    usedInputs: [],
    score: 0,
    kanjiHits: 0,
    hiraganaHits: 0,
    otherHits: 0,
    misses: 0,
    revealed,
    log: [],
  };
}

/**
 * 入力を1つ受ける。原典の判定順をそのまま守る:
 *   1. キーワードそのもの → 5点（読み・別表記なら 3点）
 *   2. キーワードを含む言い方 → 含んだ数 × 5点。ただし本文に無ければ「おしい」
 *   3. 短すぎる入力 → ミス
 *   4. 本文に出てくる → 2点
 *   5. どれでもない → ミス
 * 当たった言葉は、その場で原稿の該当箇所を開く。
 */
export function submitListening(state: ListeningState, raw: string): ListeningState {
  const input = raw.trim();
  if (!input) return state;

  const needle = normalizeReading(input);
  if (!needle) return state;
  /** 入力を 読み辞書で かなへ 倒した 形（「達成感」→「たっせいかん」）。 */
  const kana = toKana(input, state.furigana);

  /*
   * 同じ ことばで 二度は 稼げない。ただし **「まだ 出ていない」とは 言わない**——
   * さっき 見つけた ばかりの ことばに それを 言うと 嘘に なる（2026-09-04 の 指摘）。
   *
   * 見るのは **表記では なく ことば**。「たっせいかん」の あとに 「達成感」と
   * 打っても 同じ ことばなので 二度は 数えない（読みへ 倒してから 見くらべる）。
   */
  const alreadyUsed = state.usedInputs.some(
    (used) => used === needle || toKana(used, state.furigana) === kana,
  );
  if (alreadyUsed) {
    return push(state, { input, kind: "repeat", points: 0, keywords: [] }, { countMiss: false });
  }

  const remaining = state.keywords.filter((kw) => !state.foundKeywords.includes(kw));

  // 1. キーワードそのもの（表記／読みの どちらでも）
  const exact = remaining.find((kw) => kw === input);
  const mine = needleForms(needle, kana);
  const byReading = remaining.find((kw) => {
    const theirs = needleForms(normalizeReading(kw), toKana(kw, state.furigana));
    return theirs.some((one) => mine.includes(one));
  });
  if (exact || byReading) {
    const hit = exact ?? byReading!;
    const kind: HitKind = exact ? "keyword" : "hiragana";
    return award(state, input, needle, kana, kind, POINTS[kind] + lengthBonus(input, state.rules), [
      hit,
    ]);
  }

  // 2. キーワードを含む言い方
  const contained = remaining.filter((kw) => {
    const theirs = needleForms(normalizeReading(kw), toKana(kw, state.furigana));
    return theirs.some((one) => one.length > 0 && mine.some((form) => form.includes(one)));
  });
  if (contained.length > 0) {
    if (isInTranscript(state, needle, kana)) {
      return award(
        state,
        input,
        needle,
        kana,
        "contains",
        POINTS.contains * contained.length + lengthBonus(input, state.rules),
        contained,
      );
    }
    return push(state, { input, kind: "close", points: 0, keywords: contained });
  }

  // 3. 短すぎる入力（ひらがなだけなら minLength、漢字まじりはその1つ手前から）
  const allKana = /^[ぁ-ゖー0-9]+$/.test(needle);
  const floor = allKana ? state.rules.minLength : Math.max(1, state.rules.minLength - 1);
  if (needle.length < floor) {
    return push(state, { input, kind: "tooShort", points: 0, keywords: [] });
  }

  // 4. キーワードではないが本文に出てくる
  if (isInTranscript(state, needle, kana)) {
    return award(
      state,
      input,
      needle,
      kana,
      "partial",
      POINTS.partial + lengthBonus(input, state.rules),
      [],
    );
  }

  // 5. 該当なし —— **なぜ 外れたか**を 切り分けて 返す
  return push(state, { input, ...diagnose(state, input, needle, kana) });
}

/**
 * 外れた ときに「何が ちがうのか」を 言う。
 *
 * 2026-09-04 の 指摘:「まだ出てないみたい」は 意味不明。
 * 学習者は **打ち直す 手がかり**が 要る のであって、否定が 要る のでは ない。
 * 見分けるのは 3つ:
 *   - ローマ字で 打った（日本語に すれば 当たる かもしれない）
 *   - 途中までは 合って いる（続きだけ ちがう）
 *   - 本当に 出て こない
 */
function diagnose(
  state: ListeningState,
  input: string,
  needle: string,
  kana: string,
): { kind: HitKind; points: number; keywords: readonly string[]; hint?: string } {
  const base = { points: 0, keywords: [] as readonly string[] };

  // ローマ字のまま（かなに ならなかった）
  if (/^[a-z0-9\s]+$/.test(needle) && needle.trim().length > 0) {
    return {
      ...base,
      kind: "romaji",
      hint: `「${input}」は ローマ字です。日本語で 打って みて ください。`,
    };
  }

  /*
   * 途中までは 合って いるか。**長い ほうから** 見て、いちばん 長く 合った
   * ところを 返す（2文字 未満は 手がかりに ならない ので 出さない）。
   */
  const forms = needleForms(needle, kana).filter((form) => form.length >= 3);
  for (const form of forms) {
    for (let end = form.length - 1; end >= 2; end -= 1) {
      const head = form.slice(0, end);
      if (allViews(state).some((view) => view.kana.includes(head))) {
        return {
          ...base,
          kind: "partway",
          hint: `「${head}」までは 本文に あります。つづきを もう 一度 聞いて みて ください。`,
        };
      }
    }
  }

  return { ...base, kind: "miss", hint: `「${input}」は 本文に 出て きません。` };
}

function award(
  state: ListeningState,
  input: string,
  needle: string,
  kana: string,
  kind: HitKind,
  points: number,
  keywords: readonly string[],
): ListeningState {
  /*
   * 当たった ことばと、その キーワードの 表記の 両方で 原稿を ひらく。
   * **素の 形と 読みの 形の 両方で 探す**——「たっせいかん」で 当てた 学習者にも
   * 「達成感」で 当てた 学習者にも、同じ ところが ひらかなければ ならない。
   */
  let revealed = state.revealed;
  for (const form of [input, ...keywords]) {
    const forms = needleForms(normalizeReading(form), toKana(form, state.furigana));
    for (const view of allViews(state)) {
      for (const one of forms) revealed = revealWith(view, revealed, one);
    }
  }

  const next: ListeningState = {
    ...state,
    revealed,
    score: state.score + points,
    foundKeywords: [...state.foundKeywords, ...keywords],
    usedInputs: [...state.usedInputs, needle],
    kanjiHits: state.kanjiHits + (kind === "keyword" || kind === "contains" ? keywords.length : 0),
    hiraganaHits: state.hiraganaHits + (kind === "hiragana" ? 1 : 0),
    otherHits: state.otherHits + (kind === "partial" ? 1 : 0),
  };
  return push(next, { input, kind, points, keywords }, { countMiss: false });
}

function push(
  state: ListeningState,
  entry: LogEntry,
  { countMiss = true }: { countMiss?: boolean } = {},
): ListeningState {
  const isMiss = countMiss && (entry.kind === "miss" || entry.kind === "tooShort");
  return {
    ...state,
    misses: state.misses + (isMiss ? 1 : 0),
    log: [entry, ...state.log].slice(0, 8),
  };
}

/* ------------------------------------------------------------------ *
 * 原稿の開きぐあい
 * ------------------------------------------------------------------ */

/**
 * かなの 並びの 上で 探し、当たった ところが 元の どこかを たどって ひらく。
 *
 * 見かたは `createListening` で 1度だけ 組み立てて ある（前は 入力の たびに
 * 原稿ぜんぶを 組み直して いた）。
 */
function revealWith(
  view: KanaView,
  revealed: ReadonlySet<number>,
  needle: string,
): ReadonlySet<number> {
  if (!needle) return revealed;
  const next = new Set(revealed);
  let from = 0;
  for (;;) {
    const at = view.kana.indexOf(needle, from);
    if (at < 0) break;
    for (let k = at; k < at + needle.length; k += 1) {
      for (const original of view.owners[k] ?? []) next.add(original);
    }
    from = at + 1;
  }
  return next;
}

/**
 * その ことばが 原稿に あるか。**素の 形でも 読みの 形でも 当たれば あり**。
 *
 * 前は `normalizeReading(transcript)` を 見て いた——カタカナを ひらがなに するだけ なので
 * 漢字は 漢字の まま で、かなで 打った 学習者は 永久に 当たらなかった。
 */
function isInTranscript(state: ListeningState, needle: string, kana: string): boolean {
  return allViews(state).some((view) =>
    needleForms(needle, kana).some((form) => form.length > 0 && view.kana.includes(form)),
  );
}

/** 原稿の 見かた ぜんぶ（素・読み・長音を 開いた もの）。 */
function allViews(state: ListeningState): readonly KanaView[] {
  return [state.rawView, state.kanaView, ...state.looseViews];
}

/**
 * 入力の 形 ぜんぶ。**リスニングでは 字が 想像できない**ので、
 * ひらがな・カタカナ・漢字・英字の どれで 打っても 当たる ように 手を 広げる
 *（2026-09-04 の 指定）。重複は 落とす。
 */
function needleForms(needle: string, kana: string): readonly string[] {
  return [...new Set([needle, kana, looseReading(needle), looseReading(kana)])];
}

/**
 * 原稿の表示率（%）。答え合わせへ進めるかの判定に使う。
 *
 * **分母は「隠せる文字」だけ**。句読点や空白は最初から見えているので、
 * それを数に入れると何も当てていないのに 11% から始まる。
 */
export function revealRate(state: ListeningState): number {
  if (state.hideableCount === 0) return 100;
  let shown = 0;
  for (const index of state.revealed) {
    if (isHideable(state.transcript[index])) shown += 1;
  }
  return Math.round((shown / state.hideableCount) * 100);
}

/** 隠す対象の文字か（かな・漢字・数字）。 */
function isHideable(char: string | undefined): boolean {
  return char !== undefined && /[\p{Letter}\p{Number}]/u.test(char);
}

/**
 * 保存してある入力を順に流し込んで、続きから始められるようにする。
 *
 * 開いた場所そのもの（位置の集合）ではなく**入力した言葉**を保存する。
 * 位置は台本を1文字直すだけでずれるが、言葉なら意味が変わらない。
 */
export function replayListening(state: ListeningState, inputs: readonly string[]): ListeningState {
  let next = state;
  for (const input of inputs) next = submitListening(next, input);
  // やり直しの途中でついたミスは持ち越さない（前回の失敗を今日の回数に足さない）
  return { ...next, misses: 0, log: [] };
}

/** あと何こ見つければよいか。「のこり」を主役に出すために使う。 */
export function remainingKeywords(state: ListeningState): number {
  return state.keywords.length - state.foundKeywords.length;
}

/* ------------------------------------------------------------------ *
 * 何を 鳴らすか（音か 動画か）
 * ------------------------------------------------------------------ */

/**
 * その 教材が 鳴らす もの。
 *
 * ## なぜ 画面の 中で 分岐させないか
 * 判断そのものを **試せる ところに 置く** ため。画面（`playback-mode.tsx`）は
 * この 答えで 札を 選ぶだけに して、決まりは ここで 1回 書く。
 * 単体テストは DOM を 持たない（`vitest.config.ts` の environment は node）ので、
 * JSX の 中に 埋めると **この 分岐だけ 誰も 確かめられなく なる**。
 *
 * ## 2つ 以上 来たら 動画 → YouTube → 音 の 順
 * 2つ 置くのは スキーマが 止める（`listeningSchema` の検査）。それでも 来たら
 * どれかを 出す——**画面が 落ちない** ほうへ 倒す（合流は git ∪ DB で、
 * DB側は 古いスキーマの ままでも 読める）。
 */
export function mediaKind(listening: {
  audioUrl?: string;
  videoUrl?: string;
  youtube?: string;
}): "video" | "youtube" | "audio" | "none" {
  if (listening.videoUrl) return "video";
  if (listening.youtube) return "youtube";
  if (listening.audioUrl) return "audio";
  return "none";
}
