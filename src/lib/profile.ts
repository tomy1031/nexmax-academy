import { markReady } from "@/lib/auth-cookie";
import {
  isPersonalityScores,
  isPersonalityTypeCode,
  PERSONALITY_INTRO,
  PERSONALITY_QUESTIONS,
  type PersonalityAnswer,
  type PersonalityLanguage,
  type PersonalityScores,
  type PersonalityTypeCode,
} from "@/content/personality";
import { areNamesValid, type LearnerNames } from "@/lib/name";
import { isSchoolChosen, isUniversity, type LearnerSchool } from "@/lib/school";

export type Gender = "male" | "female";
export type MapView = "map" | "cards";

/**
 * 診断が完了しているか（20問そろっているか）。
 *
 * 「profiles に行があるか」で判定してはいけない。名前と性別だけ入って診断が
 * 未完了の行は正当に存在しうる（DB制約が answers=[] を許している）のに、
 * 行の有無で弾くと `/welcome` と `/map` を往復して詰む。
 * 判定はここに一本化する。
 */
export function isDiagnosisComplete(answers: unknown): boolean {
  return Array.isArray(answers) && answers.length === PERSONALITY_QUESTIONS.length;
}

/**
 * 診断が終わっている行か（2026-08-24）。**型と性別が入っていることまで見る**。
 *
 * ログインの時点で profiles に行ができるようになったので、`personality_type` も
 * `gender` も空の「登録しただけ」の行が正当に存在する。画面がそれを診断ずみの行と
 * 同じように描くと `getPersonalityType(null)` で落ちるので、ここを通した行だけを
 * 分身・HUD・表示用キャッシュに渡す。
 *
 * ProfileRow を import しないのは、`profile-db` がこのファイルを import しており
 * 逆向きの依存を作らないため。行の形は呼び出し側の型から推論する。
 */
export function isDiagnosedRow<
  T extends { answers: unknown; personality_type: unknown; gender: unknown },
>(row: T): row is T & { personality_type: PersonalityTypeCode; gender: Gender } {
  return (
    isDiagnosisComplete(row.answers) &&
    isPersonalityTypeCode(row.personality_type) &&
    GENDERS.includes(row.gender as Gender)
  );
}

export interface NexmaxProfile {
  displayName: string;
  gender: Gender;
  type: PersonalityTypeCode;
  scores: PersonalityScores;
  createdAt: string;
}

/** 表示用キャッシュ。正データは Supabase の profiles（07 §8.1）。 */
const PROFILE_KEY = "nexmax.profile.v3";
/** v3 で回答形式・スコアの意味が変わったため、旧版は読まずに削除する。 */
const LEGACY_PROFILE_KEYS = ["nexmax.profile.v1", "nexmax.profile.v2"];
const GEMINI_KEY = "nexmax.geminiKey";
const LIVE_MODEL_KEY = "nexmax.liveModel";
const MAP_VIEW_KEY = "nexmax.mapView";
/** 書きかけの20問。保存が済んだら消す（`clearDiagnosisDraft`）。 */
const DIAGNOSIS_DRAFT_KEY = "nexmax.shindanDraft.v1";

const GENDERS: Gender[] = ["male", "female"];

function storage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function isProfile(value: unknown): value is NexmaxProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<NexmaxProfile>;
  return (
    typeof profile.displayName === "string" &&
    profile.displayName.trim().length > 0 &&
    profile.displayName.length <= 20 &&
    GENDERS.includes(profile.gender as Gender) &&
    isPersonalityTypeCode(profile.type) &&
    isPersonalityScores(profile.scores) &&
    typeof profile.createdAt === "string"
  );
}

function removeLegacyProfile(): void {
  const target = storage();
  if (!target) return;
  for (const key of LEGACY_PROFILE_KEYS) target.removeItem(key);
}

