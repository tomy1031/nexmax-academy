"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import {
  CHECK_LABELS,
  SITE_CHECK_URL,
  formatIct,
  kindLabel,
  messageLabel,
  overallLabel,
  probeResultLabel,
  type ClientErrorRow,
  type SiteCheckStatus,
} from "@/lib/error-log";
import { fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

/**
 * エラーログ（管理者だけ・2026-10-11）
 *
 * 本番の異常を、学習者や先生からの連絡より先に知るためのページ。
 * 「通知はあまり大切じゃないので、管理画面で確認できればいい」（tomy さん・2026-10-11）。
 * 表示の決まりは src/lib/error-log.ts。
 *
 * 認可はここでは決めない。画面は入口を隠すだけで、実際の制限は RLS
 * （events の client_error は public.is_admin() だけが読める）。
 */

/** 一度に出す件数。記録は14日で消える。 */
const LIMIT = 100;

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly ClientErrorRow[]>([]);
  const [status, setStatus] = useState<SiteCheckStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      if (!supabase) {
        router.replace("/welcome");
        return;
      }
      try {
        const own = await fetchOwnProfile();
        if (!active) return;
        if (!own) {
          router.replace("/welcome");
          return;
        }
        if (!own.is_admin) {
          router.replace("/map");
          return;
        }
        const [logs, check] = await Promise.all([
          supabase
            .from("events")
            .select("at, object, result")
            .eq("verb", "client_error")
            .order("at", { ascending: false })
            .limit(LIMIT),
          fetch(SITE_CHECK_URL, { cache: "no-store" })
            .then(async (res) =>
              res.ok
                ? { status: (await res.json()) as SiteCheckStatus, error: null }
                : { status: null, error: `HTTP ${res.status}` },
            )
            .catch((error: unknown) => ({
              status: null,
              error: error instanceof Error ? error.message : String(error),
            })),
        ]);
        if (!active) return;
        if (logs.error) throw new Error(logs.error.message);
        setRows((logs.data ?? []) as ClientErrorRow[]);
        setStatus(check.status);
        setStatusError(check.error);
        setNow(Date.now());
        setLoading(false);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  if (loading) return <AdminLoading />;
  if (errorMessage) return <AdminError message={errorMessage} />;

  const overall = overallLabel(status, now);
  const probes = status?.last?.probes ?? [];
  const open = Object.entries(status?.open ?? {});

  return (
    <AdminPageFrame>
      <AdminHeader
        title="エラーログ"
        note="本番サイトの自動チェックの結果と、学習者のブラウザで起きたエラーです。時刻はカンボジア時間。"
      />

      <section className="card-pop px-5 py-5">
        <h2 className="text-navy text-base font-black">サイトの自動チェック（10分ごと）</h2>
        {statusError ? (
          <p className="text-ink mt-3 text-sm font-bold">
            自動チェックの結果を読めませんでした（{statusError}）。
          </p>
        ) : (
          <>
            <p
              className={`mt-3 text-lg font-black ${overall.tone === "ok" ? "text-navy" : "text-[#b42318]"}`}
            >
              {overall.tone === "ok" ? "✅ " : "⚠️ "}
              {overall.text}
            </p>
            <p className="text-ink-soft text-xs font-bold">
              最後にチェックした時刻: {formatIct(status?.lastRunAt)}
            </p>

            {probes.length > 0 ? (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-ink-soft text-xs">
                  <tr>
                    <th className="py-1 pr-3 font-bold">場所</th>
                    <th className="py-1 font-bold">結果</th>
                  </tr>
                </thead>
                <tbody className="text-ink font-bold">
                  {probes.map((probe) => (
                    <tr key={probe.id} className="border-hairline border-t">
                      <td className="py-2 pr-3">{CHECK_LABELS[probe.id] ?? probe.id}</td>
                      <td className="py-2">{probeResultLabel(probe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {open.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-navy text-sm font-black">続いている異常</h3>
                <ul className="text-ink mt-2 space-y-1 text-sm font-bold">
                  {open.map(([key, item]) => (
                    <li key={key}>
                      {formatIct(item.since)} から: {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {status?.muted ? (
              <p className="text-ink-soft mt-4 text-xs font-bold">
                修正待ちの既知の誤報として、次の警告は異常に数えていません: {status.muted}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="card-pop mt-4 px-5 py-5">
        <h2 className="text-navy text-base font-black">ブラウザで起きたエラー（新しい順）</h2>
        <p className="text-ink-soft text-xs font-bold">
          画面が表示できなくなったときの記録です。だれのエラーかは残していません。14日で消えます。
          同じエラーは1台につき30分に1回だけ記録します。
        </p>
        {rows.length === 0 ? (
          <p className="text-ink mt-4 text-sm font-bold">まだ記録はありません。</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-ink-soft text-xs">
                <tr>
                  <th className="py-1 pr-3 font-bold">時刻</th>
                  <th className="py-1 pr-3 font-bold">ページ</th>
                  <th className="py-1 pr-3 font-bold">種類</th>
                  <th className="py-1 pr-3 font-bold">メッセージ</th>
                  <th className="py-1 pr-3 font-bold">ログイン</th>
                  <th className="py-1 font-bold">版</th>
                </tr>
              </thead>
              <tbody className="text-ink font-bold">
                {rows.map((row, at) => (
                  <tr key={`${row.at}-${at}`} className="border-hairline border-t align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatIct(row.at)}</td>
                    <td className="py-2 pr-3 break-all">{row.object ?? "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{kindLabel(row.result?.kind)}</td>
                    <td className="py-2 pr-3 break-all">{messageLabel(row)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.result?.logged_in ? "ログイン中" : "ログイン前"}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {row.result?.build?.slice(0, 7) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPageFrame>
  );
}
