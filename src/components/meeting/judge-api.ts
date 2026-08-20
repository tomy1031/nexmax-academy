"use client";

import { createLiveToken } from "@/lib/ai/live-token";
import { DEFAULT_LIVE_TALK_MODEL, LIVE_TALK_MODELS } from "@/lib/ai/models";
import { getGeminiKey, getLiveModel } from "@/lib/profile";
import {
  buildJudgePrompt,
  isKanaOnly,
  parseJudge,
  type JudgeContext,
  type JudgeResult,
} from "@/lib/meeting/judge";

/**
 * 判定APIの呼び出し（ブラウザ側）。
 *
 * キーは本人のもの（BYOK）で端末に保存されている。**サーバには渡さない**——
 * この端末から Google へ直接聞く（2026-08-17）。うちの Worker は香港で動くことが
 * あり、そこを通すと Google に断られるうえ、キーが香港で復号されるため。
 *
 * ## `generateContent` は つかわない（2026-08-20・絶対）
 * 以前は `gemini-2.5-flash` の `generateContent` に 聞いて いた。**これは Live とは
 * 別勘定の 無料枠**で、学習者 1人の 1回の ミーティングで 使い切る
 *（「すぐ limit に なる」——同日 クライアント指定）。
 * いまは **Live の つなぎの 中**で 文字だけを 返して もらう。Live の 枠は
 * 会話で どのみち 使うので、判定の ぶんで 別の 枠を 減らさない。
 *
 * ## 会話の つなぎとは **別の つなぎ**にする
 * 声の セッションに 道具（function calling）を 持たせて 判定させて いたが、
 * その 道具の 呼び出しが **相手の 文字起こしに 混ざって** チャット欄に
 * `call:nihongo_no_mikata{…}` として 出た（2026-08-20 の 実発生。
 * fable の 調べで、tool call は `toolCall` という 別の 場所に 来るはずで、
 * 文字に 出た＝モデルが 本文へ 漏らした、と 分かった）。
 * だから **声の つなぎは 会話だけ**・**判定は 使い捨ての 文字の つなぎ**に 分ける。
 *
 * 失敗は**理由の名前**で返す。「だめでした」しか出ないと、キーを入れた学習者は
 * 自分のキーを疑い続けることになる（2026-08-06 に実際に起きた）。
 */

export interface JudgeRequest {
  ask: string;
  hint: string;
  keywords: readonly string[];
  judgePrompt: string;
  hostName: string;
  learnerName: string;
  utterance: string;
  attempt: number;
}

export type JudgeApiResult =
  { ok: true; judge: JudgeResult; model: string } | { ok: false; reason: string };

/** 1つの 頼みの 返事を 待つ 上限。 */
const REPLY_TIMEOUT_MS = 10_000;

/**
 * **判定ぜんぶの 上限**（つなぐ ところも 含む）。
 *
 * つなぐ ところに 上限が 無かった ため、相手が 応じない ときに
 * **画面が「聞いて います…」の まま 止まった**（CI・2026-08-20）。
 * 触れる ものを ばんで 絞って いる ぶん、1か所 止まると 全部 止まる。
 * 見かたは 出なくても よいので、**必ず ここで 打ち切って** 先へ 進める。
 */
const OVERALL_TIMEOUT_MS = 20_000;

/** つなぐ ところの 上限（過ぎたら つぎの モデル名を ためす）。 */
const CONNECT_TIMEOUT_MS = 8_000;

/** 約束に 期限を つける（過ぎたら 投げる）。 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new JudgeError("timeout")), ms)),
  ]);
}

/**
 * Live に 「JSON だけ」を 返させる ための 前置き。
 *
 * 構造化出力（responseSchema）は **Live の 設定に 無い**（`LiveConnectConfig` を
 * 見ても `responseSchema` は 存在しない）。だから 形は ことばで 頼み、
 * 受け取った あと `parseJudge`（zod）で 必ず 検査する。
 */
const JSON_ONLY =
  "あなたは JSON だけを 返します。前後に 説明・あいさつ・```などの 印は 書きません。" +
  "返すのは { } で かこんだ オブジェクト 1つだけです。";

