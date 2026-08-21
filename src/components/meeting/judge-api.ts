"use client";

import { createLiveToken } from "@/lib/ai/live-token";
import { LIVE_TEXT_MODELS } from "@/lib/ai/models";
import { getGeminiKey } from "@/lib/profile";
import {
  JUDGE_TOOL,
  buildJudgePrompt,
  isKanaOnly,
  parseJudge,
  type JudgeContext,
  type JudgeResult,
} from "@/lib/meeting/judge";

/**
 * 日本語の 見かた（判定）を もらう — **判定専用の Live セッション**
 *
 * キーは本人のもの（BYOK）で端末に保存されている。**サーバには渡さない**——
 * この端末から Google へ直接つなぐ（2026-08-17）。うちの Worker は香港で動くことが
 * あり、そこを通すと Google に断られるうえ、キーが香港で復号されるため。
 *
 * ## `generateContent` は つかわない（2026-08-20・絶対）
 * `gemini-2.5-flash` の `generateContent` は **Live とは 別勘定の 無料枠**で、
 * 学習者 1人の 1回の ミーティングで 使い切る（「すぐ limit に なる」——同日の 指定）。
 *
 * ## つくりは、先に 動いて いた 実装に そろえる（2026-08-20）
 * 同じ ことを 先に やって いた 実装（質問ゲーム）は こう 作って あった:
 *
 * - **判定専用の つなぎを 1本、張りっぱなしに する**。毎回 つなぎ直すと
 *   1回 数秒 かかり、そのぶん 学習者を 待たせる（先方は「~3秒」で 返して いた）
 * - **AUDIO で つなぎ、道具（function calling）で 構造の まま 受け取る**。
 *   Live は 文字だけの 返し（TEXT）に 対応せず、構造化出力も 持たない
 * - 指示の さいごに **「声では 返事を しない（道具を 呼ぶだけ）」**と 言い渡す
 *
 * ## 声の つなぎには 道具を 持たせない
 * 会話する 相手に 道具を 持たせた ときは、呼び出しが 声の 本文として 漏れ、
 * チャット欄に `call:nihongo_no_mikata{…}` が 出た（実発生）。
 * **話す 役と 見る 役を、つなぎごと 分ける**のが この 設計の 要。
 *
 * 失敗は**理由の名前**で返す。「だめでした」しか出ないと、キーを入れた学習者は
 * 自分のキーを疑い続けることになる（2026-08-06 に実際に起きた）。
 */

export interface JudgeRequest {
  /** どの 教材の どの しつもんか（つなぎを 張り直す 目印）。 */
  meetingId: string;
  questionId: string;
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
const REPLY_TIMEOUT_MS = 12_000;

/** つないで したくが 済むまでの 上限（過ぎたら つぎの モデル名を ためす）。 */
const CONNECT_TIMEOUT_MS = 9_000;

/** 判定ぜんぶの 上限。どこで 詰まっても 必ず 返す（画面を 止めない）。 */
const OVERALL_TIMEOUT_MS = 25_000;

/**
 * 判定係への 言い渡し。
 *
 * **その回の 中身は ここに 書かない**（それは `buildJudgePrompt` が 毎回 渡す）。
 * ここに 置くのは、つなぎの あいだ ずっと 変わらない 決まりだけ。
 */
const JUDGE_SYSTEM = [
  "あなたは 日本語の 先生です。日本で はたらきたい 学生（日本語N5〜N4・英語は読める）の",
  "れんしゅうを 見ます。",
  "学生の ことばが とどいたら、かならず 1回だけ 道具 nihongo_no_mikata を 呼びます。",
  "声では 返事を しません（道具を 呼ぶだけ）。",
  "学生が 読む 文（reply・praise・fix・exampleAnswer）は ひらがなと カタカナだけで",
  "書きます。漢字は 1文字も つかいません。ことばの あいだに 空白を 入れます。",
].join("\n");

export async function requestJudge(request: JudgeRequest): Promise<JudgeApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };
  // どこで 詰まっても 必ず 返る（止まらない ことを 見かたの 質より 上に 置く）
  return await Promise.race([
    askJudge(apiKey, request),
    new Promise<JudgeApiResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), OVERALL_TIMEOUT_MS),
    ),
  ]);
}

