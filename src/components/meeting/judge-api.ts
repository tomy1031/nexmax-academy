"use client";

import type { MatchableFact } from "@/components/listening/req-matcher";
import {
  authFromToken,
  connectLiveInOrder,
  createSetupGate,
  LiveSetupError,
  reasonFromClose,
} from "@/lib/ai/live-connect";
import { liveDebug } from "@/lib/ai/live-debug";
import { createLiveToken } from "@/lib/ai/live-token";
import { LIVE_TEXT_MODELS } from "@/lib/ai/models";
import {
  ASAKAI_JUDGE_SYSTEM,
  ASAKAI_TOOL,
  buildAsakaiJudgePrompt,
  parseAsakaiJudge,
  type AsakaiJudgeContext,
  type AsakaiJudgeResult,
} from "@/lib/meeting/asakai-judge";
import { getGeminiKey } from "@/lib/profile";
import {
  QUIZ_REVIEW_SYSTEM,
  QUIZ_REVIEW_TOOL,
  buildQuizReviewPrompt,
  parseQuizReview,
  type QuizReviewContext,
  type QuizReviewResult,
} from "@/lib/quiz/ai-review";
import {
  CARD_TOOL,
  JUDGE_TOOL,
  buildCardPrompt,
  buildJudgePrompt,
  isKanaOnly,
  parseCardHit,
  parseJudge,
  type CardTopic,
  type JudgeContext,
  type JudgeResult,
} from "@/lib/meeting/judge";
import {
  TALK_SYSTEM,
  TALK_TOOL,
  buildTalkPrompt,
  dropUnreadableText,
  isKanaOnly as isTalkKanaOnly,
  parseTalk,
  type TalkContext,
  type TalkJudgement,
} from "@/lib/talkgame/judge";

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
  /** 教材が 決めた 言い直しの 上限（`null` は なし・欄が 無ければ 既定）。 */
  maxAttempts?: number | null;
}

export type JudgeApiResult =
  { ok: true; judge: JudgeResult; model: string } | { ok: false; reason: string };

/** 1つの 頼みの 返事を 待つ 上限。 */
const REPLY_TIMEOUT_MS = 12_000;

/**
 * つないで したくが 済むまでの 上限（過ぎたら つぎの モデル名を ためす）。
 *
 * **断られた ときは 待たない**（2026-09-16）。したくの 前に 閉じられたら その場で
 * つぎへ 進む（`live-connect.ts` の 門）。この 上限が 効くのは 何も 返らない ときだけ。
 */
const CONNECT_TIMEOUT_MS = 9_000;

/** 判定ぜんぶの 上限。どこで 詰まっても 必ず 返す（画面を 止めない）。 */
const OVERALL_TIMEOUT_MS = 25_000;

/**
 * 判定係への 言い渡し。
 *
 * **その回の 中身は ここに 書かない**（それは `buildJudgePrompt` が 毎回 渡す）。
 * ここに 置くのは、つなぎの あいだ ずっと 変わらない 決まりだけ。
 */
export const JUDGE_SYSTEM = [
  "あなたは 日本語の 先生です。日本で はたらきたい 学生（日本語N5〜N4・英語は読める）の",
  "れんしゅうを 見ます。",
  "学生の ことばが とどいたら、かならず 1回だけ 道具 nihongo_no_mikata を 呼びます。",
  "声では 返事を しません（道具を 呼ぶだけ）。",
  "学生が 読む 文（reply・praise・fix・exampleAnswer）は ひらがなと カタカナだけで",
  "書きます。漢字は 1文字も つかいません。ことばの あいだに 空白を 入れます。",
].join("\n");

/**
 * 札の 判定係への 言い渡し。
 *
 * 見かたの 係とは **別の つなぎ**に する（渡す 決まりも 道具も ちがう）。
 * 声で 返させない のは 同じ——この つなぎは 鳴らす 先を 持たない。
 */
export const CARD_SYSTEM = [
  "あなたは 学生の しつもんが どの 話題に あたるかを 決める 係です。",
  "学生の ことばが とどいたら、かならず 1回だけ 道具 fuda_no_hantei を 呼びます。",
  "声では 返事を しません（道具を 呼ぶだけ）。",
  "どれに あたるか はっきり しない ときは none を 返します。",
].join("\n");

