/**
 * メールの 欄（`fillin`）を **中身で** 見る — 1字1句では なく
 *
 * 2026-10-26 の 指定:「AIのチェックが厳密すぎる。１言１句ではなく、内容を捉えられているかを
 * 確認するようにしてほしい。例（これは誤りではない）正解：システム管理部の佐藤さん
 * 誤り：システム管理部佐藤さん」。
 *
 * それまでの 欄の ⭕✗は「正解の ことばが そのまま 入って いるか」だけで、
 * 助詞（の）を 1つ 抜いただけで ✗に なって いた。ここでは 2段で 見る。
 *
 * 1. **アプリが 決める ⭕**（`fillinContentMatches`）… 正解を ことばの かたまりに 分け、
 *    助詞・呼び方（さん／様）・ていねいな 形（ません／います）・時刻の 書き方の ちがいを
 *    そろえて から、かたまりが ぜんぶ 入って いるかを 見る。鍵が 無くても 同じ ⭕が 出る
 * 2. **AIが 決めて よい ⭕**（`fillinAiMayAccept`）… 1 で ✗の 欄だけ、言いかえ（会議／
 *    ミーティング）や 省略を AIに 中身で 見て もらう。ただし **数字と 日にちが ちがう ものは
 *    AIでも ⭕に しない**——機械が 確かに 見られる ところは 機械が 守る
 *
 * どちらも **メモを 丸ごと 貼った もの**は 通さない（長さの 見張りは `fillinSlotOk`）。
 */

import { normalizeReading } from "@/lib/text/normalize";

/**
 * 呼び方と 役職。宛先の **だれか**は 名前と 部署で 決まり、ここは 言い方の ちがい
 *（社外の 人に「田中様」と 書くのは むしろ 正しい）。長い ものから 落とす。
 */
const ADDRESS =
  /株式会社|みなさま|みなさん|皆様|皆さん|みんな|各位|まねーじゃー|部長|課長|係長|社長|さま|さん|様|殿/g;

/** ていねいな 形・たのむ 形を ふつうの 形に そろえる（並びの 順に 当てる）。 */
const PLAIN_FORMS: readonly (readonly [RegExp, string])[] = [
  [/して(?:ください|下さい)/g, "する"],
  [/ませんでした/g, "なかった"],
  [/ません/g, "ない"],
  [/ないです/g, "ない"],
  [/てます/g, "ている"],
  [/でます/g, "でいる"],
  [/います/g, "いる"],
  [/します/g, "する"],
  [/てる/g, "ている"],
  [/でる/g, "でいる"],
];

/** 同じ 日を 指す 言い方（5/10＝5月10日・金曜日＝金曜 も ここで そろえる）。 */
const SAME_DAY: readonly (readonly [RegExp, string])[] = [
  [/本日|きょう/g, "今日"],
  [/明朝/g, "明日の朝"],
  [/あした/g, "明日"],
  [/([月火水木金土日])曜日/g, "$1曜"],
  [/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/g, "$1月$2日"],
];

/**
 * 「いつ」を 決める ことば。数字と 同じく、ちがえば 中身が ちがう
 *（変更前と 変更後を 取りちがえた、が いちばん 起きやすい）。
 */
const DAY_WORDS = [
  "今日",
  "明日",
  "昨日",
  "今週",
  "来週",
  "先週",
  "今月",
  "来月",
  "月曜",
  "火曜",
  "水曜",
  "木曜",
  "金曜",
  "土曜",
  "日曜",
] as const;

/** 打ち消し（できない・しなくて）。中身が 反対に なる ので、合って いなければ ✗。 */
const NEGATIVE = /な(?:い|く|かっ)/;

/** かたまりの うしろに 付く 助詞（長い ものから）。 */
const TRAILING_PARTICLE = /(?:からの|までの|との|への|での|から|まで|の|が|を|に|は|で|と|へ|も)$/;

/** かな以外（漢字・カタカナ・数字・英字）を 含むか。かなだけの かたまりは「いる」「こと」など。 */
const HAS_CONTENT = /[^\s\u3040-\u309f]/;

/** 時刻の 書き方を「15:00」に そろえる（15時・15時30分・15時半・午後3時・09:00）。 */
function normalizeTimes(text: string): string {
  // 「3時間」は 時刻では ない（時の すぐ あとの 間で はずす）
  return text.replace(
    /(午後|午前)?(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分|(半))?(?!間))/g,
    (_whole, ampm?: string, h?: string, colon?: string, min?: string, han?: string) => {
      let hour = Number(h);
      if (ampm === "午後" && hour < 12) hour += 12;
      const minute = colon ?? min ?? (han ? "30" : "00");
      return `${hour}:${minute.padStart(2, "0")}`;
    },
  );
}

