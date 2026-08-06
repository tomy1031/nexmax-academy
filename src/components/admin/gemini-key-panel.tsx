"use client";

import { useState, useSyncExternalStore } from "react";
import { DEFAULT_LIVE_TALK_MODEL } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel, saveGeminiKey, saveLiveModel } from "@/lib/profile";

/**
 * Gemini の APIキーと、たいわ・音声づくりに使うモデルの設定
 *
 * これまでキーを直せる場所は はじめの設定ウィザード（/welcome）だけだった。
 * ウィザードは1回きりなので、キーを入れ直したい先生には行き場が無く、
 * 「登録したのに動かない」を確かめる手も無かった。
 *
 * ここでは3つを別々に見せる:
 *  1. キーは有効か（モデルの一覧が取れるか）
 *  2. どのモデルが使えるか（一覧から選ぶ）
 *  3. そのモデルで実際につなげるか（短命トークンが出るか）
 *
 * 2026-08-06 の不具合はここが分かれていれば1分で分かった——キーは正しく、
 * コードが指していた preview モデルのほうが消えていた。
 */

type Check =
  | { state: "idle" }
  | { state: "running" }
  | { state: "failed"; reason: string }
  | {
      state: "done";
      models: string[];
      liveModels: string[];
      live: { ok: boolean; reason: string | null } | null;
    };

const REASON_TEXT: Record<string, string> = {
  noKey: "キーが 入っていません。",
  badKey: "この キーは つかえません。コピーし直して ください（前後の 空白も 消す）。",
  noPermission:
    "この キーでは つかえません。キーの プロジェクトで Gemini API が 有効か たしかめてください。",
  modelNotFound: "この モデルは 見つかりませんでした。下の 一覧から えらび直してください。",
  rateLimited: "きょうは つかいすぎです。時間を おいて ためしてください。",
  forbidden: "この そうさは 先生（管理者）だけです。",
  upstream: "AIの サービスから 返事が ありませんでした。",
};

function reasonText(reason: string | null | undefined): string {
  return (reason && REASON_TEXT[reason]) ?? REASON_TEXT.upstream!;
}

/** localStorage の変化を購読する（別のタブで直したときも追いつく）。 */
function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function GeminiKeyPanel() {
  /*
   * 保存ずみの値は外部ストア（localStorage）として読む。effect で setState すると
   * 描画が連鎖するうえ、このプロジェクトの React 規則で弾かれる。
   * 編集中の値は「まだ触っていない = null」で持ち、触られるまでは保存ずみを映す。
   */
  const storedKey = useSyncExternalStore(subscribeToStorage, getGeminiKey, () => "");
  const storedModel = useSyncExternalStore(subscribeToStorage, getLiveModel, () => "");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const key = draftKey ?? storedKey;
  const model = draftModel ?? (storedModel || DEFAULT_LIVE_TALK_MODEL);
  const setKey = setDraftKey;
  const setModel = setDraftModel;

  const [saved, setSaved] = useState(false);
  const [check, setCheck] = useState<Check>({ state: "idle" });

  const save = () => {
    saveGeminiKey(key);
    saveLiveModel(model);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const test = async () => {
    setCheck({ state: "running" });
    // 押した時点の中身で試す。保存を忘れていても確かめられるようにする
    saveGeminiKey(key);
    try {
      const response = await fetch("/api/studio/gemini-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: key, model }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        models?: string[];
        liveModels?: string[];
        live?: { ok: boolean; reason: string | null } | null;
      };
      if (!response.ok || !body.ok) {
        setCheck({ state: "failed", reason: body.reason ?? "upstream" });
        return;
      }
      const liveModels = body.liveModels ?? [];
      setCheck({
        state: "done",
        models: body.models ?? [],
        liveModels,
        live: body.live ?? null,
      });
      // いま選んでいるモデルが一覧に無ければ、使えるものへ寄せる
      if (liveModels.length > 0 && !liveModels.includes(model)) {
        setModel(liveModels[0]!);
        saveLiveModel(liveModels[0]!);
      }
    } catch {
      setCheck({ state: "failed", reason: "upstream" });
    }
  };

  return (
    <section className="card-pop p-5 sm:p-7">
      <h2 className="text-navy text-xl font-black sm:text-2xl">Gemini APIキー</h2>
      <p className="text-ink-soft mt-1 text-sm font-medium">
        たいわ・リスニングの 音声づくり・ことばの 抜き出し・絵の 生成に つかいます。 キーは この
        ブラウザにだけ 残り、サーバには 保存されません。
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-navy text-sm font-black">APIキー</span>
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="AIza..."
            autoComplete="off"
            className="border-hairline text-ink mt-1 w-full rounded-xl border-2 bg-white px-3 py-2 font-bold"
          />
          <span className="text-ink-faint mt-1 block text-xs font-bold">
            Google AI Studio で つくれます。
          </span>
        </label>

        <label className="block">
          <span className="text-navy text-sm font-black">たいわ・音声に つかう モデル</span>
          {check.state === "done" && check.liveModels.length > 0 ? (
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="border-hairline text-ink mt-1 w-full rounded-xl border-2 bg-white px-3 py-2 font-bold"
            >
              {check.liveModels.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="border-hairline text-ink mt-1 w-full rounded-xl border-2 bg-white px-3 py-2 font-bold"
            />
          )}
          <span className="text-ink-faint mt-1 block text-xs font-bold">
            「せつぞくを ためす」を おすと、この キーで つかえる ものだけが 出ます。
          </span>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="btn-game px-6 py-2.5 text-sm [--btn-face:#004f8d] [--btn-shadow:#003c6b]"
        >
          ほぞん
        </button>
        <button
          type="button"
          onClick={() => void test()}
          disabled={check.state === "running" || key.trim().length === 0}
          className="btn-game px-6 py-2.5 text-sm [--btn-face:#58c273] [--btn-shadow:#3aa458] disabled:opacity-40"
        >
          {check.state === "running" ? "ためしています…" : "せつぞくを ためす"}
        </button>
        {saved ? <span className="text-leaf-deep text-sm font-black">ほぞんしました。</span> : null}
      </div>

      {check.state === "failed" ? (
        <p
          role="status"
          className="mt-4 rounded-2xl border-2 bg-white p-4 text-sm font-black"
          style={{ borderColor: "var(--color-coral)", color: "var(--color-ink)" }}
        >
          ✖ {reasonText(check.reason)}
          <span className="text-ink-faint ml-2 text-xs font-bold">reason: {check.reason}</span>
        </p>
      ) : null}

      {check.state === "done" ? (
        <div className="mt-4 space-y-2">
          <p className="text-leaf-deep text-sm font-black">
            ✓ キーは つかえます（モデルが {check.models.length}こ 見えました）。
          </p>
          {check.live ? (
            check.live.ok ? (
              <p className="text-leaf-deep text-sm font-black">
                ✓ 「{model}」で たいわ・音声づくりが つかえます。
              </p>
            ) : (
              <p className="text-coral-deep text-sm font-black">
                ✖ 「{model}」では つながりませんでした。{reasonText(check.live.reason)}
              </p>
            )
          ) : (
            <p className="text-coral-deep text-sm font-black">
              ✖ この キーには たいわに つかえる モデルが ありません。
            </p>
          )}
          {check.liveModels.length > 0 ? (
            <p className="text-ink-soft text-xs font-bold">
              つかえる モデル: {check.liveModels.join(" / ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