/**
 * 学習者の しつもんが **どの 札に あたるか**を 聞く。
 *
 * ことばの 照合が 外れた ときの 二の手なので、**失敗は 黙って 当たり無し**に する
 *（鍵が 無い・混んで いる・切れた——どれも 学習者の せいでは ない）。
 * 待たせない ことも 大事で、ここが 遅れて いる あいだも 相手は 声で 答えて いる。
 */
export async function requestCardHit(
  meetingId: string,
  topics: readonly CardTopic[],
  utterance: string,
): Promise<string | null> {
  const apiKey = getGeminiKey();
  if (!apiKey || topics.length === 0) return null;
  try {
    const opened = await openJudge(apiKey, "cards", meetingId);
    if (!opened.ok) return null;
    const args = await opened.session.ask(buildCardPrompt(topics, utterance));
    return parseCardHit(args, topics);
  } catch {
    // 切れて いる ことが ある。つぎの 呼び出しで 張り直せる ように 捨てる
    dropSlot(SLOTS.cards);
    return null;
  }
}

/**
 * 朝礼・夕礼の 報告を 見て もらう（1本の 報告 → 言えた 行の 一覧）。
 *
 * ## 失敗は 黙って 何も 見えなかった ことに する
 * 鍵が 無い・混んで いる・切れた——どれも 学習者の せいでは ない。
 * 返すのは **足し算の 材料**だけ なので、届かなくても 教材は ことばの 照合で
 * そのまま 動く（開く 条件も 合格ラインも 1つも 変わらない）。
 *
 * ## 待たせない
 * 学習者は 報告を 言い終えて、司会の 返事を 待って いる。ここが 遅れると
 * **画面が 止まって 見える**ので、上限を 短くして 先へ 進める。
 *
 * `key` に 教材と 曜日を 混ぜるのは、**日が 変わったら 張り直す**ため
 *（月曜の 履歴を 引きずると、火曜の 報告を 月曜の 行で 見はじめる）。
 */
export type AsakaiJudgeApiResult =
  { ok: true; judge: AsakaiJudgeResult } | { ok: false; reason: string };

/**
 * **報告の 判定の つなぎを 先に 張って おく**（2026-09-23）。
 *
 * `requestAsakaiJudge` の 上限（13秒）には **つなぎの したく**も 入る。
 * したくは 通行証 → 接続 → setup の 3つで、先頭の モデルが 何も 返さない ときは
 * そこだけで 9秒 かかる——その日 **最初の 1本**が 毎回 間に 合わず、
 * 「AIの 見かたが 届きませんでした」に なって いた（2026-09-23 に 実報告）。
 *
 * もんだいの 見て もらう（`warmQuizReview`）と 同じ 手で、**学習者が まだ
 * 報告メモを 読んで いる あいだ**に 張る。押した ときには もう 開いて いるので
 * 往復ぶんだけで 返る。失敗は 画面に 出さない（報告の ときに もう いちど 張る）。
 */
export async function warmAsakaiJudge(key: string): Promise<boolean> {
  const apiKey = getGeminiKey();
  if (!apiKey) return false;
  // 見て もらって いる 最中は 触らない（走って いる 往復の つなぎを 捨てて しまう）
  if (SLOTS.asakai.busy) return false;
  if (SLOTS.asakai.key === key && (SLOTS.asakai.session?.alive() || SLOTS.asakai.opening)) {
    return true;
  }
  const opened = await openJudge(apiKey, "asakai", key).catch(() => null);
  return opened?.ok === true;
}

