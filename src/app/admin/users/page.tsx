"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { TypeEmblem } from "@/components/nexmax-types";
import {
  PERSONALITY_AXES,
  PERSONALITY_AXIS_META,
  PERSONALITY_TYPES,
  getFamilyForCode,
  getPersonalityFamily,
  getPersonalityType,
  pickPersonalityCode,
  type PersonalityTypeCode,
} from "@/content/personality";
import { hasCompletedPersonality } from "@/lib/personality-stats";
import {
  deleteProfileAsAdmin,
  fetchAllProfiles,
  fetchOwnProfile,
  resetDiagnosisAsAdmin,
  updateProfileAsAdmin,
  type ProfileRow,
} from "@/lib/profile-db";
import {
  areNamesValid,
  buildDisplayName,
  katakanaNotice,
  MAX_NAME_LENGTH,
  type LearnerNames,
} from "@/lib/name";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

interface ProfileDraft {
  names: LearnerNames;
  gender: Gender;
  personalityType: PersonalityTypeCode;
}

/** 16タイプ。組でまとめて選びやすくする。 */
const TYPE_OPTIONS: readonly { id: PersonalityTypeCode; label: string }[] = PERSONALITY_TYPES.map(
  (type) => ({
    id: type.code,
    label: `${getPersonalityFamily(type.familyId).name}・${type.shortName}`,
  }),
);

