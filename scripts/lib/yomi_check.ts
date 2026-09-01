/**
 * 読みの照合 — 「覆えて いるか」では なく「**正しく 読めるか**」を 機械で 見る。
 *
 * ## なぜ 要るか
 * 覆い検査（checkFuriganaCoverage）は 漢字に ルビが 付いた ことしか 見ない。
 * 「考え→かんが」（送りがな落ち）も「会いに→かいい」（単漢字の 暴発）も
 * 「テストの 日→にち」（文脈ちがい）も、**全部 緑の まま 学習者に 届いた**
 * （2026-08-25 #197 / 08-28 #233 / 08-30 監査で 計30件超を 手で 直した実績）。
 * 読みの まちがいは 覆い漏れより 始末が 悪い——学習者は まちがった 読みを
 * 正しい ものとして 覚え、先生も 画面を 見ただけでは 気づけない。
 *
 * ## どう 見るか
 * 1. 学習者が 読む 文（collectLabeledTexts）を、**画面と 同じ** ルビ合成
 *    （annotateRuby ＋ coverageEntries）で「期待の 読み」に する。
 *    検査だけ 別の 走査を 書くと「検査は 通るのに 画面は ちがう」が 生まれる ため、
 *    エンジンは 必ず 共用する（furigana.ts の uncoveredKanji と 同じ 原則）。
 * 2. 同じ 文を 形態素解析（kuromoji・IPA辞書）に かけ、読みを もらう。
 * 3. 両者の **区切りが そろう 位置**で 文を かたまりに 割り、かたまりごとに
 *    読みを 比べる（カタカナ⇄ひらがなは 同一視）。文全体で 比べないのは、
 *    どの ことばが ずれたかを 1秒で 指させる ように する ため。
 * 4. 食い違いは **エラー**。正しいのに 解析が まちがう もの（「一人＝ひとり」を
 *    いちにん と 解析する など）は scripts/lib/yomi_allow.ts に 理由つきで 書く。
 *    **書く＝目で 確かめた 印**（VERIFIED_SPLIT_COMPOUNDS と 同じ 運用）。
 *
 * ## 境界
 * - 解析器も まちがえる。だから「解析と 違う＝即 まちがい」では なく
 *   「違ったら 人が 見て、確かめた 結果を 台帳に 残す」仕組みに する。
 * - kuromoji は devDependency（Node の 検査でだけ 動く）。Worker・ブラウザには
 *   載せない——画面の ルビは これまでどおり 読み辞書だけで 引く（規律2）。
 * - 先生が スタジオ（DB）で 直した 教材には この 照合は 届かない（kuromoji の
 *   辞書 約18MB は 保存APIに 載らない）。git の 教材が 正の あいだは ここで 全量を
 *   見る。DB 一本化（願い #124）の ときに 置き場を 決め直す。
 */

import { join } from "node:path";
import kuromoji, { type Tokenizer } from "kuromoji";
import { annotateRuby, buildFuriganaIndex, KANJI } from "../../src/lib/text/furigana";
import { foldKana } from "../../src/lib/text/furigana-checks";
import {
  collectLabeledTexts,
  coverageEntries,
  type ContentEntry,
  type Finding,
} from "../../src/lib/content-checks";
import { YOMI_ALLOW } from "./yomi_allow";

const DIC_PATH = join(import.meta.dirname, "..", "..", "node_modules", "kuromoji", "dict");

let tokenizerPromise: Promise<Tokenizer> | null = null;

/** 形態素解析器（辞書の読み込みが重いので1回だけ作る）。 */
function getTokenizer(): Promise<Tokenizer> {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
  return tokenizerPromise;
}

/**
 * 確かめ済み一覧に 当たるか。
 * かたまりの 区切りは 分かち書きの 空白を 含む ことが ある（「行って 」など）ので、
 * 前後の 空白は 落として 比べる——空白の 有無だけで 台帳が 外れると、同じ 読みを
 * ファイルごとに もう一度 確かめさせられる（2026-09-01 の 導入時に 実発生）。
 */
function isAllowed(surface: string, expected: string, text: string): boolean {
  const chunk = surface.trim();
  const foldedExpected = foldKana(expected).trim();
  return YOMI_ALLOW.some(
    (entry) =>
      entry.surface.trim() === chunk &&
      foldKana(entry.reading).trim() === foldedExpected &&
      (!entry.where || text.includes(entry.where)),
  );
}

/** 断片列の 累積位置（0 と 全長を 含む）。 */
function boundaries(lengths: readonly number[]): number[] {
  const out = [0];
  let at = 0;
  for (const len of lengths) {
    at += len;
    out.push(at);
  }
  return out;
}

