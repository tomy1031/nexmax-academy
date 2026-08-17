"use client";

import { useState, useSyncExternalStore } from "react";
import { listModelsFromBrowser } from "@/lib/ai/list-models";
import { DEFAULT_LIVE_TALK_MODEL, looksLiveCapable, preferredLiveModel } from "@/lib/ai/models";
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

/** 上流が付けた名前（記号だけ）。原因の切り分けに使う。 */
interface UpstreamHint {
  readonly upstreamStatus?: number;
  readonly upstreamCode?: string;
  readonly upstreamReason?: string;
}

type Check =
  | { state: "idle" }
  | { state: "running" }
  | ({ state: "failed"; reason: string } & UpstreamHint)
  | {
      state: "done";
      models: string[];
      liveModels: string[];
      live: ({ ok: boolean; reason: string | null } & UpstreamHint) | null;
      /** サーバからは出られず、このパソコンから直接たしかめたか。 */
      direct?: boolean;
    };

/** 画面のすみに出す手がかり（`reason: badKey / 400 API_KEY_INVALID`）。 */
function hintText(reason: string | null | undefined, hint: UpstreamHint): string {
  const codes = [hint.upstreamStatus, hint.upstreamCode, hint.upstreamReason]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ");
  return codes ? `reason: ${reason ?? "unknown"} / ${codes}` : `reason: ${reason ?? "unknown"}`;
}