export async function requestAsakaiJudge(
  key: string,
  context: AsakaiJudgeContext,
  facts: readonly MatchableFact[],
): Promise<AsakaiJudgeApiResult> {
  const apiKey = getGeminiKey();
  /*
   * **なぜ 出ないかを 画面に 返す**（2026-09-23 の 指定
   *「鍵がない＝GeminiAPIキーがないということですか？ ならそのように言って
   *  APIキーの登録をうながしてください」）。
   *
   * 前は どの 失敗も `null` で 帰って いた ので、画面は
   *「AIの 見かたが 届きませんでした」の 1文しか 出せなかった——キーが 無いのか、
   * 混んで いるのか、間に 合わなかったのかで **学習者が する ことは まるで ちがう**。
   */
  if (!apiKey) return { ok: false, reason: "noKey" };
  if (facts.length === 0) return { ok: false, reason: "noFacts" };
  /*
   * **1本ずつ しか 頼まない**（2026-09-14 の 検収）。
   *
   * つなぎは `settle` を **1組しか 持たない**（`openSession` の `ask`）。
   * 待ちを 諦めた あとも 中の 往復は 生きて いる ので、そこへ 2本目を 重ねると
   * **1本目の 返事が 2本目の 答えに なる**——まとめた 報告が、前の 発話の
   * 見立て（記録の 読み上げ）で 丸ごと 0点に なる。事実と ちがう 判定を
   * 断言する ことに なる（規律1 の 逆）。重なった ぶんは 頼まずに 諦める：
   * ことばの 照合だけで 進むので、学習者は 止まらない。
   */
  if (SLOTS.asakai.busy) return { ok: false, reason: "busy" };
  SLOTS.asakai.busy = true;
  /*
   * **札（busy）を 下ろすのは 中の 往復が 本当に 終わった とき**（2026-09-16 の 検収）。
   *
   * 前は 待ちを 諦めた 時点（13秒）で 下ろして いた。つなぎの したくに 時間が
   * かかると 往復は その あとも 生きて いて、つぎの 報告が 同じ つなぎに 重なり、
   * **1本目の 見立てが 2本目の 答えに なる**（上の 1本ずつの 理由と 同じ 事故）。
   * 学習者を 待たせる 上限は そのまま——札だけ 往復に 合わせて 持ちつづける。
   * `askAsakai` は 投げない（失敗は null で 返る）。
   *
   * 待ちを 諦めた あとに つながった ときは **頼みを 送らない**（`gaveUp`）。
   * 答えは どうせ 捨てる ので、Live の 往復 1回と 札を 持つ 時間（最大 12秒）の むだに なる。
   */
  let gaveUp = false;
  /** 往復が 終わったか（待ちの 時計は 止めない ので、記録の ときだけ 見る）。 */
  let settled = false;
  const work = askAsakai(apiKey, key, context, facts, () => gaveUp).finally(() => {
    settled = true;
    SLOTS.asakai.busy = false;
  });
  return await Promise.race([
    work,
    new Promise<AsakaiJudgeApiResult>((resolve) =>
      setTimeout(() => {
        gaveUp = true;
        // 先に 終わって いた ときは 時計だけ 残って いる（失敗では ない）
        if (!settled) liveDebug("judge.asakai", `timeout ${ASAKAI_TIMEOUT_MS}ms`, true);
        resolve({ ok: false, reason: "timeout" });
      }, ASAKAI_TIMEOUT_MS),
    ),
  ]);
}

/**
 * 報告の 判定を 待つ 上限。過ぎたら ことばの 照合だけで 先へ 進む。
 *
 * ## 数字の 整合（2026-09-16 の 検収）
 * この 13秒には、つなぎが 無い ときの **したく**も 入る。
 * - つながって いる とき … 往復だけ（ふだん 数秒）
 * - 張り直す とき ………… 通行証 → したく → 往復。先頭の モデルに **断られた** ときは
 *   待たずに 控えへ 進む（`CONNECT_TIMEOUT_MS` の 注記）ので、控えで つないでも 収まる。
 *   前は 断られても したくの 上限（9秒）まで 待って いたので、控えの したくと 往復が
 *   残りの 4秒に 入らず、先頭を 断る 鍵では **その日 最初の 報告が 毎回** 見立て なしだった
 * - 先頭が **何も 返さない** とき（まれ）は 9秒 待つ ので、その 1本は 間に 合わない。
 *   つなぎは 裏で 控えまで 進み、**つぎの 報告から** 使える（上限を 伸ばすと
 *   学習者の 画面が その ぶん 止まる ので、伸ばさない）
 *
 * 前は「中の 往復の 上限（`REPLY_TIMEOUT_MS` = 12秒）より 長い」ことで、諦めた あとの
 * 往復が 次の 頼みに ぶつからない ように して いた。したくの 時間が 足されると
 * 往復は 13秒を 越えて 生きるので、**いまは 数字では なく 札で 守る**（上の 注記）。
 */
