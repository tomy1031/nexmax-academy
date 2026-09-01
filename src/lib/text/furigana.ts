/**
 * ルビ合成 — コンテンツはプレーンテキスト＋読み辞書で持ち、表示時にここが合成する
 * （AGENTS.md 規律2 / 設計03 §1.3-2）。
 *
 * 旧アプリはデータに `{漢字|ふりがな}` を手書きし、それを innerHTML に流していた。
 * そのため「表示用ルビつきテキスト」と「判定用プレーンテキスト」の二重管理が起き、
 * 読みの取り違えが頻発した。ここでは:
 *   - データは常にプレーン（スキーマの plainText が HTML を弾く）
 *   - 読みは辞書（[表記, よみ] の配列）に集約し、複合語を優先（最長一致）
 *   - 出力は HTML 文字列ではなくセグメント配列。React が <ruby> を組み立てる
 */

/** [表記, よみ] のペア。スキーマの furiganaEntrySchema と対応する。 */
export type FuriganaEntry = readonly [string, string];

/** 最長一致で引くための索引。 */
export interface FuriganaIndex {
  /** 長い表記から順に並べたエントリ。 */
  readonly entries: readonly FuriganaEntry[];
  /** 表記の最大長（走査の打ち切りに使う）。 */
  readonly maxLength: number;
}

/** ルビつき／なしの断片。 */
export interface RubySegment {
  readonly text: string;
  /** 読み。undefined ならルビなしの地の文。 */
  readonly reading?: string;
}

/**
 * 漢字1文字の判定。**ルビ合成と検査で必ずこれを共用する。**
 * 検査側が別の範囲（例: `[一-鿿]`）を書くと、「エンジンには漢字・検査には漢字でない」
 * 字（拡張Aなど）が生まれ、検査は緑なのに画面ではルビの無い漢字が出る。
 */
export const KANJI = /[㐀-鿿々]/;

/**
 * 読み辞書から索引を作る。
 * 複合語を単漢字より先に当てるため、表記の長い順に並べる
 *（「新人」を「新」「人」に割らないための最長一致）。
 */
export function buildFuriganaIndex(entries: readonly FuriganaEntry[] = []): FuriganaIndex {
  const cleaned = entries.filter(
    ([surface, reading]) => surface.length > 0 && reading.length > 0 && KANJI.test(surface),
  );
  const sorted = [...cleaned].sort((a, b) => b[0].length - a[0].length);
  const maxLength = sorted.reduce((max, [surface]) => Math.max(max, surface.length), 0);
  return { entries: sorted, maxLength };
}

/**
 * プレーンテキストを、辞書にある表記だけルビつきにしたセグメント列へ分解する。
 * 重なりは起きない（左から最長一致で消費していく）。
 */
export function annotateRuby(text: string, index: FuriganaIndex): RubySegment[] {
  if (!text) return [];
  if (index.entries.length === 0) return [{ text }];

  const segments: RubySegment[] = [];
  let plainStart = 0;
  let i = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) segments.push({ text: text.slice(plainStart, end) });
  };

  while (i < text.length) {
    // 漢字を含まない位置は辞書に当たらないので走査を省く
    if (!KANJI.test(text[i] ?? "")) {
      i += 1;
      continue;
    }
    const hit = index.entries.find(
      ([surface]) =>
        surface.length <= index.maxLength && text.startsWith(surface, i) && surface.length > 0,
    );
    if (!hit) {
      i += 1;
      continue;
    }
    flushPlain(i);
    segments.push({ text: hit[0], reading: hit[1] });
    i += hit[0].length;
    plainStart = i;
  }
  flushPlain(text.length);
  return segments;
}

/**
 * **ルビの ついた ことばの 内側**の 位置を 集める。
 *
 * 本文の 辞書の 下線（`DictionaryText`）は、当たった ところで 文字列を 切って
 * 前後を 別々に `RubyText` へ わたす。この とき **ルビの ことばの 途中で 切ると、
 * 切れた 側が 読み辞書に 当たらなく なり 裸の 漢字に なる**——
 * 「お客様」の「様」だけが 辞書に あると、「お客」と「様」に 割れて
 * 「客」の ルビが 消えた（2026-08-31 に 実発生。`hourensou.spec` が 見つけた）。
 *
 * ここが 返す 位置では 切らせない。切ってよいのは ルビの 外か、ことばの 境目だけ。
 */
export function rubyInnerPositions(text: string, index: FuriganaIndex): Set<number> {
  const inner = new Set<number>();
  let at = 0;
  for (const segment of annotateRuby(text, index)) {
    if (segment.reading) {
      for (let i = at + 1; i < at + segment.text.length; i += 1) inner.add(i);
    }
    at += segment.text.length;
  }
  return inner;
}

/**
 * 文を「かなだけ」に直す（絵に焼く文字を作るため）。
 *
 * ## なぜ機械変換なのか
 * まんがのセリフを**絵の中に描かせる**モードでは、描く文字列を誰かが決める必要がある。
 * AIに書かせると、絵に焼いた文字とデータのセリフがずれる余地が生まれ、
 * ずれると「セリフを直したのに古い字の絵が公開され続ける」ことになる。
 * 読み辞書からの機械変換にすれば、**セリフが正・絵は写し**という一方向になる。
 *
 * ## なぜ漢字を残さないのか
 * 絵に焼いた漢字にはふりがなを振れない（画像生成でルビは崩れる。実例ゼロ）。
 * 読めない漢字が1つあると学習者はそこで止まる（規律2）。
 * だから焼く文字からは漢字を消す——**かなにすれば全員が読める**。
 *
 * 覆えていない漢字が残るときは `null` を返す。空文字や漢字混じりを返すと、
 * そのまま絵に焼かれてしまう。呼ぶ側に「まだ焼けない」と伝えるほうが安全。
 */
export function kanaOf(text: string, index: FuriganaIndex): string | null {
  const segments = annotateRuby(text, index);
  const kana = segments.map((s) => s.reading ?? s.text).join("");
  return KANJI.test(kana) ? null : kana;
}

/**
 * 読み辞書で覆えていない漢字を、出てきた順に重複なしで返す。
 *
 * 判定は必ず annotateRuby を通す。走査規則をここで書き直すと、「検査は通るのに
 * 画面ではルビが付かない」というズレが生まれ、学習者だけが裸の漢字に出くわす。
 * 最長一致・重なりの扱い・打ち切り条件はすべて annotateRuby が正で、
 * ここは「ルビの付かなかった断片に漢字が残っているか」だけを見る。
 */
export function uncoveredKanji(text: string, index: FuriganaIndex): string[] {
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const segment of annotateRuby(text, index)) {
    // reading があればその断片は辞書に当たっている＝画面でルビが付く
    if (segment.reading) continue;
    for (const char of segment.text) {
      if (!KANJI.test(char) || seen.has(char)) continue;
      seen.add(char);
      uncovered.push(char);
    }
  }
  return uncovered;
}

/**
 * ステージ/問題データのローカル辞書と、全体で共有する辞書を重ねて索引にする。
 * 同じ表記があればローカル側（後勝ち）を優先する。
 */
export function mergeFuriganaEntries(
  ...sources: (readonly FuriganaEntry[] | undefined)[]
): FuriganaEntry[] {
  const map = new Map<string, string>();
  for (const source of sources) {
    for (const [surface, reading] of source ?? []) map.set(surface, reading);
  }
  return [...map.entries()];
}
