/**
 * ログインした時点で「登録」する（2026-08-25 の指定）。
 *
 * なぜ要るか: これまで `profiles` に行ができるのは **20問を保存できたとき**だけだった。
 * ログインしただけの人は `auth.users` にしか居らず、先生の画面からは存在ごと見えない。
 * 8/21 の授業では17人が診断に取り組んだのに名簿に出たのは13人で、残りは
 * 「ログインした事実すら」どこにも残っていなかった（supabase/migrations/20260824090000）。
 *
 * その直しはDBのトリガーで入れたが、トリガーは **SQL を手で流して初めて効く**うえ、
 * `auth.users` へ追加された瞬間（＝いちばん最初のログイン）にしか動かない。
 * ここはアプリ側の同じ直しで、
 *   1. 行が無ければ作る（＝まだ登録されていない人を登録する）
 *   2. **端末にだけ残っている情報**（ネクマックスの20問・なまえ・がっこう・せいべつ）を
 *      一緒に登録する
 * の2つをやる。2 はDBのトリガーには絶対にできない——localStorage はブラウザにしか無い。
 *
 * 決まりごと（この順で読むと全部つながる）:
 *   - **DBが正**。すでに入っている値は上書きしない。端末の情報で埋めるのは**空いている欄だけ**。
 *   - 20問は `answers` がそろっているときだけ登録する。タイプとスコアと答えは
 *     いつも一緒に動く（DBの `profiles_personality_v3_check` が対で見ている）。
 *   - 登録に失敗しても学習を止めない。ログインできなくなるほうが害が大きい。
 */

import {
  calculatePersonalityScores,
  scorePersonality,
  type PersonalityAnswer,
  type PersonalityLanguage,
  type PersonalityTypeCode,
} from "@/content/personality";
import {
  areNamesValid,
  buildDisplayName,
  hasLearnerNames,
  normalizeNames,
  type LearnerNames,
} from "@/lib/name";
import {
  clearDiagnosisDraft,
  getDiagnosisDraft,
  getProfile,
  isDiagnosedRow,
  isDiagnosisComplete,
  saveProfile,
  type DiagnosisDraft,
  type Gender,
  type NexmaxProfile,
} from "@/lib/profile";
import {
  insertPersonalityResultOnce,
  PERSONALITY_VERSION,
  type PersonalityResultInput,
  type ProfileRow,
} from "@/lib/profile-db";
import { isSchoolChosen } from "@/lib/school";
import { createClient } from "@/lib/supabase/client";

/**
 * 登録の判断に使う列だけ。`select("*")` にしないのは、
 * ログインのたびに全員が通る道だから（願い #17）。
 */
export const REGISTRATION_COLUMNS =
  "family_name, given_name, nickname, display_name, university, cohort, gender, answers";

export type RegistrationRow = Pick<
  ProfileRow,
  | "family_name"
  | "given_name"
  | "nickname"
  | "display_name"
  | "university"
  | "cohort"
  | "gender"
  | "answers"
>;

/** 端末にだけ残っているかもしれない情報。 */
export interface LocalRegistration {
  /** 書きかけ・書き終わりの20問（`nexmax.shindanDraft.v1`）。なまえ・がっこうも入っている。 */
  draft: DiagnosisDraft | null;
  /** 表示用の控え（`nexmax.profile.v3`）。答えを持たないので、呼び名とせいべつだけ使える。 */
  cached: NexmaxProfile | null;
}

export interface RegistrationPlan {
  /** 行そのものが無い＝まだ登録されていない人。 */
  insert: boolean;
  /** 書き込む列。DBで空いている欄だけが入る。 */
  columns: Record<string, unknown>;
  /** 記録台帳（`personality_results`）へ積む結果。20問がそろったときだけ。 */
  result: PersonalityResultInput | null;
}

/** 20問がそろっているか。1つでも未回答なら診断としては登録できない。 */
function completedAnswers(draft: DiagnosisDraft | null): PersonalityAnswer[] | null {
  if (!draft) return null;
  return draft.answers.every((answer): answer is PersonalityAnswer => answer !== null)
    ? [...(draft.answers as PersonalityAnswer[])]
    : null;
}

/** 端末のなまえ。**カタカナとして保存できる形のときだけ**採る（DBのCHECKに弾かれるため）。 */
function localNames(draft: DiagnosisDraft | null): LearnerNames | null {
  if (!draft) return null;
  return areNamesValid(draft.names) ? normalizeNames(draft.names) : null;
}

/**
 * 何を登録するかを決める。**保存層に触らない純関数**（テストはここを見る）。
 *
 * @param row いまDBにある行。null は「まだ登録されていない人」。
 * @param local 端末に残っている情報。
 * @returns 書くものが何も無ければ null。
 */