const ASAKAI_TIMEOUT_MS = 13_000;

async function askAsakai(
  apiKey: string,
  key: string,
  context: AsakaiJudgeContext,
  facts: readonly MatchableFact[],
  /** 呼んだ 側が 待ちを 諦めたか（つながった ときに 見て、諦めて いたら 頼まない）。 */
  gaveUp: () => boolean,
): Promise<AsakaiJudgeApiResult> {
  let mine: JudgeSession | null = null;
  try {
    const opened = await openJudge(apiKey, "asakai", key);
    // つなぎは スロットに 残す（つぎの 報告が 使う）。頼みだけ やめる
    if (!opened.ok) return { ok: false, reason: opened.reason };
    if (gaveUp()) return { ok: false, reason: "timeout" };
    mine = opened.session;
    const args = await mine.ask(buildAsakaiJudgePrompt(context));
    const judge = parseAsakaiJudge(
      args,
      facts,
      (context.items ?? context.panels).map((one) => one.id),
    );
    return judge ? { ok: true, judge } : { ok: false, reason: "badShape" };
  } catch (error) {
    liveDebug("judge.asakai", `ask ${error instanceof JudgeError ? error.reason : "failed"}`, true);
    /*
     * **自分が 使った つなぎ だけを 捨てる**（2026-09-14 の 検収）。
     *
     * `dropSlot` は スロットの **いまの 中身**を 捨てる ので、日を またいで
     * 張り直した あとに 前の 日の 失敗が 届くと、**新しい つなぎを 巻き添えに
     * する**。そこから 先は 毎回 張り直しに なり、9秒×2本の したくで
     * 上限を 超えつづける＝AIの 見立てが 二度と 届かない。
     */
    if (mine && SLOTS.asakai.session === mine) dropSlot(SLOTS.asakai);
    return { ok: false, reason: error instanceof JudgeError ? error.reason : "failed" };
  }
}

export type QuizReviewApiResult =
  { ok: true; review: QuizReviewResult; model: string } | { ok: false; reason: string };

/**
 * 書いた ものを 見て もらう（もんだいの「🤖 AIに 見て もらう」）。
 *
 * ## 1本ずつ しか 頼まない
 * 全問 1ページの 教材では、学習者は **となりの もんだいの ボタンも すぐ 押せる**。
 * つなぎは 往復を 1組しか 持たない ので、重ねると **1問目の 見立てが 2問目の
 * 答えに なる**（朝礼で 実際に 起きた 形）。重なった ぶんは `busy` で 断り、
 * 画面は「いま ほかの もんだいを 見て います」と 言う。
 *
 * ## つなぎは しつもんごと（`key`）
 * 同じ つなぎを しつもんを またいで 使い回すと、相手は 前の しつもんの 返事を
 * くり返す ように なる（2026-08-21 の 実発生）。張り直す 数秒より、
 * **ちがう もんだいの 直しが 返る** ほうが こわい。
 *
 * ## 読めない 漢字は 1回だけ 言い直させる
 * `needsKanjiRetry` は 呼ぶ 側（画面）が 決める——読み辞書は 教材が 持って いて、
 * ここからは 見えない ため。
 */
