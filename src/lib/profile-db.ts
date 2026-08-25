import type {
  PersonalityAnswer,
  PersonalityLanguage,
  PersonalityScores,
  PersonalityTypeCode,
} from "@/content/personality";
import { buildDisplayName, normalizeNames, type LearnerNames } from "@/lib/name";
import type { LearnerSchool } from "@/lib/school";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

/**
 * 診断方式の版。MBTI 4軸 / 16タイプ が v3（07 §8.1）。
 * DBの default に頼らず、insert / upsert が毎回この値を明示的に書く。
 * default 任せにすると、移行中に旧クライアントが送った v2 データまで v3 として記録されてしまう。
 * 履歴の差分比較は、同じ版どうしだけで行う。
 */
export const PERSONALITY_VERSION = 3;

export interface ProfileRow {
  id: string;
  email: string;
  /** 呼び名。`nickname` → `given_name` の順でアプリが組み立てて書く（src/lib/name.ts）。 */
  display_name: string;
  /** 苗字（カタカナ）。分けて持つ前に作られた行は空。 */
  family_name: string;
  /** 名前（カタカナ）。 */
  given_name: string;
  /** 先生に呼んでほしい名前（カタカナ・任意）。 */
  nickname: string;
  /** 学校（AUPP / CADT）。空文字はこの列を足す前の行。 */
  university: string;
  /** 何期生（1〜5）。0 はこの列を足す前の行。 */
  cohort: number;
  /**
   * せいべつ。**null は「登録しただけで、まだ診断していない人」**（2026-08-24）。
   * ログインした時点で行が作られるようになったため、診断前の行が正当に存在する。
   */
  gender: Gender | null;
  /**
   * ネクマックスのタイプ。**null は未診断**（上と同じ理由）。
   * 「診断が終わったか」は行の有無でも この列でもなく `answers` で見る
   * （`isDiagnosisComplete` / `hasCompletedPersonality`）。DBの
   * `profiles_answered_row_is_complete` が「答えがそろった行は必ず型と性別を持つ」を保証する。
   */
  personality_type: PersonalityTypeCode | null;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  personality_version: number;
  /** 診断に答えた言語。null は記録前のデータ（08 §8）。 */
  answer_language: PersonalityLanguage | null;
  /** 診断の途中で言語を切り替えたか。 */
  language_switched: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface OwnProfileInput {
  names: LearnerNames;
  school: LearnerSchool;
  gender: Gender;
  personalityType: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  answerLanguage: PersonalityLanguage;
  languageSwitched: boolean;
}

export interface PersonalityResultRow {
  id: string;
  profile_id: string;
  personality_type: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  personality_version: number;
  answer_language: PersonalityLanguage | null;
  language_switched: boolean;
  created_at: string;
}

export interface PersonalityResultInput {
  personalityType: PersonalityTypeCode;
  answers: PersonalityAnswer[];
  scores: PersonalityScores;
  answerLanguage: PersonalityLanguage;
  languageSwitched: boolean;
}

export interface AdminProfilePatch {
  /** 3つまとめて渡す（呼び名を組み立て直すため、部分更新にしない）。 */
  names?: LearnerNames;
  school?: LearnerSchool;
  gender?: Gender;
  personalityType?: PersonalityTypeCode;
  /**
   * 管理者かどうか（願い #153-5）。
   * **申告どおりに入るとは限らない。** DBの `enforce_profile_identity()` が
   * 「種の2メールは常に管理者」「管理者でない人の更新は前の値のまま」を強制する。
   * 画面は返ってきた行（`is_admin`）を正として表示し直すこと。
   */
  isAdmin?: boolean;
}

/** なまえ3欄を、保存する形（整形＋呼び名）にそろえる。 */
function nameColumns(names: LearnerNames) {
  const normalized = normalizeNames(names);
  return {
    family_name: normalized.familyName,
    given_name: normalized.givenName,
    nickname: normalized.nickname,
    display_name: buildDisplayName(normalized),
  };
}

function requireClient() {
  const supabase = createClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchOwnProfile(): Promise<ProfileRow | null> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function upsertOwnProfile(data: OwnProfileInput): Promise<ProfileRow> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Authentication is required.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        ...nameColumns(data.names),
        university: data.school.university,
        cohort: data.school.cohort,
        gender: data.gender,
        personality_type: data.personalityType,
        answers: data.answers,
        scores: data.scores,
        personality_version: PERSONALITY_VERSION,
        answer_language: data.answerLanguage,
        language_switched: data.languageSwitched,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return profile as ProfileRow;
}

/**
 * じぶんの なまえ・学校（・せいべつ）だけを書き換える。**診断の結果には触らない**。
 *
 * 使う場面は2つ:
 *  1. 診断が終わっている人に20問をやり直させずに、あとから足りない項目を入れてもらう
 *    （なまえを分ける前に作られた行は `family_name` が空、学校の列を足す前の行は
 *     `university` が空。§src/lib/name.ts `hasLearnerNames` / src/lib/school.ts `isSchoolChosen`）。
 *  2. せっていの画面（`/map/settings`）から、あとで直す。
 *
 * `gender` を渡さなければ その列は触らない（1の場面は せいべつを 入れ直させないため）。
 */
export async function updateOwnDetails(
  names: LearnerNames,
  school: LearnerSchool,
  gender?: Gender,
): Promise<ProfileRow> {
  const supabase = requireClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("Authentication is required.");

  const { data, error } = await supabase
    .from("profiles")
    .update({
      ...nameColumns(names),
      university: school.university,
      cohort: school.cohort,
      ...(gender ? { gender } : {}),
    })
    .eq("id", user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/** ログインしている本人。していなければ投げる。 */
async function requireUser(supabase: ReturnType<typeof requireClient>) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Authentication is required.");
  return user;
}

/** 台帳へ積む本体。本人の確認は呼ぶ側で済ませておく（同じ問い合わせを二度打たないため）。 */
async function insertResultFor(
  supabase: ReturnType<typeof requireClient>,
  profileId: string,
  data: PersonalityResultInput,
): Promise<PersonalityResultRow> {
  const { data: result, error } = await supabase
    .from("personality_results")
    .insert({
      profile_id: profileId,
      personality_type: data.personalityType,
      answers: data.answers,
      scores: data.scores,
      personality_version: PERSONALITY_VERSION,
      answer_language: data.answerLanguage,
      language_switched: data.languageSwitched,
    })
    .select("*")
    .single();
  if (error) throw error;
  return result as PersonalityResultRow;
}

export async function insertPersonalityResult(
  data: PersonalityResultInput,
): Promise<PersonalityResultRow> {
  const supabase = requireClient();
  const user = await requireUser(supabase);
  return insertResultFor(supabase, user.id, data);
}

/**
 * 記録台帳テーブルが未作成（マイグレーション未適用）か。
 * 履歴は補助データなので、無いときは「空」として扱い画面を止めない。
 */
function isMissingResultsTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01";
}

/**
 * 記録台帳へ1本だけ積む。**同じ20問が直前に入っていれば積まない**（2026-08-25）。
 *
 * なぜ要るか: 同じ20問を送る道が2つになった。ログインした時点の登録
 * （`src/lib/register-on-login.ts` — 端末に残っていた答えを送る）と、`/welcome` の
 * 保存である。ログインの直後に開いた `/welcome` は**開いた時点の下書き**を画面に
 * 持っているので、登録が済んだあとでも同じ答えをもう一度保存しうる。台帳が二重に
 * なると、先生の画面では「2回受けた」ように見える。
 *
 * 直前の1本だけを見る（全部を読み比べない）。台帳は受験の順に積むので、同じ答えが
 * **連続している**ことだけが「二重に届いた」の印であり、間に別の回が挟まっていれば
 * それは本当に受け直した記録である。
 *
 * @returns 積んだ行。積まなかったときは null。
 */
export async function insertPersonalityResultOnce(
  data: PersonalityResultInput,
): Promise<PersonalityResultRow | null> {
  const supabase = requireClient();
  const user = await requireUser(supabase);

  const { data: latest, error } = await supabase
    .from("personality_results")
    .select("answers")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // 台帳がまだ無いなら「前の記録は無い」として進む（履歴は補助データ）。
  if (error && !isMissingResultsTable(error)) throw error;

  const previous = (latest as { answers?: PersonalityAnswer[] } | null)?.answers;
  if (Array.isArray(previous) && previous.join("") === data.answers.join("")) return null;

  return insertResultFor(supabase, user.id, data);
}

export async function fetchResultsForProfile(profileId: string): Promise<PersonalityResultRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("personality_results")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingResultsTable(error)) return [];
    throw error;
  }
  return (data ?? []) as PersonalityResultRow[];
}

