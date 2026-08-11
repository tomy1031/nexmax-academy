/**
 * 学習者の なまえ の決まり — **カタカナで書く**（2026-08-11 の指定・願い #14）。
 *
 * なぜカタカナに寄せるか: 先生が読み方に迷わず呼べるようにするため。ローマ字や
 * クメール文字のままだと、日本語の授業で呼び名が定まらない（「Sophea」を先生が
 * 「ソフィー」と読むか「ソピア」と読むかで、本人の呼ばれ方が毎回変わる）。
 *
 * 名前は「苗字」「名前」「先生に呼んでほしい名前」の3つに分けて持つ。
 * 画面とCSVに出る呼び名（`display_name`）は、ここの `buildDisplayName` で組み立てる。
 * 名前の判定・組み立ては全部ここに集める（画面ごとに書かない）。
 */

/** 1つの欄に入れられる長さ。表示用キャッシュ（`nexmax.profile.v3`）の上限にそろえる。 */
export const MAX_NAME_LENGTH = 20;

/** カタカナ・長音符（ー）・中点（・）だけ。語のあいだの半角スペースは許す。 */
const KATAKANA_WORD = "[\\u30A1-\\u30F6\\u30FC\\u30FB]+";
const KATAKANA_NAME = new RegExp(`^${KATAKANA_WORD}(?: ${KATAKANA_WORD})*$`);

/** カタカナで書き直してほしいときの案内。禁止語（AGENTS.md 規律1）を使わない。 */
export const KATAKANA_HINT = "カタカナで かいてね。れい：ソピア";

/** 長すぎるときの案内。 */
export const TOO_LONG_HINT = `みじかく かいてね（${MAX_NAME_LENGTH}文字までです）。`;

export interface LearnerNames {
  /** 苗字（セイ）。カンボジアは苗字が先。 */
  familyName: string;
  /** 名前（メイ）。 */
  givenName: string;
  /** 先生に呼んでほしい名前。空なら「名前」を呼び名にする。 */
  nickname: string;
}

/**
 * 入力を整える。
 *
 * NFKC で 半角カタカナ（ｿﾋﾟｱ）→全角、全角スペース→半角 にそろう。
 * 学習者の端末（Windows・Android の日本語IME）は半角カタカナを平気で出すので、
 * ここで直さないと「見た目は合っているのにカタカナでないと言われる」ことになる。
 * ひらがな→カタカナの変換はしない（打った字が勝手に変わると学習者が驚くため、
 * 変換せずに `katakanaNotice` で書き直しを案内する）。
 */
export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** カタカナだけでできているか（空は false）。 */
export function isKatakanaName(value: string): boolean {
  return KATAKANA_NAME.test(value);
}

/**
 * 学習者に見せる案内。問題なければ null。
 *
 * 未入力は null を返す（「なまえを おねがいね」は入力欄ではなくボタンの下でまとめて伝える。
 * 何も打っていない人に、いきなり赤い注意を出さないため）。
 */
export function katakanaNotice(value: string): string | null {
  const normalized = normalizeName(value);
  if (!normalized) return null;
  if (normalized.length > MAX_NAME_LENGTH) return TOO_LONG_HINT;
  if (!isKatakanaName(normalized)) return KATAKANA_HINT;
  return null;
}

/** 保存してよい なまえ か（苗字と名前は必須・呼び名は任意）。 */
export function areNamesValid(names: LearnerNames): boolean {
  const family = normalizeName(names.familyName);
  const given = normalizeName(names.givenName);
  const nickname = normalizeName(names.nickname);

  if (!isKatakanaName(family) || family.length > MAX_NAME_LENGTH) return false;
  if (!isKatakanaName(given) || given.length > MAX_NAME_LENGTH) return false;
  if (nickname && (!isKatakanaName(nickname) || nickname.length > MAX_NAME_LENGTH)) return false;
  return true;
}

/** 3つの欄をまとめて整える（保存の直前に通す）。 */
export function normalizeNames(names: LearnerNames): LearnerNames {
  return {
    familyName: normalizeName(names.familyName),
    givenName: normalizeName(names.givenName),
    nickname: normalizeName(names.nickname),
  };
}

/**
 * 画面とCSVに出る呼び名（`profiles.display_name`）。
 * 「先生に呼んでほしい名前」があればそれ。無ければ名前、それも無ければ苗字。
 */
export function buildDisplayName(names: LearnerNames): string {
  const { familyName, givenName, nickname } = normalizeNames(names);
  return nickname || givenName || familyName;
}

/** 苗字と名前を並べた表示（カンボジアは苗字が先）。先生の画面で使う。 */
export function buildFullName(names: Pick<LearnerNames, "familyName" | "givenName">): string {
  return [normalizeName(names.familyName), normalizeName(names.givenName)]
    .filter(Boolean)
    .join(" ");
}

/**
 * 苗字と名前が入っているか。
 * 分けて持つ前に作られた行（`family_name` が空）を「入れ直してもらう行」として見分ける。
 */
export function hasLearnerNames(names: Partial<LearnerNames> | null | undefined): boolean {
  if (!names) return false;
  return Boolean(normalizeName(names.familyName ?? "") && normalizeName(names.givenName ?? ""));
}

/**
 * Google に登録された名前から初期値を作る。
 *
 * **カタカナのときだけ採る。** カンボジアの学習者の Google アカウントはほぼローマ字なので、
 * そのまま欄に入れると開いた瞬間に注意書きが出ることになる。使えない名前は欄に入れず、
 * 見本として画面に出すだけにする（2026-08-11 の指定）。
 */
export function katakanaOrEmpty(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = normalizeName(value);
  if (!isKatakanaName(normalized) || normalized.length > MAX_NAME_LENGTH) return "";
  return normalized;
}