export async function requestQuizReview(
  key: string,
  context: QuizReviewContext,
  needsKanjiRetry: (result: QuizReviewResult) => boolean,
): Promise<QuizReviewApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };
  if (SLOTS.review.busy) return { ok: false, reason: "busy" };
  SLOTS.review.busy = true;
  /*
   * **札（busy）を 下ろすのは 中の 往復が 本当に 終わった とき**（朝礼が 2026-09-16 に
   * 直した 形と 同じ）。待ちを 諦めた 時点で 下ろすと、往復は その あとも 生きて いて、
   * つぎの 頼みが 同じ つなぎに 重なり、**1回目の 見立てが 2回目の 答えに なる**。
   * 学習者は 書き直した 文に「⭕ つたわります」と 断言される——規律1 の 逆。
   *
   * 待ちを 諦めた あとに つながった ときは **頼みを 送らない**（`gaveUp`）。
   * 答えは どうせ 捨てる ので、Live の 往復 1回の むだに なる。
   */
  let gaveUp = false;
  const work = askQuizReview(apiKey, key, context, needsKanjiRetry, () => gaveUp).finally(() => {
    SLOTS.review.busy = false;
  });
  // どこで 詰まっても 必ず 返る（画面の ボタンを 押しっぱなしに しない）
  const result = await Promise.race([
    work,
    new Promise<QuizReviewApiResult>((resolve) =>
      setTimeout(() => {
        gaveUp = true;
        resolve({ ok: false, reason: "timeout" });
      }, OVERALL_TIMEOUT_MS),
    ),
  ]);
  liveDebug("judge.review", result.ok ? `ok ${result.model}` : result.reason, !result.ok);
  return result;
}

/**
 * **押す 前に つなぎを 張って おく**（2026-09-21 の 指定「AI読み取りの反応が遅いです」）。
 *
 * 見かたの つなぎは **1回の チェックごとに 張り直す**（`key` に 回数が 入って いる——
 * 同じ つなぎを 使い回すと 前の 回の 返事を くり返す ため）。その したくは
 * 短命トークンの 発行＋Live の 接続＋合図待ちで **数秒**かかり、いまは その 数秒を
 * **押した あとに** 待たせて いた。
 *
 * だから 押しそうな ところ——**ぜんぶ 書けて ボタンが 押せるように なった とき**——で
 * 先に 張る。押した ときには もう 開いて いる ので、往復ぶんだけで 返る。
 *
 * 張るのは **1つの 鍵に つき 1回**（`openJudge` が 同じ 鍵なら 使い回す）。
 * 見て もらって いる 最中（`busy`）は 何も しない——走って いる 往復の つなぎを
 * 横から 捨てて しまう。
 */
export async function warmQuizReview(key: string): Promise<boolean> {
  const apiKey = getGeminiKey();
  if (!apiKey) return false;
  // 見て もらって いる 最中は 触らない（走って いる 往復の つなぎを 捨てて しまう）
  if (SLOTS.review.busy) return false;
  if (SLOTS.review.key === key && (SLOTS.review.session?.alive() || SLOTS.review.opening)) {
    return true;
  }
  const opened = await openJudge(apiKey, "review", key).catch(() => null);
  // 失敗した ことは 画面に 出さない（押した ときに もう一度 張る）
  return opened?.ok === true;
}

async function askQuizReview(
  apiKey: string,
  key: string,
  context: QuizReviewContext,
  needsKanjiRetry: (result: QuizReviewResult) => boolean,
  /** 呼んだ 側が 待ちを 諦めたか（つながった ときに 見て、諦めて いたら 頼まない）。 */
  gaveUp: () => boolean,
): Promise<QuizReviewApiResult> {
  const opened = await openJudge(apiKey, "review", key);
  if (!opened.ok) return { ok: false, reason: opened.reason };
  // つなぎは スロットに 残す（つぎの 頼みが 使う）。頼みだけ やめる
  if (gaveUp()) return { ok: false, reason: "timeout" };
  const session = opened.session;
  try {
    let review = parseQuizReview(await session.ask(buildQuizReviewPrompt(context)), context);
    if (review && needsKanjiRetry(review)) {
      const again = parseQuizReview(
        await session.ask(buildQuizReviewPrompt(context, true)),
        context,
      );
      // 2回目が 崩れて いたら 1回目を 使う（読めない 文は 画面が 落とす）
      if (again) review = again;
    }
    if (!review) return { ok: false, reason: "badShape" };
    return { ok: true, review, model: session.model };
  } catch (error) {
    /*
     * **自分が 使った つなぎ だけを 捨てる**（朝礼の `askAsakai` と 同じ）。
     * `dropSlot` は スロットの **いまの 中身**を 捨てるので、別の 問いへ 移った あとに
     * 前の 問いの 失敗が 届くと、**新しい つなぎを 巻き添えに する**。そこから 先は
     * 毎回 張り直しに なり、短命トークンも 1枚ずつ むだに なる。
     */
    if (SLOTS.review.session === session) dropSlot(SLOTS.review);
    return { ok: false, reason: error instanceof JudgeError ? error.reason : "network" };
  }
}

