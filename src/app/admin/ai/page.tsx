"use client";

/**
 * AI指示出し（実験・08 拡張経路）。
 *
 * ローカル（または Cloudflare Tunnel の向こう）の Codex App Server に接続し、
 * 匿名化した診断データ＋ガードレール同梱のプロンプトで教師向けのメモを生成する。
 *
 * - **生成結果は保存しない。** 画面を閉じたら消える。コピーは教師の判断
 * - アプリのサーバは経由しない（ブラウザ → codex_bridge → codex app-server）
 * - 送るのは仮名・タイプ名・スコア・回答・回答言語だけ（08 §2.1。名前・メール・性別は送らない）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { CodexTransport, type CodexStatus } from "@/lib/codex-transport";
import {
  anonymizeCohort,
  buildClassPrompt,
  buildStudentPrompt,
  type AnonymousStudent,
} from "@/lib/codex-prompt";
import { fetchAllProfiles, fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

const CODEX_URL_KEY = "nexmax.codexUrl";
const DEFAULT_CODEX_URL = "ws://127.0.0.1:8790/codex";

const STATUS_LABELS: Record<CodexStatus, string> = {
  disconnected: "未接続",
  connecting: "接続中…",
  connected: "接続ずみ",
  busy: "生成中…",
  error: "エラー",
};

export default function AdminAiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cohort, setCohort] = useState<AnonymousStudent[]>([]);

  const transportRef = useRef<CodexTransport | null>(null);
  const [status, setStatus] = useState<CodexStatus>("disconnected");
  const [url, setUrl] = useState(() =>
    typeof window === "undefined"
      ? DEFAULT_CODEX_URL
      : (window.localStorage.getItem(CODEX_URL_KEY) ?? DEFAULT_CODEX_URL),
  );
  const [connectError, setConnectError] = useState<string | null>(null);

  const [mode, setMode] = useState<"student" | "class">("class");
  const [selectedHandle, setSelectedHandle] = useState<string>("");
  const [extraInstruction, setExtraInstruction] = useState("");
  const [output, setOutput] = useState("");
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    transportRef.current = new CodexTransport(setStatus);
    return () => transportRef.current?.disconnect();
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
        if (!ownProfile) {
          router.replace("/welcome");
          return;
        }
        if (!ownProfile.is_admin) {
          router.replace("/map");
          return;
        }
        const profiles = await fetchAllProfiles();
        if (!active) return;
        setCohort(anonymizeCohort(profiles));
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

  const connect = useCallback(async () => {
    setConnectError(null);
    window.localStorage.setItem(CODEX_URL_KEY, url);
    try {
      await transportRef.current?.connect(url);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  }, [url]);

  const run = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport?.isReady()) return;
    setRunError(null);
    setOutput("");
    try {
      const prompt =
        mode === "class"
          ? buildClassPrompt(cohort, extraInstruction.trim())
          : buildStudentPrompt(
              cohort.find((student) => student.handle === selectedHandle) ?? cohort[0]!,
              extraInstruction.trim(),
            );
      const text = await transport.runText(prompt, setOutput);
      setOutput(text);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    }
  }, [mode, cohort, selectedHandle, extraInstruction]);

  if (loading) return <AdminLoading />;
  if (errorMessage) return <AdminError message={errorMessage} />;

  const ready = status === "connected" || status === "busy";
  const canRun =
    status === "connected" && (mode === "class" ? cohort.length >= 3 : cohort.length > 0);

  return (
    <AdminPageFrame>
      <AdminHeader title="AI指示出し" />
      <section className="card-pop mx-auto max-w-4xl p-5 sm:p-8">
        <h1 className="text-navy text-2xl font-black">AI指示出し（実験）</h1>
        <p className="text-ink-soft mt-2 text-sm font-bold">
          自分のPCで動く Codex に、匿名化した診断データを渡してメモを作らせます。
          名前・メール・性別は送りません。<strong>生成結果は保存されません。</strong>
          読んでから使うかどうかを決めてください。目の前の生徒と合わないときは、生徒のほうを優先してください。
        </p>

        {/* 接続。ローカルは ws://127.0.0.1:8790/codex、Tunnel経由は wss://…/codex */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck={false}
            className="border-hairline min-w-72 flex-1 rounded-xl border-2 px-3 py-2 font-mono text-sm"
            aria-label="Codex の接続先URL"
          />
          <button
            type="button"
            onClick={() => void connect()}
            disabled={status === "connecting" || status === "busy"}
            className="btn-game px-5 py-2 text-sm disabled:opacity-50"
          >
            接続
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black text-white ${
              ready ? "bg-leaf-deep" : status === "error" ? "bg-[#c2410c]" : "bg-navy"
            }`}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>
        {connectError && (
          <p className="mt-2 text-sm font-bold text-[#c2410c]">
            {connectError} — `npm run codex:bridge` が動いているか確認してください。
          </p>
        )}

        {/* 何を作らせるか */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 font-bold">
            <input
              type="radio"
              name="mode"
              checked={mode === "class"}
              onChange={() => setMode("class")}
            />
            クラス全体（回答{cohort.length}人）
          </label>
          <label className="flex items-center gap-1.5 font-bold">
            <input
              type="radio"
              name="mode"
              checked={mode === "student"}
              onChange={() => setMode("student")}
            />
            ひとり
          </label>
          {mode === "student" && (
            <select
              value={selectedHandle}
              onChange={(event) => setSelectedHandle(event.target.value)}
              className="border-hairline rounded-xl border-2 px-3 py-2 text-sm"
              aria-label="対象の生徒（仮名）"
            >
              {cohort.map((student) => (
                <option key={student.handle} value={student.handle}>
                  {student.handle}（{student.typeName}）
                </option>
              ))}
            </select>
          )}
        </div>
        {mode === "class" && cohort.length < 3 && (
          <p className="text-ink-soft mt-2 text-sm font-bold">
            回答が3人になると、クラス全体の分析ができます。
          </p>
        )}

        <textarea
          value={extraInstruction}
          onChange={(event) => setExtraInstruction(event.target.value)}
          rows={2}
          placeholder="追加の指示（なくてもよい）。例: ペアワークの組み方を中心に"
          className="border-hairline mt-3 w-full rounded-xl border-2 px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={() => void run()}
          disabled={!canRun}
          className="btn-game mt-4 px-8 py-3 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {status === "busy" ? "生成中…" : "メモを 作らせる"}
        </button>

        {runError && <p className="mt-3 text-sm font-bold text-[#c2410c]">{runError}</p>}
        {output && (
          <div className="border-hairline mt-5 rounded-2xl border-2 bg-white p-4">
            <p className="text-ink-soft mb-2 text-xs font-black">
              教師用メモ（保存されません・学習者には見せないでください）
            </p>
            <pre className="text-ink text-sm leading-relaxed font-medium break-words whitespace-pre-wrap">
              {output}
            </pre>
          </div>
        )}
      </section>
    </AdminPageFrame>
  );
}