/** エラーメッセージに 添える 前後の 文脈（どの 文か 迷わない ように）。 */
function contextOf(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 8);
  const to = Math.min(text.length, end + 8);
  return `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`;
}

interface TextSource {
  readonly field: string;
  readonly text: string;
}

/** 1つの 文を 照合する（索引は 呼ぶ側が 画面と 同じ ものを 渡す）。 */
export function compareReadings(
  file: string,
  source: TextSource,
  index: ReturnType<typeof buildFuriganaIndex>,
  tokenizer: Tokenizer,
): Finding[] {
  const { field, text } = source;
  const findings: Finding[] = [];
  const segments = annotateRuby(text, index);
  const tokens = tokenizer.tokenize(text);

  // 表層形の 連結が 元の 文に 戻らないと 位置が 数えられない（起きない はずだが、
  // 起きたら 黙って 通すのでは なく「照合できない」と 言う）。
  const joined = tokens.map((t) => t.surface_form).join("");
  if (joined !== text) {
    findings.push({
      file,
      level: "error",
      message: `読みの照合: ${field} を 形態素解析が 元の 文に 戻せない（照合できない）— 文字を 確かめる: 「${contextOf(text, 0, 24)}」`,
    });
    return findings;
  }

  const segBounds = new Set(boundaries(segments.map((s) => s.text.length)));
  const tokBounds = boundaries(tokens.map((t) => t.surface_form.length));
  const common = tokBounds.filter((b) => segBounds.has(b));

  let segAt = 0;
  let segPos = 0;
  let tokAt = 0;
  let tokPos = 0;

  for (let c = 0; c + 1 < common.length; c += 1) {
    const start = common[c]!;
    const end = common[c + 1]!;
    const chunk = text.slice(start, end);

    // この かたまりに 入る 断片と token を 集める（境界が そろって いるので 必ず 収まる）
    const segsIn: typeof segments = [];
    while (segPos < end && segAt < segments.length) {
      const seg = segments[segAt]!;
      segsIn.push(seg);
      segPos += seg.text.length;
      segAt += 1;
    }
    const toksIn: typeof tokens = [];
    while (tokPos < end && tokAt < tokens.length) {
      const tok = tokens[tokAt]!;
      toksIn.push(tok);
      tokPos += tok.surface_form.length;
      tokAt += 1;
    }

    if (!KANJI.test(chunk)) continue;
    // 覆えて いない 漢字は 覆い検査の 担当（二重に 言わない）
    if (segsIn.some((seg) => !seg.reading && KANJI.test(seg.text))) continue;

    const expected = segsIn.map((seg) => seg.reading ?? seg.text).join("");

    const unknown = toksIn.some((tok) => !tok.reading && KANJI.test(tok.surface_form));
    if (unknown) {
      if (isAllowed(chunk, expected, text)) continue;
      findings.push({
        file,
        level: "error",
        message:
          `読みの照合: ${field} の「${chunk}」を 形態素解析が 知らない（読みを 確かめられない）` +
          `— 画面は「${expected}」。読みを 目で 確かめて scripts/lib/yomi_allow.ts に {surface:"${chunk}", reading:"${expected}"} を 理由つきで 足す` +
          `（文: ${contextOf(text, start, end)}）`,
      });
      continue;
    }

    // 漢字を含まない token は 表層を そのまま 使う——画面も 漢字以外は 変換しないので、
    // 解析器が 記号や カタカナ語に つける 読み（「＋→たす」など）と 比べては いけない。
    const actual = toksIn
      .map((tok) =>
        KANJI.test(tok.surface_form) ? (tok.reading ?? tok.surface_form) : tok.surface_form,
      )
      .join("");
    if (foldKana(expected) === foldKana(actual)) continue;
    if (isAllowed(chunk, expected, text)) continue;

    findings.push({
      file,
      level: "error",
      message:
        `読みの照合: ${field} の「${chunk}」— 画面は「${expected}」、形態素解析は「${foldKana(actual)}」` +
        `（文: ${contextOf(text, start, end)}）。読みが まちがいなら furigana を 直す。` +
        `画面が 正しいなら scripts/lib/yomi_allow.ts に 理由つきで 足す`,
    });
  }

  return findings;
}

/**
 * 全コンテンツの 学習者向け文を 照合する（lint:content 第7c段）。
 * 索引は 覆い検査と 同じ coverageEntries から 作る＝画面が 引く ものと 同じ。
 */
export async function checkYomiCorrectness(entries: readonly ContentEntry[]): Promise<Finding[]> {
  const tokenizer = await getTokenizer();
  const findings: Finding[] = [];
  for (const { file, content } of entries) {
    const index = buildFuriganaIndex(coverageEntries(content));
    for (const source of collectLabeledTexts(content)) {
      findings.push(...compareReadings(file, source, index, tokenizer));
    }
  }
  return findings;
}