export function getProfile(): NexmaxProfile | null {
  removeLegacyProfile();
  const value = storage()?.getItem(PROFILE_KEY);
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: NexmaxProfile): void {
  if (!isProfile(profile)) {
    throw new Error("プロフィールのデータが正しくありません。");
  }
  removeLegacyProfile();
  storage()?.setItem(PROFILE_KEY, JSON.stringify(profile));
  // タイトル画面が「つづきから」を出せるように、サーバからも見える印を付ける。
  // ここを通るのは、診断もなまえも そろっていることを確認した後だけ（願い #17）。
  markReady(true);
}

export function getGeminiKey(): string {
  removeLegacyProfile();
  return storage()?.getItem(GEMINI_KEY) ?? "";
}

export function saveGeminiKey(key: string): void {
  const target = storage();
  if (!target) return;

  const trimmed = key.trim();
  if (trimmed) {
    target.setItem(GEMINI_KEY, trimmed);
  } else {
    target.removeItem(GEMINI_KEY);
  }
}

/**
 * たいわ（Live対話）に使うモデル。
 *
 * コードに1つ決め打ちしていたが、Live のモデル名は入れ替わりが速く、
 * 消えたモデルを指したままだと **キーが正しくても つながらない**。しかも画面には
 * 「じゅんびちゅう」としか出ないので、先生には原因が分からない。
 * だから「AI指示出し」の画面で、そのキーで実際に使えるものから選べるようにする。
 */
export function getLiveModel(): string {
  return storage()?.getItem(LIVE_MODEL_KEY) ?? "";
}

export function saveLiveModel(model: string): void {
  const target = storage();
  if (!target) return;
  const trimmed = model.trim();
  if (trimmed) target.setItem(LIVE_MODEL_KEY, trimmed);
  else target.removeItem(LIVE_MODEL_KEY);
}

export function getMapView(): MapView {
  const value = storage()?.getItem(MAP_VIEW_KEY);
  return value === "cards" ? "cards" : "map";
}

export function saveMapView(view: MapView): void {
  storage()?.setItem(MAP_VIEW_KEY, view);
}

/**
 * 表示用プロフィールのキャッシュだけ消す。
 * 診断がリセットされたときに使う。Gemini キーや表示設定は学習者の持ち物なので残す
 * （`clearNexmaxCache()` は `nexmax.` で始まる全キーを消すため、ここでは使わない）。
 */
export function clearProfile(): void {
  storage()?.removeItem(PROFILE_KEY);
  markReady(false);
}

/* ---------------- 書きかけの診断（20問を落とさないための下書き） ---------------- */

/**
 * 20問の書きかけ。**答えるたびに**この端末へ書く（2026-08-24 の指定）。
 *
 * なぜ要るか: 8/21 の授業では17人が診断に取り組んだのに、記録に残ったのは13人だった。
 * 答えは画面のメモリ（React の state）にしか無く、結果を見て閉じた人・読み込み直した人の
 * 20問は跡形もなく消えていた。ここに置いておけば、開き直しても続きから戻れる。
 *
 * 正データはあくまで Supabase の profiles。ここは**保存が済むまでの控え**なので、
 * 保存できたら必ず消す（`clearDiagnosisDraft`）。ログアウトでは
 * `clearNexmaxCache` が `nexmax.` ごと道連れに消す。
 */
export interface DiagnosisDraft {
  /** 20問ぶん。まだ答えていない設問は null。 */
  answers: (PersonalityAnswer | null)[];
  /** いま何問目を見ていたか。 */
  questionIndex: number;
  /** 20問の前の導入を読み終えていたか。 */
  introRead: boolean;
  language: PersonalityLanguage;
  languageSwitched: boolean;
  names: LearnerNames;
  school: LearnerSchool;
  gender: Gender | null;
  savedAt: string;
}

function isDraftAnswers(value: unknown): value is (PersonalityAnswer | null)[] {
  return (
    Array.isArray(value) &&
    value.length === PERSONALITY_QUESTIONS.length &&
    value.every((answer) => answer === null || answer === "a" || answer === "b")
  );
}

