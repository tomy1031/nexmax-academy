"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import type { PersonalityTypeId } from "@/content/personality";
import {
  deleteProfileAsAdmin,
  fetchAllProfiles,
  fetchOwnProfile,
  updateProfileAsAdmin,
  type ProfileRow,
} from "@/lib/profile-db";
import type { Gender } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

interface ProfileDraft {
  displayName: string;
  gender: Gender;
  personalityType: PersonalityTypeId;
}

const TYPE_OPTIONS: readonly { id: PersonalityTypeId; label: string }[] = [
  { id: "leader", label: "リーダー" },
  { id: "idea", label: "ひらめき" },
  { id: "heart", label: "きづかい" },
  { id: "challenge", label: "チャレンジ" },
];

function draftFromProfile(profile: ProfileRow): ProfileDraft {
  return {
    displayName: profile.display_name,
    gender: profile.gender,
    personalityType: profile.personality_type,
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({});
  const [loading, setLoading] = useState(true);
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
        if (!ownProfile?.is_admin) {
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
      } catch {
        router.replace("/map");
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
      (draft.displayName !== profile.display_name ||
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

  async function deleteRow(profile: ProfileRow) {
    if (!window.confirm(`${profile.email} を削除しますか？`)) return;
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

  if (loading) {
    return <AdminLoading />;
  }

  return (
    <AdminPageFrame>
      <AdminHeader />
      <section className="card-pop mx-auto max-w-[96rem] p-5 sm:p-8">
        <h1 className="text-navy text-2xl font-black sm:text-3xl">管理者画面 — ユーザー管理</h1>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[80rem] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-ink-soft text-left">
                <th className="px-3">メール</th>
                <th className="px-3">なまえ</th>
                <th className="px-3">性別</th>
                <th className="px-3">タイプ</th>
                <th className="px-3">スコア</th>
                <th className="px-3">管理者</th>
                <th className="px-3">作成日</th>
                <th className="px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const draft = drafts[profile.id] ?? draftFromProfile(profile);
                return (
                  <tr key={profile.id} className="bg-white shadow-sm">
                    <td className="rounded-l-2xl px-3 py-3 font-medium">{profile.email}</td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        maxLength={20}
                        value={draft.displayName}
                        onChange={(event) =>
                          updateDraft(profile.id, { displayName: event.target.value })
                        }
                        className="border-hairline w-40 rounded-xl border-2 px-3 py-2"
                      />
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
                    <td className="px-3 py-3">
                      <select
                        value={draft.personalityType}
                        onChange={(event) =>
                          updateDraft(profile.id, {
                            personalityType: event.target.value as PersonalityTypeId,
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
                      L:{profile.scores.leader} / I:{profile.scores.idea} / H:
                      {profile.scores.heart} / C:{profile.scores.challenge}
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
                            !draft.displayName.trim() ||
                            savingId === profile.id
                          }
                          onClick={() => void saveRow(profile)}
                          className="bg-navy rounded-xl px-4 py-2 font-bold text-white disabled:opacity-35"
                        >
                          保存
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