export async function requestJudge(request: JudgeRequest): Promise<JudgeApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };
  // どこで 詰まっても 必ず 返る（止まらない ことを 品質より 上に 置く）
  return await Promise.race([
    judgeFromBrowser(apiKey, request),
    new Promise<JudgeApiResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), OVERALL_TIMEOUT_MS),
    ),
  ]);
}

/**
 * この端末から Google に直接聞く（文字だけの Live セッション・使い捨て）。
 *
 * ## かなだけで返ってくるまで、1回だけ言い直させる
 * 動的に作った文にはふりがなを合成できない（読み辞書は教材データが持つ）。
 * 漢字が1つ混ざると、そこで学習者が止まる。「漢字を使うな」は ときどき破られるので、
 * **検査 → 1回だけ言い直し → それでも駄目なら ok:false**。
 * 画面はそのとき規則ベース（japanese-check.ts）へ落ちる。会話は止めない。
 * 言い直しは **同じ つなぎの 中で** 頼む（つなぎ直すと また 数秒 待たせる）。
 */
async function judgeFromBrowser(apiKey: string, request: JudgeRequest): Promise<JudgeApiResult> {
  const context: JudgeContext = { ...request, attempt: Math.min(Math.max(request.attempt, 1), 9) };

  /*
   * 短命トークンは **1回 使い切り・新しい つなぎは 2分 以内**（live-token.ts）なので、
   * 会話の ときに 作った ものは 使い回せない。判定の たびに 作り直す——
   * これは モデルを 呼ぶ 数には 入らない（auth_tokens は 別の 入口）。
   */
  const minted = await createLiveToken({ apiKey });
  const failReason = minted.ok ? "upstream" : minted.reason;
  const canUseKeyDirectly = failReason === "tokenRejected" || failReason === "invalidRequest";
  const auth = minted.ok ? minted.token : canUseKeyDirectly ? apiKey : null;
  if (!auth) return { ok: false, reason: failReason };

  /*
   * 設定してある モデル → 既定の 順に ためす。preview の モデルは **名前ごと
   * 入れ替わる**うえ、文字だけの 返しに 応じない ものも ありうる。1つで 諦めると
   * 学習者には「AIの みかたは いま つかえません」しか 見えない（2026-08-06 の 教訓）。
   */
  const models = [getLiveModel(), ...LIVE_TALK_MODELS].filter(
    (name, index, all): name is string => Boolean(name) && all.indexOf(name) === index,
  );
  const wanted = models.length > 0 ? models : [DEFAULT_LIVE_TALK_MODEL];

  let session: LiveTextSession | null = null;
  let model = wanted[0] ?? DEFAULT_LIVE_TALK_MODEL;
  try {
    for (const name of wanted) {
      try {
        session = await openTextSession(auth, auth === apiKey, name);
        model = name;
        break;
      } catch {
        // つぎの 名前を ためす（ぜんぶ 駄目なら 下の判定で 落ちる）
      }
    }
    if (!session) return { ok: false, reason: "modelNotFound" };
    let judge = parseJudge(
      readObject(await session.ask(buildJudgePrompt(context))),
      context.attempt,
    );
    // 漢字が混ざっていたら、混ざっていたことを伝えてもう一度だけ頼む
    if (judge && !isKanaOnly(judge)) {
      judge = parseJudge(
        readObject(await session.ask(buildJudgePrompt(context, true))),
        context.attempt,
      );
    }
    if (!judge) return { ok: false, reason: "badShape" };
    if (!isKanaOnly(judge)) return { ok: false, reason: "kanaRetryFailed" };
    return { ok: true, judge, model };
  } catch (error) {
    return { ok: false, reason: error instanceof JudgeError ? error.reason : "network" };
  } finally {
    session?.close();
  }
}

/** 判定の 失敗を **理由の名前**で 運ぶ（画面の 言い方は `judgeFailNote` が 決める）。 */
class JudgeError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface LiveTextSession {
  /** 1つ 頼んで、返事の 文字を まとめて 受け取る。 */
  ask: (prompt: string) => Promise<string>;
  close: () => void;
}