function isDraftNames(value: unknown): value is LearnerNames {
  if (!value || typeof value !== "object") return false;
  const names = value as Partial<LearnerNames>;
  return (
    typeof names.familyName === "string" &&
    typeof names.givenName === "string" &&
    typeof names.nickname === "string"
  );
}

function isDraftSchool(value: unknown): value is LearnerSchool {
  if (!value || typeof value !== "object") return false;
  const school = value as Partial<LearnerSchool>;
  // 選べる値の台帳は src/lib/school.ts。ここで一覧を書き直さない。
  return (
    (school.university === "" || isUniversity(school.university)) &&
    typeof school.cohort === "number"
  );
}

/**
 * 下書きとして読める形か。**壊れていたら null にして捨てる**——
 * 中途半端に読み込むと、20問の途中で画面が固まるほうが学習者には困る。
 */
export function isDiagnosisDraft(value: unknown): value is DiagnosisDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<DiagnosisDraft>;
  return (
    isDraftAnswers(draft.answers) &&
    typeof draft.questionIndex === "number" &&
    Number.isInteger(draft.questionIndex) &&
    draft.questionIndex >= 0 &&
    draft.questionIndex < PERSONALITY_QUESTIONS.length &&
    typeof draft.introRead === "boolean" &&
    // 言語の一覧も台帳（PERSONALITY_INTRO のキー）から引く。
    typeof draft.language === "string" &&
    Object.prototype.hasOwnProperty.call(PERSONALITY_INTRO, draft.language) &&
    typeof draft.languageSwitched === "boolean" &&
    isDraftNames(draft.names) &&
    isDraftSchool(draft.school) &&
    (draft.gender === null || GENDERS.includes(draft.gender as Gender)) &&
    typeof draft.savedAt === "string"
  );
}

/** 文字列から下書きを起こす（保存層に触らない純関数。テストはここを見る）。 */
export function parseDiagnosisDraft(raw: string | null): DiagnosisDraft | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDiagnosisDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getDiagnosisDraft(): DiagnosisDraft | null {
  return parseDiagnosisDraft(storage()?.getItem(DIAGNOSIS_DRAFT_KEY) ?? null);
}

/**
 * 書きかけを残す。**1問も答えていないうちは書かない**——
 * 何も入っていない下書きを置くと、次に開いたときに「続きがある」と誤解させる。
 */
export function saveDiagnosisDraft(draft: DiagnosisDraft): void {
  const target = storage();
  if (!target) return;
  if (!isDiagnosisDraft(draft)) return;
  if (draft.answers.every((answer) => answer === null)) return;
  try {
    target.setItem(DIAGNOSIS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 端末の保存領域がいっぱいでも、診断そのものは続けられる（控えが無いだけ）。
  }
}

/**
 * 書きかけから「しつもんの続き」へ戻ってよいか。
 *
 * 1問も答えていない下書きでは戻さない（何も進んでいないのに、いきなり設問が出る）。
 * なまえ・学校・せいべつがそろっていない人も戻さない——20問の前に入れてもらう欄なので、
 * そこを飛ばすと保存できない答えを積むことになる。
 */
export function canResumeQuestions(
  filled: { names: LearnerNames; school: LearnerSchool; gender: Gender | null },
  draft: DiagnosisDraft | null,
): boolean {
  if (!draft) return false;
  if (!draft.answers.some((answer) => answer !== null)) return false;
  return areNamesValid(filled.names) && isSchoolChosen(filled.school) && filled.gender !== null;
}

export function clearDiagnosisDraft(): void {
  storage()?.removeItem(DIAGNOSIS_DRAFT_KEY);
}

export function clearNexmaxCache(): void {
  const target = storage();
  if (!target) return;

  for (let index = target.length - 1; index >= 0; index -= 1) {
    const key = target.key(index);
    if (key?.startsWith("nexmax.")) target.removeItem(key);
  }
  markReady(false);
}
