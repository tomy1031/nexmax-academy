/**
 * 表記ゆれ正規化 — アプリ内で唯一の実装（設計03 §1.3-3）
 *
 * 判定を書く場所ごとに正規化を再実装しない。読みの判定・自由入力の判定・
 * リスニングのキーワード発見・原稿リベールは、すべてここを通す。
 *
 * 旧アプリの判定は「カタカナ→ひらがな」だけだったため、全角英数・「づ/ず」・
 * 長音のゆれで正しい答えが弾かれていた。ここでは段階を分けて吸収する:
 *   normalizeReading … 通常比較（NFKC・かな統一・記号除去・濁点ゆれ）
 *   looseReading     … さらに長音を母音に展開した最終手段の比較
 */

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_OFFSET = 0x60;

/** 全角カタカナをひらがなに寄せる（ヴ・ヵ・ヶ は後段で個別に処理する）。 */
export function toHiragana(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    out +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_OFFSET)
        : ch;
  }
  return out;
}

/** 長音記号として使われがちな文字たち（ハイフン・ダッシュ類を含む）。 */
const PROLONGED_MARKS = /[ー‐-―−－-]/g;

/** 判定で無視する記号・空白。学習者が「、」や空白を入れても弾かない。 */
const IGNORED_SYMBOLS = /[\s　、。，．.,!?！？「」『』（）()・・~〜_]/g;

/**
 * 比較用の基本形。
 * NFKC（全角英数→半角・半角カナ→全角）→ ひらがな統一 → 記号除去 → 濁点ゆれ吸収。
 */
export function normalizeReading(input: string): string {
  // toHiragana はカタカナ全域を写すため、ヴ→ゔ / ヵ→ゕ / ヶ→ゖ になっている。
  // 通常のかなに落としてから比較する。
  return toHiragana(input.normalize("NFKC"))
    .toLowerCase()
    .replace(PROLONGED_MARKS, "ー")
    .replace(IGNORED_SYMBOLS, "")
    .replace(/づ/g, "ず")
    .replace(/ぢ/g, "じ")
    .replace(/ゔ/g, "ぶ")
    .replace(/ゕ/g, "か")
    .replace(/ゖ/g, "け");
}

/** ひらがなの母音（長音を展開するときの対応表）。 */
const VOWEL_OF: Record<string, string> = {
  あ: "あ",
  い: "い",
  う: "う",
  え: "え",
  お: "お",
};

const ROW_VOWEL = "あいうえお";

/** かな1文字の母音を返す。清音・濁音・拗音の小書きまで対応する。 */
function vowelOf(kana: string): string | null {
  if (VOWEL_OF[kana]) return VOWEL_OF[kana];
  const code = kana.codePointAt(0);
  if (code === undefined) return null;
  // ひらがなの範囲外（漢字・英字など）は母音を持たない
  if (code < 0x3041 || code > 0x3096) return null;
  // 「ゃゅょ」は直前の音ではなく自身の母音（や→あ, ゆ→う, よ→お）に従う
  const SMALL_Y: Record<string, string> = { ゃ: "あ", ゅ: "う", ょ: "お", ゎ: "あ" };
  if (SMALL_Y[kana]) return SMALL_Y[kana];
  const TABLE: Record<string, string> = {
    あ: "あいうえお",
    か: "かきくけこ",
    が: "がぎぐげご",
    さ: "さしすせそ",
    ざ: "ざじずぜぞ",
    た: "たちつてと",
    だ: "だぢづでど",
    な: "なにぬねの",
    は: "はひふへほ",
    ば: "ばびぶべぼ",
    ぱ: "ぱぴぷぺぽ",
    ま: "まみむめも",
    や: "や*ゆ*よ",
    ら: "らりるれろ",
    わ: "わ***を",
  };
  for (const row of Object.values(TABLE)) {
    const idx = row.indexOf(kana);
    if (idx >= 0) return ROW_VOWEL[idx] ?? null;
  }
  const SMALL: Record<string, string> = { ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お" };
  return SMALL[kana] ?? null;
}

/**
 * 最終手段の比較形。長音「ー」を直前の母音に展開する。
 * 「さーばー」と「さあばあ」を同じものとして扱うため。
 */
export function looseReading(input: string): string {
  const base = normalizeReading(input);
  let out = "";
  for (const ch of base) {
    if (ch === "ー") {
      const prev = out.at(-1);
      const vowel = prev ? vowelOf(prev) : null;
      if (vowel) {
        out += vowel;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** 読みが一致するか（基本形 → 長音展開の順に判定する）。 */
export function readingMatches(input: string, expected: string): boolean {
  if (!input) return false;
  if (normalizeReading(input) === normalizeReading(expected)) return true;
  return looseReading(input) === looseReading(expected);
}

/** 自由入力（キーワード・穴埋め）の一致判定。候補のいずれかに当たれば正解。 */
export function answerMatches(input: string, accepted: readonly string[]): boolean {
  return accepted.some((a) => readingMatches(input, a));
}

/* ------------------------------------------------------------------ *
 * 入力の見守り（ひらがな入力チェック）
 * ------------------------------------------------------------------ */

/** 学習者の入力に見つかった問題の種類。文言は feedback.ts が持つ。 */
export type InputIssue = "kanji" | "latin" | "katakana" | "notKana";

const HAS_KANJI = /[㐀-鿿々]/;
const HAS_LATIN = /[A-Za-zＡ-Ｚａ-ｚ]/;
const HAS_KATAKANA = /[ァ-ヶ]/;
const HIRAGANA_ONLY = /^[ぁ-ゖゝゞー]+$/;

/**
 * 入力の問題を1つだけ返す（なければ null）。
 * カタカナは「ひらがなに直して判定する」ので注意止まり——弾かない。
 */
export function inspectReadingInput(raw: string): InputIssue | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (HAS_KANJI.test(trimmed)) return "kanji";
  if (HAS_LATIN.test(trimmed)) return "latin";
  if (HAS_KATAKANA.test(trimmed)) return "katakana";
  if (!HIRAGANA_ONLY.test(normalizeReading(trimmed) || trimmed)) return "notKana";
  return null;
}

/** ひらがな入力チェック（テスト開始前の確認）に合格したか。 */
export function isHiraganaInputReady(raw: string, target: string): boolean {
  if (HAS_KANJI.test(raw) || HAS_LATIN.test(raw)) return false;
  return readingMatches(raw, target);
}