export type TalkApiResult =
  { ok: true; judgement: TalkJudgement; model: string } | { ok: false; reason: string };

/**
 * 対話ゲームの ひとまわり（願い #177）。
 *
 * 見かたと 深掘りの しつもんを **1回の 呼び出しで** もらう。分けると、
 * 学習者は 同じ 発話に 2回 待たされる（つなぎは 1本でも、往復は 2回に なる）。
 *
 * `key` に ばんを 混ぜて 渡すのは、**ばんが 変わったら 張り直す**ため
 *（話す ばんの 履歴を 引きずると、聞く ばんでも 深掘りの しつもんを 作りつづける）。
 */
export async function requestTalkTurn(key: string, context: TalkContext): Promise<TalkApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };
  return await Promise.race([
    askTalk(apiKey, key, context),
    new Promise<TalkApiResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), OVERALL_TIMEOUT_MS),
    ),
  ]);
}

async function askTalk(apiKey: string, key: string, context: TalkContext): Promise<TalkApiResult> {
  const opened = await openJudge(apiKey, "talk", key);
  if (!opened.ok) return { ok: false, reason: opened.reason };
  const session = opened.session;
  try {
    let judgement = parseTalk(await session.ask(buildTalkPrompt(context)));
    // 漢字が 混ざって いたら、混ざって いた ことを 伝えて もう一度 だけ 頼む
    if (judgement && !isTalkKanaOnly(judgement)) {
      judgement = parseTalk(await session.ask(buildTalkPrompt(context, true)));
    }
    if (!judgement) return { ok: false, reason: "badShape" };
    /*
     * **2回 頼んでも 漢字が 残ったら、文だけ 落として 観点は 残す**（2026-08-31 の 指摘）。
     *
     * 前は ここで `kanaRetryFailed` を 返して **見かたを まるごと 捨てて** いた。
     * 落ちた 先の 規則ベースは `concrete` を いつも false に する ので、
     *「NMClaw が 先進的で いいと 思いました」が **会社の ことが 入って いる ✗ +0%**に なる。
     * AIは 正しく 見て いたのに、**返事の 文に 漢字が あった**という 別の 理由で
     * その 判断ごと 消えて いた（`先進的`・`業界`・`応用` は 一覧に 無い）。
     *
     * 観点は 真偽値で、漢字とは 関係が 無い。捨てる のは 読めない **文だけ**に する。
     */
    if (!isTalkKanaOnly(judgement)) {
      dropSlot(SLOTS.talk);
      return { ok: true, judgement: dropUnreadableText(judgement), model: session.model };
    }
    return { ok: true, judgement, model: session.model };
  } catch (error) {
    dropSlot(SLOTS.talk);
    return { ok: false, reason: error instanceof JudgeError ? error.reason : "network" };
  }
}