export function planRegistration(
  row: RegistrationRow | null,
  local: LocalRegistration,
): RegistrationPlan | null {
  const insert = row === null;
  const draft = local.draft;
  const columns: Record<string, unknown> = {};
  // 版は default を持たない列なので、行を作るなら必ず明示的に書く（07 §8.1）。
  if (insert) columns.personality_version = PERSONALITY_VERSION;

  // ── なまえ ────────────────────────────────────────────────────────────
  // 苗字と名前がDBにそろっていれば触らない。そろっていないときだけ端末から埋める。
  const names = localNames(draft);
  const dbNames = { familyName: row?.family_name ?? "", givenName: row?.given_name ?? "" };
  if (!hasLearnerNames(dbNames) && names) {
    columns.family_name = names.familyName;
    columns.given_name = names.givenName;
    columns.nickname = names.nickname;
    columns.display_name = buildDisplayName(names);
  } else if (!row?.display_name && local.cached?.displayName) {
    // 3欄には分けられないが呼び名だけは分かる場合（鍵ゼロのデモモードで診断した端末など）。
    // 先生の名簿が「メールだけの行」にならないよう、呼び名だけでも登録する。
    columns.display_name = local.cached.displayName;
  }

  // ── がっこう ──────────────────────────────────────────────────────────
  const school = draft?.school ?? null;
  const dbSchool = { university: row?.university ?? "", cohort: row?.cohort ?? 0 };
  if (school && !isSchoolChosen(dbSchool) && isSchoolChosen(school)) {
    columns.university = school.university;
    columns.cohort = school.cohort;
  }

  // ── せいべつ ──────────────────────────────────────────────────────────
  const gender: Gender | null = row?.gender ?? draft?.gender ?? local.cached?.gender ?? null;
  if (!row?.gender && gender) columns.gender = gender;

  // ── ネクマックス（20問） ───────────────────────────────────────────────
  // 端末に20問そろっているのにDBが未診断なら、それが 8/21 に消えたぶんである。
  // せいべつが分からないときは登録しない——DBの `profiles_answered_row_is_complete` が
  // 「答えがそろった行は必ず型とせいべつを持つ」を求めるため、送っても弾かれる。
  const answers = completedAnswers(draft);
  let result: PersonalityResultInput | null = null;
  if (draft && answers && gender && !isDiagnosisComplete(row?.answers)) {
    const scores = calculatePersonalityScores(answers);
    const personalityType: PersonalityTypeCode = scorePersonality(answers);
    const answerLanguage: PersonalityLanguage = draft.language;
    const languageSwitched = draft.languageSwitched;

    columns.personality_type = personalityType;
    columns.answers = answers;
    columns.scores = scores;
    columns.answer_language = answerLanguage;
    columns.language_switched = languageSwitched;
    columns.personality_version = PERSONALITY_VERSION;
    result = { personalityType, answers, scores, answerLanguage, languageSwitched };
  }

  if (!insert && Object.keys(columns).length === 0) return null;
  return { insert, columns, result };
}

/** 端末に残っている情報を読む。 */
export function readLocalRegistration(): LocalRegistration {
  return { draft: getDiagnosisDraft(), cached: getProfile() };
}

export type RegistrationOutcome =
  /** ログインしていない・Supabase 未設定など、やることが無かった。 */
  | "skipped"
  /** すでに登録ずみで、端末から足すものも無かった。 */
  | "unchanged"
  /** 行を作った（＝まだ登録されていなかった人）。 */
  | "registered"
  /** 行はあったので、端末にあった情報だけ足した。 */
  | "updated"
  /** 送ったが受け取ってもらえなかった（学習は止めない）。 */
  | "failed";

/**
 * まだ登録されていなければ登録し、端末にある情報を一緒に送る。
 *
 * セッションは `getSession()`（端末の中を見るだけ・往復ゼロ）から取る。
 * `getUser()` を打たないのは、**書けるかどうかを決めるのは RLS だから**である——
 * 端末の申告が古くても `auth.uid() = id` を満たさない書き込みはDB側で落ちる。
 */
export async function registerOnLogin(): Promise<RegistrationOutcome> {
  const supabase = createClient();
  if (!supabase) return "skipped";

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return "skipped";

  const { data, error } = await supabase
    .from("profiles")
    .select(REGISTRATION_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();
  if (error) return "failed";

  const row = (data as RegistrationRow | null) ?? null;
  const plan = planRegistration(row, readLocalRegistration());
  if (!plan) return "unchanged";

  // insert と update を1つの道にまとめる。`upsert` は渡した列だけを書くので、
  // 行があるときは「空いている欄を埋める」だけになる（既存の値を消さない）。
  const { data: stored, error: writeError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email ?? "", ...plan.columns }, { onConflict: "id" })
    .select("*")
    .single();
  if (writeError || !stored) return "failed";

  const profile = stored as ProfileRow;

  if (plan.result) {
    try {
      // 二重に積まない道は `profile-db` 側にある（`/welcome` の保存と同じ関門を通す）。
      await insertPersonalityResultOnce(plan.result);
    } catch {
      // 最新の行（profiles）さえ入っていれば先生の画面は成り立つ。台帳の失敗だけを許す。
    }
    // 送れたので控えは要らない。残すと、次に開いたとき「続きがある」と誤解させる。
    clearDiagnosisDraft();
  }

  // 表示用の控えを新しい行で作り直す。ここを通すと「つづきから」の印も付くので、
  // 診断となまえの両方がそろっていることを確かめてからにする（`markReady` の意味）。
  if (
    isDiagnosedRow(profile) &&
    profile.display_name &&
    hasLearnerNames({ familyName: profile.family_name, givenName: profile.given_name })
  ) {
    try {
      saveProfile({
        displayName: profile.display_name,
        gender: profile.gender,
        type: profile.personality_type,
        scores: profile.scores,
        createdAt: profile.created_at,
      });
    } catch {
      // 控えが作れなくても登録そのものは済んでいる。マップが開いた時点で作り直される。
    }
  }

  return plan.insert ? "registered" : "updated";
}