export async function fetchAllResults(): Promise<PersonalityResultRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("personality_results")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingResultsTable(error)) return [];
    throw error;
  }
  return (data ?? []) as PersonalityResultRow[];
}

export async function fetchAllProfiles(): Promise<ProfileRow[]> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

export async function updateProfileAsAdmin(
  id: string,
  patch: AdminProfilePatch,
): Promise<ProfileRow> {
  const supabase = requireClient();
  const update: Record<string, string | number | boolean> = {};
  if (patch.names !== undefined) Object.assign(update, nameColumns(patch.names));
  if (patch.school !== undefined) {
    update.university = patch.school.university;
    update.cohort = patch.school.cohort;
  }
  if (patch.gender !== undefined) update.gender = patch.gender;
  if (patch.personalityType !== undefined) update.personality_type = patch.personalityType;
  if (patch.isAdmin !== undefined) update.is_admin = patch.isAdmin;

  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * 診断だけを未受験に戻す。プロフィール行は残すので `personality_results` の
 * 受験履歴も残る（削除は cascade で履歴ごと消える。§docs/deploy.md ではなく 07 §8.1）。
 *
 * `answers` と `scores` は**同時に**空へ戻す必要がある。DBの制約が
 * 「両方空」か「20問そろっている」かのどちらかしか許さないため、片方だけだと弾かれる。
 *
 * `personality_type` は not null で「未診断」を表す値がないため、前回のコードが残る。
 * 画面の判定は `isDiagnosisComplete(answers)` 側で行うので表示には影響しない。
 */
export async function resetDiagnosisAsAdmin(id: string): Promise<ProfileRow> {
  const supabase = requireClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ answers: [], scores: {} })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * プロフィールを完全に削除する。
 * **`personality_results` の受験履歴も cascade で消える**（不可逆）。
 * 診断をやり直させたいだけなら `resetDiagnosisAsAdmin` を使う。
 */
export async function deleteProfileAsAdmin(id: string): Promise<void> {
  const supabase = requireClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}