export async function requestJudge(request: JudgeRequest): Promise<JudgeApiResult> {
  const apiKey = getGeminiKey();
  if (!apiKey) return { ok: false, reason: "noKey" };
  // どこで 詰まっても 必ず 返る（止まらない ことを 見かたの 質より 上に 置く）
  const result = await Promise.race([
    askJudge(apiKey, request),
    new Promise<JudgeApiResult>((resolve) =>
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), OVERALL_TIMEOUT_MS),
    ),
  ]);
  liveDebug("judge.judge", result.ok ? `ok ${result.model}` : result.reason, !result.ok);
  return result;
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
  const opened = await openJudge(apiKey, "judge", `${request.meetingId}:${request.questionId}`);
  if (!opened.ok) return { ok: false, reason: opened.reason };
  const session = opened.session;

  try {
    const limit = request.maxAttempts;
    let judge = parseJudge(await session.ask(buildJudgePrompt(context)), context.attempt, limit);
    // 漢字が混ざっていたら、混ざっていたことを伝えてもう一度だけ頼む
    if (judge && !isKanaOnly(judge)) {
      judge = parseJudge(
        await session.ask(buildJudgePrompt(context, true)),
        context.attempt,
        limit,
      );
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
/** つなぎの 役（役ごとに 別の つなぎを 張る）。 */
type SlotKind = "judge" | "cards" | "talk" | "asakai" | "review";

interface Slot {
  /** つなぎの 中身（相手に 渡す 決まりと 道具）。 */
  readonly system: string;
  readonly tool: unknown;
  readonly temperature: number;
  session: JudgeSession | null;
  /** いま 張って いる つなぎが **どの しつもんの もの**か。 */
  key: string;
  /** いま 張って いる 途中の もの（続けて 頼まれても つなぎは 1本に する）。 */
  opening: Promise<OpenResult> | null;
  /**
   * いま 1本 頼んで いる 最中か。
   *
   * つなぎは `settle` を 1組しか 持たない ので、往復を 重ねると
   * **前の 返事が つぎの 答えに なる**。重なりを 断る ために 立てる。
   */
  busy?: boolean;
}

/**
 * つなぎは **役ごとに 別**（2026-08-21）。
 *
 * 日本語の 見かたと 札の 当たり判定は、渡す 決まりも 道具も ちがう。
 * 1本を 使い回すと、どちらかの 道具が もう一方の ターンで 呼ばれる。
 */
const SLOTS: Record<SlotKind, Slot> = {
  judge: {
    system: JUDGE_SYSTEM,
    tool: JUDGE_TOOL,
    temperature: 0.4,
    session: null,
    key: "",
    opening: null,
  },
  /* 話題を 選ぶだけ なので 思いつきは 要らない（同じ しつもんは 同じ 答えに） */
  cards: {
    system: CARD_SYSTEM,
    tool: CARD_TOOL,
    temperature: 0,
    session: null,
    key: "",
    opening: null,
  },
  /*
   * 対話ゲーム（願い #177）。**深掘りの しつもんを その場で 作らせる**ので、
   * 見かたの 係より 少しだけ 思いつきを 許す（同じ 聞き方の くり返しを 避ける ため）。
   */
  talk: {
    system: TALK_SYSTEM,
    tool: TALK_TOOL,
    temperature: 0.6,
    session: null,
    key: "",
    opening: null,
  },
  /*
   * 報告の 判定（朝礼・夕礼）。**思いつきは 要らない**——同じ 報告は いつも
   * 同じ 行に 当たって ほしい。合否が 日に よって 動くのを 避ける ため
   *（設計 #366 の 6.1）。
   */
  asakai: {
    system: ASAKAI_JUDGE_SYSTEM,
    tool: ASAKAI_TOOL,
    temperature: 0,
    session: null,
    key: "",
    opening: null,
  },
  /*
   * 書いた ものの 見かた（もんだいの `free`・`fillin`）。**思いつきは ほとんど 要らない**
   *——同じ 文を 2回 見て もらった ときに 観点の ○△が 入れ替わると、
   * 学習者は どちらを 信じれば よいか 分からなく なる。
   * 書き直し（ブラッシュアップ）の ために 0 よりは すこしだけ 上げる。
   */
  review: {
    system: QUIZ_REVIEW_SYSTEM,
    tool: QUIZ_REVIEW_TOOL,
    temperature: 0.2,
    session: null,
    key: "",
    opening: null,
  },
};
type OpenResult = { ok: true; session: JudgeSession } | { ok: false; reason: string };

/**
 * つなぎを 捨てる（切れた とき・画面を 離れる とき）。
 *
 * しつもんを またいで 1本を 使い回して いた ため、履歴が 積もって 相手は
 * **1問目の 返事文を そのまま くり返す**ように なって いた
 *（2026-08-21「返答だけが 最初の 会話に 戻る」）。鍵（`key`）が 変わったら 張り直す。
 */
export function dropJudgeSession(): void {
  for (const slot of Object.values(SLOTS)) dropSlot(slot);
}

function dropSlot(slot: Slot): void {
  slot.session?.close();
  slot.session = null;
  slot.key = "";
  slot.opening = null;
}

async function openJudge(apiKey: string, kind: SlotKind, key: string): Promise<OpenResult> {
  const slot = SLOTS[kind];
  const live = slot.session;
  if (live?.alive() && slot.key === key) return { ok: true, session: live };
  // しつもんが 変わった（＝前の 話の 続きに しない）
  if (live && slot.key !== key) dropSlot(slot);
  slot.session = null;
  slot.key = key;
  slot.opening ??= connectJudge(apiKey, slot);
  const opened = await slot.opening;
  slot.opening = null;
  if (opened.ok) slot.session = opened.session;
  // 見かたの つなぎの 張り直し（`?debug=1` の 記録。使い回しの ときは 残さない）
  liveDebug(
    `judge.${kind}`,
    opened.ok ? `open ${opened.session.model}` : opened.reason,
    !opened.ok,
  );
  return opened;
}

async function connectJudge(apiKey: string, slot: Slot): Promise<OpenResult> {
  /*
   * 短命トークンは **1回 使い切り**（live-token.ts の `uses: 1`）。
   * 名前を ためすたびに 作り直す——1つを 使い回すと 2つ目は 必ず 断られる。
   * 作るのは モデルを 呼ぶ 数には 入らない（auth_tokens は 別の 入口）。
   * 作れない キー（新形式 AQ.）の ときだけ、本人の キーで 直接 つなぐ（`authFromToken`）。
   *
   * 順番の 決まりは たいわ・声と 同じ 1つ（`connectLiveInOrder`）。ここが 手本だった。
   */
  const connected = await connectLiveInOrder({
    models: LIVE_TEXT_MODELS,
    mint: async () => authFromToken(await createLiveToken({ apiKey }), apiKey),
    open: (auth, model) => openSession(auth, model, slot),
    reasonOf: (error) =>
      error instanceof JudgeError || error instanceof LiveSetupError
        ? error.reason
        : "modelNotFound",
  });
  return connected.ok
    ? { ok: true, session: connected.session }
    : { ok: false, reason: connected.reason };
}

/**
 * 判定の つなぎを 1本 開く。
 *
 * **AUDIO で つなぐ**（Live は TEXT を 受け付けない）。声は 鳴らさない——
 * この つなぎは 再生先を 持たず、相手にも「声では 返事を しない」と 言って ある。
 */
async function openSession(auth: string, model: string, slot: Slot): Promise<JudgeSession> {
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
  /** したくの 合図を 待つ 門。断られたら 期限を 待たずに 投げる（つぎの モデルへ）。 */
  const gate = createSetupGate<Session>(CONNECT_TIMEOUT_MS);

  const connected = ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: slot.system,
      tools: [slot.tool] as never,
      // 学習者の言ったことに寄せたいので、思いつきは抑える
      temperature: slot.temperature,
    },
    callbacks: {
      onopen: () => {
        // したくの 合図は SDK が 内側で 受け取る ことが ある。開いた ら 進む
        setTimeout(ready, 400);
      },
      onmessage: (message: unknown) => {
        // 諦めた つなぎ（遅れて つながり、門が 閉じる もの）の 届きものは 捨てる
        if (gate.phase() === "abandoned") return;
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
      /*
       * したくの 前の 切断は「この モデルに 断られた」。SDK の connect は 断られても
       * 返らない ので、門を 落として その場で つぎへ 進む（前は 9秒 待って いた）。
       * したくの あとなら 門は 何も しない。
       */
      onerror: () => {
        gate.fail("upstream");
        alive = false;
        ready();
        const bad = fail;
        settle = null;
        fail = null;
        bad?.(new JudgeError("upstream"));
      },
      onclose: (event: unknown) => {
        // 使いすぎで 閉じられた ときは その 名前で（学習者の 文言が「つかいすぎ」に なる）
        gate.fail(reasonFromClose(event));
        alive = false;
        ready();
        const bad = fail;
        settle = null;
        fail = null;
        bad?.(new JudgeError("network"));
      },
    },
  });

  session = await gate.wait(connected as unknown as Promise<Session>);
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
    // 全問 1ページの 教材で、となりの もんだいを 見て いる あいだに 押した とき
    case "busy":
      return "AIは いま ほかの もんだいを みて います。すこし まってから おして ください。";
    case "network":
      return "つうしんが うまく いきませんでした。もう いちど おねがいします。";
    default:
      return "AIの みかたは いま つかえません。かいた こたえは そのまま すすめられます。";
  }
}