const REASON_TEXT: Record<string, string> = {
  noKey: "キーが 入っていません。",
  /*
   * 2026-08-17: ここは「コピーし直して（前後の 空白も 消す）」と言っていたが、
   * 空白はサーバが受け取った時点で落としている（gemini-check の route）。
   * つまり空白は原因になりえず、正しいキーを持つ先生に無駄な手直しをさせていた。
   * いまは Google が API_KEY_INVALID と名指ししたときだけ この文が出る。
   */
  badKey:
    "Google が この キーを 受け取りませんでした。AIza で はじまる 古い キーは、" +
    "制限を かけていないと もう つかえません。AI Studio の キー一覧で「Unrestricted」の 印を さがして、" +
    "Add restrictions →「Restrict to Gemini API only」を えらんで ください（2〜3分で 効きます）。",
  wrongKeyType:
    "この 文字列は APIキーとして 受け取ってもらえませんでした（AQ. で はじまる 新しい 形式）。" +
    "Google は これを ログインの きっぷ だと 見なします。" +
    "AI Studio の キー一覧で、いま つかえる キーを えらび直して ください。",
  keyExpired: "この キーは 期限切れです。AI Studio で 作り直して ください。",
  keyRestricted:
    "この キーには 制限が かかっています（つかえる サイト・IP・API の しばり）。" +
    "Google Cloud の キーの 設定を たしかめてください。",
  apiDisabled:
    "この キーの プロジェクトで Gemini API が まだ ON に なっていません。Google Cloud で 有効に してください。",
  locationNotSupported:
    "キーでは なく「呼んだ 場所」が はじかれました（Google が まだ 対応していない 国から の 呼び出し）。" +
    "この 確認は サーバから 投げるので、先生の パソコンの 国とは 別です。",
  invalidRequest:
    "Google が 400 を 返しましたが、キーが 悪いとは 言っていません。" +
    "下の コードを 見て ください（作りたての キーなら 2〜3分 待つと 通る ことが あります）。",
  network: "Google に つながりませんでした。ネットワークを たしかめてください。",
  badResponse: "Google の 返事が 読めませんでした。少し 待って ためしてください。",
  invalidJson: "送った 中身が 読めませんでした。画面を 読み込み直して ください。",
  tokenRejected:
    "キーは 読めましたが、みじかい きっぷ（トークン）が つくれませんでした。" +
    "AQ. で はじまる 新しい キーだと ここで 止まることが あります。" +
    "AIzaSy で はじまる キーを つくり直して ためしてください。",
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
        live?: ({ ok: boolean; reason: string | null } & UpstreamHint) | null;
      } & UpstreamHint;
      if (!response.ok || !body.ok) {
        /*
         * サーバの居場所が Google の対象外（2026-08-17 実測）。うちの Worker は
         * Cloudflare の香港（HKG）で動いていて、Google は香港からの呼び出しを
         * 受け付けない。**先生のパソコンは日本・カンボジアで、どちらも対象内**なので、
         * ここから直接ためせば答えが出る。キーはこの端末にあるものをそのまま使う。
         */
        if (body.reason === "locationNotSupported") {
          const direct = await listModelsFromBrowser(key.trim());
          if (direct.ok) {
            const liveModels = direct.models.filter(looksLiveCapable);
            setCheck({
              state: "done",
              models: direct.models,
              liveModels,
              live: null,
              direct: true,
            });
            const preferred = preferredLiveModel(liveModels);
            if (liveModels.length > 0 && !liveModels.includes(model)) {
              setModel(preferred);
              saveLiveModel(preferred);
            }
            return;
          }
        }
        setCheck({
          state: "failed",
          reason: body.reason ?? "upstream",
          upstreamStatus: body.upstreamStatus,
          upstreamCode: body.upstreamCode,
          upstreamReason: body.upstreamReason,
        });
        return;
      }
      const liveModels = body.liveModels ?? [];
      setCheck({
        state: "done",
        models: body.models ?? [],
        liveModels,
        live: body.live ?? null,
      });
      /*
       * いま選んでいるモデルが一覧に無ければ、使えるものへ寄せる。
       * 寄せ先は**こちらの並び順**で決める（preferredLiveModel）。相手の一覧の
       * 先頭を採っていたころ、新しい 3.1 が使えるのに古い 2.5 が既定になっていた。
       */
      const preferred = preferredLiveModel(liveModels);
      if (liveModels.length > 0 && model !== preferred && !liveModels.includes(model)) {
        setModel(preferred);
        saveLiveModel(preferred);
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

      {/*
        新しい形式のキー（AQ. で始まる）は、モデル一覧は引けるのに
        みじかい きっぷ（auth_tokens）だけ作れないことがある。押す前に言う——
        押してから理由を読むのでは、先生は一度は「自分のキーが悪い」と思ってしまう。
        参考: discuss.ai.google.dev の authTokens.create INVALID_ARGUMENT スレッド
      */}
      {key.startsWith("AQ.") ? (
        <p
          className="mt-4 rounded-2xl border-2 bg-white p-3 text-xs font-bold"
          style={{ borderColor: "var(--color-sun)" }}
        >
          この キーは <code>AQ.</code> で はじまっています。この 形式だと たいわ・音声づくりが
          つかえないことが あります。うまくいかない ときは、Google AI Studio で<code>AIzaSy</code>{" "}
          で はじまる キーを つくって ためしてください。
        </p>
      ) : null}

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
          <span className="text-ink-faint ml-2 text-xs font-bold">
            {hintText(check.reason, check)}
          </span>
        </p>
      ) : null}

      {check.state === "done" ? (
        <div className="mt-4 space-y-2">
          <p className="text-leaf-deep text-sm font-black">
            ✓ キーは つかえます（モデルが {check.models.length}こ 見えました）。
          </p>
          {check.direct ? (
            <p className="text-ink-soft text-xs font-bold">
              ※ この アプリの サーバ（香港）からは Google に 出られないので、この パソコンから 直接
              たしかめました。たいわ・音声づくりも この パソコンから 直接 つなぎます。
            </p>
          ) : null}
          {/*
            「たいわに つかえる モデルが 無い」と「ここでは ためせなかった」を 混ぜない。
            サーバから 出られないときは トークンを 作る 段が そもそも 走らないので、
            モデルが 5つ 見えているのに「モデルが ありません」と 出ていた（2026-08-17 実発生）。
          */}
          {check.liveModels.length > 0 && check.live === null && check.direct ? (
            <p className="text-navy text-sm font-black">
              ✓ たいわに つかえる モデルは あります（下の 一覧）。つなぎ具合は 教材の 画面で
              たしかめます。
            </p>
          ) : check.live ? (
            check.live.ok ? (
              <p className="text-leaf-deep text-sm font-black">
                ✓ 「{model}」で たいわ・音声づくりが つかえます。
              </p>
            ) : (
              <p className="text-coral-deep text-sm font-black">
                ✖ 「{model}」では つながりませんでした。{reasonText(check.live.reason)}
                <span className="text-ink-faint ml-2 text-xs font-bold">
                  {hintText(check.live.reason, check.live)}
                </span>
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