/**
 * 文字だけの Live セッションを 開く。
 *
 * 声の セッション（`use-live-voice.ts`）とは **別の つなぎ**。
 * 音は 出さず、道具も 持たせない——どちらも 混ざりの 元だった。
 */
async function openTextSession(
  auth: string,
  usingRawKey: boolean,
  model: string,
): Promise<LiveTextSession> {
  const { GoogleGenAI, Modality } = await import("@google/genai");
  /*
   * **短命トークンは v1alpha でしか 通らない**（SDK の 警告どおり）。
   * 本人の キーで 直接 つなぐ ときは v1beta。
   */
  const ai = new GoogleGenAI({ apiKey: auth, apiVersion: usingRawKey ? "v1beta" : "v1alpha" });

  let buffer = "";
  let settle: ((text: string) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;

  /*
   * つなぐ ところにも 上限を 置く。ここが 返って こないと、つぎの モデルを
   * ためす ところまで 行けない（全体の 上限だけだと 1つ目で 使い切る）。
   */
  const session = await withTimeout(
    ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.TEXT],
        systemInstruction: JSON_ONLY,
        // 学習者の言ったことに寄せたいので、思いつきは抑える
        temperature: 0.4,
      },
      callbacks: {
        onmessage: (message: unknown) => {
          buffer += readText(message);
          if (isTurnComplete(message)) {
            const text = buffer;
            buffer = "";
            settle?.(text);
            settle = null;
            fail = null;
          }
        },
        onerror: () => {
          fail?.(new JudgeError("upstream"));
          settle = null;
          fail = null;
        },
        onclose: () => {
          fail?.(new JudgeError("network"));
          settle = null;
          fail = null;
        },
      },
    }),
    CONNECT_TIMEOUT_MS,
  );

  return {
    ask: (prompt: string) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          settle = null;
          fail = null;
          reject(new JudgeError("timeout"));
        }, REPLY_TIMEOUT_MS);
        settle = (text) => {
          clearTimeout(timer);
          resolve(text);
        };
        fail = (error) => {
          clearTimeout(timer);
          reject(error);
        };
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: prompt }] }],
          turnComplete: true,
        });
      }),
    close: () => session.close(),
  };
}

/** 返事の 文字を 取り出す（形が 変わっても 落ちない ように 必要な ところだけ 見る）。 */
function readText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { serverContent?: Record<string, unknown> }).serverContent;
  const parts = (content?.modelTurn as { parts?: { text?: string }[] } | undefined)?.parts;
  if (!parts) return "";
  return parts.map((part) => part.text ?? "").join("");
}

/** 相手が 言い終わったか。 */
function isTurnComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const content = (message as { serverContent?: { turnComplete?: unknown } }).serverContent;
  return content?.turnComplete === true;
}

/**
 * 返って きた 文字から オブジェクトを 取り出す。
 *
 * 「JSON だけ」と 頼んでも ```json で かこんで 返す ことが ある。
 * 構造化出力が 使えない ぶん、ここで 受け止める（失敗は null → 呼ぶ側が 落とす）。
 */
function readObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 失敗の 理由 → 学習者に見せる一言（責めない・次の行動を書く）。 */
export function judgeFailNote(reason: string): string {
  switch (reason) {
    case "noKey":
      return "AIの せっていが まだです。じぶんで こたえを かいて すすめられます。";
    // 上流が 名前を 付けてきたら rateLimited、番号だけなら quota。どちらも 使いすぎ
    case "quota":
    case "rateLimited":
      return "きょうは AIを つかいすぎました。あしたに なると また つかえます。";
    // 503 = Google 側の 混雑。1回 やり直しても だめだった ときだけ ここに 来る
    case "overloaded":
      return "AIが いま こんで います。すこし まってから もう いちど おねがいします。";
    case "timeout":
      return "AIの へんじが おそいので、さきに すすみます。";
    case "network":
      return "つうしんが うまく いきませんでした。もう いちど おねがいします。";
    default:
      return "AIの みかたは いま つかえません。かいた こたえは そのまま すすめられます。";
  }
}