function draftFromProfile(profile: ProfileRow): ProfileDraft {
  return {
    names: {
      familyName: profile.family_name ?? "",
      givenName: profile.given_name ?? "",
      nickname: profile.nickname ?? "",
    },
    gender: profile.gender,
    personalityType: profile.personality_type,
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/welcome");
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/welcome");
        return;
      }
      try {
        const ownProfile = await fetchOwnProfile();
        if (!active) return;
        // プロフィール未作成＝オンボーディング未完了。権限以前の問題なので /welcome へ。
        if (!ownProfile) {
          router.replace("/welcome");
          return;
        }
        if (!ownProfile.is_admin) {
          router.replace("/map");
          return;
        }
        const allProfiles = await fetchAllProfiles();
        if (!active) return;
        setProfiles(allProfiles);
        setDrafts(
          Object.fromEntries(allProfiles.map((profile) => [profile.id, draftFromProfile(profile)])),
        );
        setLoading(false);
      } catch (error) {
        // 取得エラーは権限の問題ではない。理由を画面に出す（黙って戻さない）。
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [router]);

  function updateDraft(id: string, patch: Partial<ProfileDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id]!, ...patch },
    }));
  }

  function isChanged(profile: ProfileRow): boolean {
    const draft = drafts[profile.id];
    return Boolean(
      draft &&
      (draft.names.familyName !== (profile.family_name ?? "") ||
        draft.names.givenName !== (profile.given_name ?? "") ||
        draft.names.nickname !== (profile.nickname ?? "") ||
        draft.gender !== profile.gender ||
        draft.personalityType !== profile.personality_type),
    );
  }

  async function saveRow(profile: ProfileRow) {
    const draft = drafts[profile.id];
    if (!draft || !isChanged(profile)) return;
    setSavingId(profile.id);
    try {
      const updated = await updateProfileAsAdmin(profile.id, draft);
      setProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((current) => ({
        ...current,
        [updated.id]: draftFromProfile(updated),
      }));
      showToast("保存しました。");
    } catch {
      showToast("保存に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function resetDiagnosis(profile: ProfileRow) {
    if (
      !window.confirm(
        `${profile.email} の診断をリセットします。\n\n` +
          `・次のログイン時に、この人はもう一度20問に答えます\n` +
          `・受験履歴は残ります（プロフィールと名前・性別もそのまま）\n\n` +
          `よろしいですか？`,
      )
    ) {
      return;
    }
    setSavingId(profile.id);
    try {
      const updated = await resetDiagnosisAsAdmin(profile.id);
      setProfiles((current) => current.map((item) => (item.id === profile.id ? updated : item)));
      showToast("診断をリセットしました。");
    } catch {
      showToast("診断のリセットに失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(profile: ProfileRow) {
    if (
      !window.confirm(
        `${profile.email} を完全に削除します。\n\n` +
          `・受験履歴もすべて消えます（元に戻せません）\n` +
          `・診断をやり直させたいだけなら「診断リセット」を使ってください\n\n` +
          `本当に削除しますか？`,
      )
    ) {
      return;
    }
    setSavingId(profile.id);
    try {
      await deleteProfileAsAdmin(profile.id);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      showToast("削除しました。");
    } catch {
      showToast("削除に失敗しました。");
    } finally {
      setSavingId(null);
    }
  }

  // エラーは loading の内外を問わず最優先で出す。ここを loading の内側に入れると、
  // 取得失敗時に「空の一覧」が正常画面として表示されてしまう。
  if (errorMessage) return <AdminError message={errorMessage} />;
  if (loading) return <AdminLoading />;

  return (
    <AdminPageFrame>
      <AdminHeader title="ユーザー" />
      <section className="card-pop mx-auto max-w-[96rem] p-5 sm:p-8">
        <h1 className="text-navy text-2xl font-black sm:text-3xl">管理者画面 — ユーザー管理</h1>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[80rem] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-ink-soft text-left">
                <th className="px-3">メール</th>
                <th className="px-3">なまえ</th>
                <th className="px-3">性別</th>
                <th className="px-3">ネクマックス</th>
                <th className="px-3">タイプを 変える</th>
                <th className="px-3">スコア</th>
                <th className="px-3">管理者</th>
                <th className="px-3">作成日</th>
                <th className="px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const draft = drafts[profile.id] ?? draftFromProfile(profile);
                const diagnosed = hasCompletedPersonality(profile);
                // 管理者はタイプだけを手で変えられる。スコアは診断の記録なので書き換えない
                // 代わりに、コードとスコアが食い違っている行をここで可視化する。
                const mismatched =
                  diagnosed && pickPersonalityCode(profile.scores) !== profile.personality_type;
                return (
                  <tr key={profile.id} className="bg-white shadow-sm">
                    <td className="rounded-l-2xl px-3 py-3 font-medium">{profile.email}</td>
                    <td className="px-3 py-3">
                      {/* 苗字・名前・呼んでほしい名前の3つ。カタカナで持つ（願い #14）。
                          呼び名（display_name）はこの3つから組み立てるので直接は編集しない。 */}
                      <div className="grid w-48 gap-1.5">
                        {(
                          [
                            { key: "familyName", label: "苗字", placeholder: "ソク" },
                            { key: "givenName", label: "名前", placeholder: "ソピア" },
                            { key: "nickname", label: "よび名", placeholder: "（任意）" },
                          ] as const
                        ).map((field) => {
                          const value = draft.names[field.key];
                          const invalid = katakanaNotice(value) !== null;
                          return (
                            <label key={field.key} className="flex items-center gap-1.5">
                              <span className="text-ink-soft w-11 shrink-0 text-[11px] font-bold">
                                {field.label}
                              </span>
                              <input
                                type="text"
                                maxLength={MAX_NAME_LENGTH}
                                value={value}
                                placeholder={field.placeholder}
                                onChange={(event) =>
                                  updateDraft(profile.id, {
                                    names: { ...draft.names, [field.key]: event.target.value },
                                  })
                                }
                                className={`w-full rounded-xl border-2 px-2 py-1.5 ${
                                  invalid ? "border-coral" : "border-hairline"
                                }`}
                              />
                            </label>
                          );
                        })}
                        {/* なまえを分ける前に作られた行は3欄が空。そのときは「—」ではなく、
                            いま実際に画面へ出ている呼び名（display_name）を見せる。 */}
                        <p className="text-ink-soft text-[11px] font-bold">
                          画面に出る呼び名:{" "}
                          {buildDisplayName(draft.names) || profile.display_name || "—"}
                        </p>
                      </div>
                      <Link
                        href={`/admin/students/${profile.id}`}
                        className="text-sky mt-1 block text-xs font-bold underline underline-offset-2"
                      >
                        個別レポート
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={draft.gender}
                        onChange={(event) =>
                          updateDraft(profile.id, {
                            gender: event.target.value as Gender,
                          })
                        }
                        className="border-hairline rounded-xl border-2 px-3 py-2"
                      >
                        <option value="male">男性</option>
                        <option value="female">女性</option>
                      </select>
                    </td>
                    {/* いま何の人か。診断ずみの行だけ出す。未診断を診断ずみに見せない。 */}
                    <td className="px-3 py-3">
                      {diagnosed ? (
                        <span className="flex items-center gap-2">
                          <TypeEmblem
                            code={profile.personality_type}
                            size={34}
                            className="shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="text-ink block font-extrabold whitespace-nowrap">
                              {getPersonalityType(profile.personality_type).shortName}
                            </span>
                            <span
                              className="block text-[10px] font-bold whitespace-nowrap"
                              style={{ color: getFamilyForCode(profile.personality_type).color }}
                            >
                              {getFamilyForCode(profile.personality_type).name}
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-soft font-bold">未診断</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={draft.personalityType}
                        onChange={(event) =>
                          updateDraft(profile.id, {
                            personalityType: event.target.value as PersonalityTypeCode,
                          })
                        }
                        className="border-hairline rounded-xl border-2 px-3 py-2"
                      >
                        {TYPE_OPTIONS.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {diagnosed ? (
                        <>
                          {PERSONALITY_AXES.map((axis) => {
                            const [first, second] = PERSONALITY_AXIS_META[axis].poles;
                            return (
                              <span key={axis} className="mr-2 inline-block">
                                {first}
                                {profile.scores[axis]}/{second}
                                {5 - profile.scores[axis]}
                              </span>
                            );
                          })}
                          {mismatched && (
                            <span
                              className="ml-1 rounded bg-[#fdf0e4] px-1.5 py-0.5 font-sans text-[10px] font-bold text-[#a5541c]"
                              title={`回答から求まるのは ${getPersonalityType(pickPersonalityCode(profile.scores)).name} です`}
                            >
                              手動変更あり
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink-soft font-sans">未診断</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{profile.is_admin ? "はい" : "いいえ"}</td>
                    <td className="px-3 py-3">
                      {new Date(profile.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="rounded-r-2xl px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={
                            !isChanged(profile) ||
                            !areNamesValid(draft.names) ||
                            savingId === profile.id
                          }
                          onClick={() => void saveRow(profile)}
                          className="bg-navy rounded-xl px-4 py-2 font-bold text-white disabled:opacity-35"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          // 未診断の人にはリセットするものがない
                          disabled={savingId === profile.id || !hasCompletedPersonality(profile)}
                          onClick={() => void resetDiagnosis(profile)}
                          className="border-hairline text-navy rounded-xl border-2 bg-white px-4 py-2 font-bold disabled:opacity-35"
                          title="診断だけを未受験に戻します。受験履歴は残ります。"
                        >
                          診断リセット
                        </button>
                        <button
                          type="button"
                          disabled={savingId === profile.id}
                          onClick={() => void deleteRow(profile)}
                          className="bg-coral rounded-xl px-4 py-2 font-bold text-white disabled:opacity-35"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {toast && (
        <div
          role="status"
          className="bg-navy fixed bottom-6 left-1/2 -translate-x-1/2 rounded-2xl px-6 py-3 font-bold text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </AdminPageFrame>
  );
}