/** くらべる ための 形（`normalizeReading` の うえに、呼び方・ていねいな 形・時刻・日を そろえる）。 */
export function contentForm(text: string): string {
  // 「3〜5ページ」の 〜 は `normalizeReading` が 落とす（35に なる）ので、先に「から」に する
  const ranged = text.normalize("NFKC").replace(/(\d)\s*[~〜\-−‐–—ー]\s*(?=\d)/g, "$1から");
  let form = normalizeReading(ranged).replace(ADDRESS, "");
  for (const [from, to] of PLAIN_FORMS) form = form.replace(from, to);
  for (const [from, to] of SAME_DAY) form = form.replace(from, to);
  return normalizeTimes(form);
}

function numbersOf(form: string): Set<string> {
  return new Set(form.match(/\d+:\d{2}|\d+/g) ?? []);
}

function daysOf(form: string): Set<string> {
  return new Set(DAY_WORDS.filter((word) => form.includes(word)));
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((one) => b.has(one));
}

/**
 * **数字と 日にちが 合って いるか**（AIに まかせても ここは 守る）。
 *
 * - 正解に 数字が あれば、書いた 数字が 同じ 組み合わせで ある こと（15:00 と 16:00 は ちがう）
 * - 正解に 日の ことばが あれば、同じ 日を 書いて いる こと。ただし「今日」だけは
 *   書かなくても よい（今日の 連絡で「15:00に 直る 予定」は 今日の こと）
 */
function timesAgree(answer: string, written: string): boolean {
  const wantNumbers = numbersOf(answer);
  if (wantNumbers.size > 0 && !sameSet(wantNumbers, numbersOf(written))) return false;
  const wantDays = daysOf(answer);
  if (wantDays.size === 0) return true;
  const gotDays = daysOf(written);
  if (sameSet(wantDays, gotDays)) return true;
  return wantDays.size === 1 && wantDays.has("今日") && gotDays.size === 0;
}

/**
 * 正解の **中身の かたまり**（助詞を 落とした もの）。
 *
 * 教材の 正解は ことばの 間に スペースが ある（「システム管理部の 佐藤さん」）ので、
 * そこで 分ける。見ない ものは 3つ:
 * - かなだけの かたまり（いる・こと・もう）と 1字の かたまり（朝・他・私）… 言い方の 部品。
 *   ただし 打ち消し（わからない）は 中身なので 残す
 * - かっこの 中（品質管理（QA）チーム の QA）… 別の 呼び名
 * - 日の ことば（今日・金曜）… `timesAgree` が 見る（「今日」を 省いても よい ように）
 */
function contentChunks(answer: string): string[] {
  return answer
    .split(/\s+/)
    .map((chunk) => chunk.replace(/（[^）]*）|\([^)]*\)/g, ""))
    .filter((chunk) => HAS_CONTENT.test(chunk) || NEGATIVE.test(contentForm(chunk)))
    .map((chunk) => contentForm(chunk).replace(TRAILING_PARTICLE, ""))
    .filter((chunk) => chunk.length >= 2 && !(DAY_WORDS as readonly string[]).includes(chunk));
}

/** 文の 中の 格助詞（の・が・を・は）を 落とす。「ログインが できない」と 足しても 通す ため。 */
function withoutCaseParticles(form: string): string {
  return form.replace(/[のがをは]/g, "");
}

/**
 * **アプリが ⭕に して よいか**（中身の かたまりが ぜんぶ 入って いるか）。
 *
 * 「システム管理部佐藤さん」「システム管理部 佐藤様」「ログインできません」
 *「今日 15時」は ⭕。「ログイン」（できないが 無い）・「16:00」（数字が ちがう）・
 *「ログインできる」（反対）は ✗。
 */
export function fillinContentMatches(answer: string, written: string): boolean {
  const form = contentForm(written);
  if (form === "") return false;
  const want = contentForm(answer);
  if (NEGATIVE.test(want) !== NEGATIVE.test(form)) return false;
  if (!timesAgree(want, form)) return false;
  const chunks = contentChunks(answer);
  const loose = withoutCaseParticles(form);
  // 日の ことばだけの 正解（今週の 金曜日）は かたまりが 残らない——全体で くらべる
  if (chunks.length === 0) return loose.includes(withoutCaseParticles(want));
  return chunks.every(
    (chunk) => form.includes(chunk) || loose.includes(withoutCaseParticles(chunk)),
  );
}

/**
 * **AIが 中身を 見て ⭕に して よい 欄か**（アプリが ✗に した 欄の うち）。
 *
 * 言いかえ（ネットワーク障害／ネットワークの システム障害）は 機械では 見分けられないので
 * AIに 見て もらう。ただし 数字と 日にちが ちがう ものは AIが 何と 言っても ✗——
 * ここは 機械が 確かに 見られる うえ、取りちがえると 相手が ちがう 時間に 動く。
 */
export function fillinAiMayAccept(answer: string, written: string): boolean {
  const form = contentForm(written);
  if (form === "") return false;
  return timesAgree(contentForm(answer), form);
}