/**
 * ## かなだけで返ってくるまで、1回だけ言い直させる
 * 動的に作った文にはふりがなを合成できない（読み辞書は教材データが持つ）。
 * 漢字が1つ混ざると、そこで学習者が止まる。「漢字を使うな」は ときどき破られるので、
 * **検査 → 1回だけ言い直し → それでも駄目なら ok:false**。
 * 画面はそのとき規則ベース（japanese-check.ts）へ落ちる。会話は止めない。
 */
async function askJudge(apiKey: string, request: JudgeRequest): Promise<JudgeApiResult> {
  const context: JudgeContext = { ...request, attempt: Math.min(Math.max(request.attempt, 1), 9) };
  const opened = await openJudge(apiKey, `${request.meetingId}:${request.questionId}`);
  if (!opened.ok) return { ok: false, reason: opened.reason };
  const session = opened.session;

  try {
    let judge = parseJudge(await session.ask(buildJudgePrompt(context)), context.attempt);
    // 漢字が混ざっていたら、混ざっていたことを伝えてもう一度だけ頼む
    if (judge && !isKanaOnly(judge)) {
      judge = parseJudge(await session.ask(buildJudgePrompt(context, true)), context.attempt);
    }
    if (!judge) return { ok: false, reason: "badShape" };
    if (!isKanaOnly(judge)) {
      // 形が 崩れた つなぎを 引きずらない（つぎの しつもんは まっさらから）
      dropJudgeSession();
      return { ok: false, reason: "kanaRetryFailed" };
    }
    return { ok: true, judge, model: session.model };
  } catch (error) {
    // 切れて いる ことが ある。つぎの 呼び出しで 張り直せる ように 捨てる
    dropJudgeSession();
    return { ok: false, reason: error instanceof JudgeError ? error.reason : "network" };
  }
}

/** 判定の 失敗を **理由の名前**で 運ぶ（画面の 言い方は `judgeFailNote` が 決める）。 */
class JudgeError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

interface JudgeSession {
  readonly model: string;
  /** 1つ 頼んで、道具の 引数（見かた）を 受け取る。 */
  readonly ask: (prompt: string) => Promise<Record<string, unknown>>;
  readonly close: () => void;
  readonly alive: () => boolean;
}

/**
 * 張りっぱなしの 判定の つなぎ（この 画面で 1本）。
 *
 * 毎回 つなぎ直すと **1回 数秒**を 学習者が 待つ。先に 動いて いた 実装も、
 * 問題が 変わるまでは 同じ つなぎを 使い回して いた。
 */
let current: JudgeSession | null = null;
/**
 * いま 張って いる つなぎが **どの しつもんの もの**か。
 *
 * 画面を 離れるまで 1本を 使い回して いた ため、しつもんを またいで 履歴が 積もり、
 * 相手は **1問目の 返事文を そのまま くり返す**ように なって いた
 *（2026-08-21「返答だけが 最初の 会話に 戻る」）。
 * 先に 動いて いた 実装は `LJ.problemId === problem.id` で **問題が 変わったら
 * 必ず 張り直して**いた。同じ 形に する。
 */
let currentKey = "";
/** いま 張って いる 途中の もの（続けて 頼まれても つなぎは 1本に する）。 */
let opening: Promise<OpenResult> | null = null;

type OpenResult = { ok: true; session: JudgeSession } | { ok: false; reason: string };

/** つなぎを 捨てる（切れた とき・画面を 離れる とき）。 */
export function dropJudgeSession(): void {
  current?.close();
  current = null;
  currentKey = "";
  opening = null;
}

async function openJudge(apiKey: string, key: string): Promise<OpenResult> {
  const live = current;
  if (live?.alive() && currentKey === key) return { ok: true, session: live };
  // しつもんが 変わった（＝前の 話の 続きに しない）
  if (live && currentKey !== key) dropJudgeSession();
  current = null;
  currentKey = key;
  opening ??= connectJudge(apiKey);
  const opened = await opening;
  opening = null;
  if (opened.ok) current = opened.session;
  return opened;
}

async function connectJudge(apiKey: string): Promise<OpenResult> {
  let lastReason = "upstream";
  for (const model of LIVE_TEXT_MODELS) {
    /*
     * 短命トークンは **1回 使い切り**（live-token.ts の `uses: 1`）。
     * 名前を ためすたびに 作り直す——1つを 使い回すと 2つ目は 必ず 断られる。
     * 作るのは モデルを 呼ぶ 数には 入らない（auth_tokens は 別の 入口）。
     */
    const minted = await createLiveToken({ apiKey });
    // 作れない キー（新形式 AQ.）の ときだけ、本人の キーで 直接 つなぐ
    const canUseKey =
      !minted.ok && (minted.reason === "tokenRejected" || minted.reason === "invalidRequest");
    const auth = minted.ok ? minted.token : canUseKey ? apiKey : null;
    if (!auth) return { ok: false, reason: minted.ok ? "upstream" : minted.reason };
    try {
      return { ok: true, session: await openSession(auth, model) };
    } catch (error) {
      lastReason = error instanceof JudgeError ? error.reason : "modelNotFound";
    }
  }
  return { ok: false, reason: lastReason };
}

