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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AdminError, AdminHeader, AdminLoading, AdminPageFrame } from "@/components/admin/admin-ui";
import { GeminiKeyPanel } from "@/components/admin/gemini-key-panel";
import { CodexTransport, type CodexStatus } from "@/lib/codex-transport";
import {
  DEFAULT_CODEX_URL,
  codexSocketUrl,
  getCodexToken,
  getCodexUrl,
  saveCodexSettings,
  subscribeToCodexSettings,
} from "@/lib/codex-settings";
import {
  anonymizeCohort,
  buildClassPrompt,
  buildStudentPrompt,
  type AnonymousStudent,
} from "@/lib/codex-prompt";
import { fetchAllProfiles, fetchOwnProfile } from "@/lib/profile-db";
import { createClient } from "@/lib/supabase/client";

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
  /*
   * 保存ずみの値は外部ストア（localStorage）として読む。effect で setState すると
   * 描画が連鎖するうえ、このプロジェクトの React 規則で弾かれる（GeminiKeyPanel と同じ形）。
   * 編集中の値は「まだ触っていない = null」で持ち、触られるまでは保存ずみを映す。
   */
  const storedUrl = useSyncExternalStore(
    subscribeToCodexSettings,
    getCodexUrl,
    () => DEFAULT_CODEX_URL,
  );
  const storedToken = useSyncExternalStore(subscribeToCodexSettings, getCodexToken, () => "");
  const [draftUrl, setUrl] = useState<string | null>(null);
  const [draftToken, setToken] = useState<string | null>(null);
  const url = draftUrl ?? storedUrl;
  const token = draftToken ?? storedToken;
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
    const settings = { url: url.trim(), token: token.trim() };
    saveCodexSettings(settings);
    if (!settings.token) {
      setConnectError("合言葉が 空です。ブリッジの画面に出ている文字を 貼ってください。");
      return;
    }
    try {
      await transportRef.current?.connect(codexSocketUrl(settings));
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : String(error));
    }
  }, [url, token]);

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
      <AdminHeader title="AI設定" note="APIキーと、Codex への つなぎ" />

      {/*
        キーの設定は はじめの設定ウィザードにしか無く、入れ直す場所も
        「効いているか」を確かめる場所も無かった。ここに置く。
      */}
      <div className="mx-auto mb-4 max-w-4xl">
        <GeminiKeyPanel />
      </div>

      <section className="card-pop mx-auto max-w-4xl p-5 sm:p-8">
        <h1 className="text-navy text-2xl font-black">AI指示出し（実験）</h1>
        <p className="text-ink-soft mt-2 text-sm font-bold">
          自分のPCで動く Codex に、匿名化した診断データを渡してメモを作らせます。
          名前・メール・性別は送りません。<strong>生成結果は保存されません。</strong>
          読んでから使うかどうかを決めてください。目の前の生徒と合わないときは、生徒のほうを優先してください。
        </p>

        {/*
          つなぎ方の案内。ここが無かったので「未設定なのか壊れているのか」が
          先生に区別できなかった。ブリッジは**先生のPCで動かす常駐プロセス**で、
          公開中のアプリからは（いまはまだ）届かない。
        */}
        <div className="bg-panel-tint mt-5 rounded-2xl p-4">
          <p className="text-navy text-sm font-black">
            つなぎ方（公開中のURLからでも つながります）
          </p>
          <ol className="text-ink mt-2 list-decimal space-y-1 pl-5 text-sm font-bold">
            <li>
              手元に Codex を入れる（<code>npm i -g @openai/codex</code> → <code>codex login</code>
              ）
            </li>
            <li>
              このリポジトリで <code>npm run codex:bridge</code> を動かす （
              <code>codex app-server</code> も一緒に立ち上がります）
            </li>
            <li>
              その画面に出る<strong>合言葉</strong>を、下の「合言葉」に貼って「接続」
            </li>
          </ol>
          <p className="text-ink-soft mt-2 text-xs font-bold">
            ブリッジは <strong>この画面を開いている PC の中</strong> で動いている必要があります。
            公開中のURL（https）からでも <code>ws://127.0.0.1</code> は開けるので、 Cloudflare
            Tunnel も ドメインも 要りません。
          </p>
          {/*
            合言葉を必須にした理由を、画面にも書いておく。
            「なぜもう1つ貼るものが増えたのか」が分からないと、先生は
            ブリッジ側で CODEX_BRIDGE_TOKEN を空にして回避してしまう。
          */}
          <p className="mt-2 rounded-xl bg-white/70 p-2 text-xs font-bold text-[#c2410c]">
            ⚠ 合言葉は 省けません。<code>ws://127.0.0.1</code> は
            <strong>あなたが開いた どのサイトからも 開けてしまう</strong>ためです。 その先にいる
            Codex は パソコンの中で コマンドを 実行できます。 合言葉を 知っている相手だけが
            通れるように しています。人に見せないでください。
          </p>
          <p className="text-ink-faint mt-2 text-xs font-bold">
            合言葉を入れると、「エリアの絵」「とうじょう人物」「まんが」の絵づくりも Codex（ChatGPT
            の枠）を 先に使います。つながらないときは 自動で Gemini に 回ります。
          </p>
        </div>

        {/* 接続。ローカルは ws://127.0.0.1:8790/codex、Tunnel経由なら wss://…/codex */}
        <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft text-xs font-black">つなぎ先</span>
            <input
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              spellCheck={false}
              className="border-hairline rounded-xl border-2 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-ink-soft text-xs font-black">合言葉</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="ブリッジの画面に出る文字"
              className="border-hairline rounded-xl border-2 px-3 py-2 font-mono text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={status === "connecting" || status === "busy"}
            className="btn-game self-end px-5 py-2 text-sm disabled:opacity-50"
          >
            接続
          </button>
          <span
            className={`self-end rounded-full px-3 py-2 text-xs font-black text-white ${
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
