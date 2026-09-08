"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { fetchOwnProfile } from "@/lib/profile-db";
import { fetchAppSettings, setGatesUnlocked, type AppSettings } from "@/lib/settings-db";
import { createClient } from "@/lib/supabase/client";
import { UNLOCK_FLAG_FRESH_MS } from "@/lib/unlock-flag";

/**
 * じゅんろの 鍵（先生向け・管理者だけ — 設計07 §10.1）
 *
 * 順路の 鍵（関門）は **学習者のため**の しくみだが、教材の 不具合で 関門が
 * 開かなく なると 授業が その場で 止まる（願い #333・#246）。原因を 直すまでの
 * あいだ、先生が スイッチ1つで 全員ぶんの 鍵を 外せるようにする。
 *
 * 認可は ここでは 決めない。画面は 入口を 隠すだけで、実際の 関所は RLS に ある
 *（`app_settings` の update は `public.is_admin()` だけ）。
 */

/** 覚え書きの 賞味期限を 分で 言い直す（画面に 出す ため）。 */
const REFLECT_MINUTES = Math.round(UNLOCK_FLAG_FRESH_MS / 60000);

function formatMoment(iso: string | null): string {
  if (!iso) return "まだ 一度も 動かして いません";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export default function Page() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** 保存の 結果。押したのに 何も 変わらない、を 作らない（絶対規律1）。 */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
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
        const current = await fetchAppSettings();
        if (!active) return;
        setSettings(current);
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
    };
  }, [router]);

  const toggle = useCallback(async (next: boolean) => {
    setSaving(true);
    setNotice(null);
    try {
      const saved = await setGatesUnlocked(next);
      setSettings(saved);
      setNotice(
        next
          ? `鍵を 外しました。学習者の 画面には おそくとも ${REFLECT_MINUTES}分で 反映されます。`
          : `鍵を かけ直しました。学習者の 画面には おそくとも ${REFLECT_MINUTES}分で 反映されます。`,
      );
    } catch (error) {
      setNotice(`保存できませんでした: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) return <AdminLoading />;
  if (errorMessage) return <AdminError message={errorMessage} />;

  const unlocked = settings?.gatesUnlocked === true;

  return (
    <AdminPageFrame>
      <AdminHeader
        title="じゅんろの 鍵"
        note="関門（まえの 教材を おえないと つぎへ 進めない しくみ）を、全員ぶん まとめて 外します。"
      />

      <section className="card-pop px-5 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className={`grid h-12 w-12 place-items-center rounded-full text-2xl ${
              unlocked ? "bg-[#ffe9a8]" : "bg-panel-tint"
            }`}
          >
            {unlocked ? "🔓" : "🔒"}
          </span>
          <div className="min-w-0">
            <p className="text-navy text-lg font-black">
              {unlocked ? "いま 鍵は 外れています" : "いま 鍵は かかっています"}
            </p>
            <p className="text-ink-soft text-sm font-bold">
              {unlocked
                ? "学習者は どの 教材も 順番に かかわらず ひらけます。"
                : "学習者は まえの 教材を おえないと つぎへ 進めません（ふだんの 状態）。"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving || unlocked}
            onClick={() => void toggle(true)}
            className="btn-game px-5 py-2.5 text-sm disabled:opacity-40"
          >
            鍵を 外す（全員）
          </button>
          <button
            type="button"
            disabled={saving || !unlocked}
            onClick={() => void toggle(false)}
            className="border-hairline text-navy rounded-2xl border-2 bg-white px-5 py-2.5 text-sm font-bold disabled:opacity-40"
          >
            鍵を かけ直す
          </button>
        </div>

        {notice ? (
          <p
            role="status"
            className="text-navy bg-panel-tint mt-4 rounded-xl px-3 py-2 text-sm font-bold"
          >
            {notice}
          </p>
        ) : null}

        <dl className="text-ink-soft mt-5 grid gap-1 text-xs font-bold">
          <div className="flex gap-2">
            <dt>さいごに 動かした とき:</dt>
            <dd className="text-ink">{formatMoment(settings?.updatedAt ?? null)}</dd>
          </div>
        </dl>
      </section>

      <section className="card-pop mt-4 px-5 py-5">
        <h2 className="text-navy text-base font-black">つかう まえに</h2>
        <ul className="text-ink mt-3 space-y-2 text-sm font-bold">
          <li>
            <strong className="text-navy">本番と STG の 両方に 同時に 効きます。</strong> DB は
            全環境で 1つを 共有しているので、STG で 外すと 本番でも 外れます。
          </li>
          <li>
            反映は すぐでは ありません。学習者の 端末は せっていを {REFLECT_MINUTES}分
            ためるので、その あいだは 前の 状態のままです。
          </li>
          <li>
            進み具合（どこまで おえたか）は 変わりません。外すのは
            <strong className="text-navy">「ひらけるか」だけ</strong>で、 クリア済みの 印が 勝手に
            付くことは ありません。
          </li>
          <li>
            これは 教材の 不具合で 授業が 止まった ときの 取り急ぎの レバーです。 使ったら、原因の
            ほうも 台帳に 残してください。
          </li>
        </ul>
      </section>
    </AdminPageFrame>
  );
}