/**
 * 判定の つなぎを 1本 開く。
 *
 * **AUDIO で つなぐ**（Live は TEXT を 受け付けない）。声は 鳴らさない——
 * この つなぎは 再生先を 持たず、相手にも「声では 返事を しない」と 言って ある。
 */
async function openSession(auth: string, model: string): Promise<JudgeSession> {
  const { GoogleGenAI, Modality } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: auth, apiVersion: "v1beta" });

  let alive = true;
  let settle: ((args: Record<string, unknown>) => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  let ready: () => void = () => {};
  const setupDone = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let session: Session | null = null;

  const connected = ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: JUDGE_SYSTEM,
      tools: [JUDGE_TOOL] as never,
      // 学習者の言ったことに寄せたいので、思いつきは抑える
      temperature: 0.4,
    },
    callbacks: {
      onopen: () => {
        // したくの 合図は SDK が 内側で 受け取る ことが ある。開いた ら 進む
        setTimeout(ready, 400);
      },
      onmessage: (message: unknown) => {
        if (isSetupComplete(message)) ready();
        const call = readToolCall(message);
        if (!call) return;
        // 返事を 返さないと 相手が 待ちつづける。空の 返事を すぐ 返す
        session?.sendToolResponse?.({
          functionResponses: [{ id: call.id, name: call.name, response: { ok: true } }],
        });
        const answer = settle;
        settle = null;
        fail = null;
        answer?.(call.args);
      },
      onerror: () => {
        alive = false;
        ready();
        const bad = fail;
        settle = null;
        fail = null;
        bad?.(new JudgeError("upstream"));
      },
      onclose: () => {
        alive = false;
        ready();
        const bad = fail;
        settle = null;
        fail = null;
        bad?.(new JudgeError("network"));
      },
    },
  });

  session = (await withTimeout(connected, CONNECT_TIMEOUT_MS)) as unknown as Session;
  await withTimeout(setupDone, CONNECT_TIMEOUT_MS);

  return {
    model,
    alive: () => alive,
    close: () => {
      alive = false;
      try {
        session?.close();
      } catch {
        // もう 閉じて いる ものは 閉じられない（それで よい）
      }
    },
    ask: (prompt: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        if (!alive) {
          reject(new JudgeError("network"));
          return;
        }
        const timer = setTimeout(() => {
          settle = null;
          fail = null;
          reject(new JudgeError("timeout"));
        }, REPLY_TIMEOUT_MS);
        settle = (args) => {
          clearTimeout(timer);
          resolve(args);
        };
        fail = (error) => {
          clearTimeout(timer);
          reject(error);
        };
        session?.sendClientContent({
          turns: [{ role: "user", parts: [{ text: prompt }] }],
          turnComplete: true,
        });
      }),
  };
}

/** つなぎの うち、ここで 使う ぶんだけ（SDK の 形が 変わっても 追いやすい）。 */
interface Session {
  sendClientContent: (input: unknown) => void;
  sendToolResponse?: (input: unknown) => void;
  close: () => void;
}

/** 約束に 期限を つける（過ぎたら 投げる）。 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new JudgeError("timeout")), ms)),
  ]);
}

/** 道具の 呼び出しを 取り出す（形が 変わっても 落ちない ように 必要な ところだけ 見る）。 */
function readToolCall(
  message: unknown,
): { id: string; name: string; args: Record<string, unknown> } | null {
  if (!message || typeof message !== "object") return null;
  const calls = (
    message as { toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] } }
  ).toolCall?.functionCalls;
  for (const call of calls ?? []) {
    if (call?.args && typeof call.args === "object") {
      return {
        id: call.id ?? "",
        name: call.name ?? "",
        args: call.args as Record<string, unknown>,
      };
    }
  }
  return null;
}

/** 相手の したくが 済んだか（ここから 送ってよい）。 */
function isSetupComplete(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  return (message as { setupComplete?: unknown }).setupComplete !== undefined;
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
