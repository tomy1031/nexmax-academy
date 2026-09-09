import { createLiveToken, type LiveTokenReason } from "@/lib/ai/live-token";
import { buildFuriganaIndex } from "@/lib/text/furigana";

/**
 * 学習者が じぶんの Gemini APIキーを ためす（せってい・はじめの せってい）
 *
 * ## なぜ要るか（2026-09-09）
 * キーは その端末の localStorage にだけ あり、Google へも 端末から 直接 つなぐ。
 * だから **先生の端末で 通る キーが 学習者の端末で 通らない** ことが ふつうに 起きる
 * （別ブラウザ・回線・VPN・キーの 貼りまちがい）。ところが 学習者が それを 確かめる
 * 場所は 無く、「せつぞくを ためす」は 管理者画面（/admin/ai）にしか 無かった。
 * 先生は 学習者の 画面を 見られないので、原因を 1つも 絞れなかった。
 *
 * ## 学習者の道で 叩いてよいのは auth_tokens だけ
 * `generateContent` も `ListModels` も 学習者の 道では 使わない（constraints 2026-08-27）。
 * ここは たいわが 実際に 通る 道（短命トークンの 発行）を そのまま 1回 なぞる。
 * うまく いった トークンは 使わずに 捨てる（1回きり・30分で 切れる）。
 *
 * ## 「全パターンを 見られる」ように 文言は ここに 集める
 * Google の 失敗を わざと 起こす ことは できないので、文言の 確認は
 * 見本（`?keycheck=all`）で 行う。理由の 名前は `live-token.ts` /
 * `upstream-error.ts` が 返す ものと 1対1。
 */

export type KeyCheckLevel = "ok" | "warn" | "fail";

export interface KeyCheckAdvice {
  readonly level: KeyCheckLevel;
  /** 何が 起きたか。 */
  readonly what: string;
  /** つぎに 何を すれば よいか（学習者が じぶんで できる ことを 先に 書く）。 */
  readonly next: string;
}

/** 出しうる 結果の 名前の 全部。`live-token.ts` の 名前＋ここだけの 2つ（ok / noKey）。 */
export type KeyCheckReason = LiveTokenReason | "ok" | "noKey";

export interface KeyCheckOutcome {
  readonly level: KeyCheckLevel;
  /** 理由の 名前（`reason: …` として 画面のすみに 出す。キーは 含まれない）。 */
  readonly reason: string;
}

/**
 * 文言の 漢字の 読み。学習者が 読む 文なので 裸の 漢字を 残さない（規律2）。
 * 文を 直したら ここも 直す——`tests/gemini_key_check.test.ts` が 覆いを 検査する。
 */
export const KEY_CHECK_FURIGANA = buildFuriganaIndex([
  ["先生", "せんせい"],
  ["直接", "ちょくせつ"],
  ["期限", "きげん"],
  ["制限", "せいげん"],
  ["設定", "せってい"],
  ["文字列", "もじれつ"],
  ["形式", "けいしき"],
  ["場所", "ばしょ"],
  ["国", "くに"],
  ["時間", "じかん"],
  ["回線", "かいせん"],
  ["学校", "がっこう"],
  ["返事", "へんじ"],
  ["用", "よう"],
  ["問題", "もんだい"],
  // 「かき直して」の 1字。「直接」は 上で 長い ほうが 先に 当たる（最長一致）。
  ["直", "なお"],
]);

const TELL_TEACHER = "先生に つたえて ください";

/**
 * 型で 全部の 名前を 要求する。上流に 名前が 増えたら ここが コンパイルで 止まる
 * （黙って「返事が ありませんでした」に 落ちるのが 一番 避けたい 壊れかた）。
 */
export const KEY_CHECK_ADVICE: Record<KeyCheckReason, KeyCheckAdvice> = {
  /*
   * 確かめられたのは「みじかい きっぷ が 1枚 作れた」ことまで。たいわの WebSocket や
   * モデルの 生存は ここでは 見ていないので、「たいわ できます」とは 言い切らない。
   */
  ok: {
    level: "ok",
    what: "キーは Google に うけとって もらえました。この きかいに のこしました。",
    next: `たいわが うごかない ときは ${TELL_TEACHER}。`,
  },
  /*
   * 新しい 形式（AQ.）の キーは、みじかい きっぷ だけ 作れない ことが ある。
   * たいわの 画面は そのとき キーで 直接 つなぐ（use-live-session.ts）ので、
   * 「しっぱい」とは 言わない。
   */
  tokenRejected: {
    level: "warn",
    what: "キーは とおりましたが、たいわ用の みじかい きっぷ は つくれませんでした。",
    next: `たいわは キーで 直接 つなぎます。うごかない ときは ${TELL_TEACHER}。`,
  },
  // この 欄は「任意」。空で 押しても しっぱい（❌）ではなく 注意（⚠️）で 返す。
  noKey: {
    level: "warn",
    what: "キーが まだ ありません。",
    next: "AI と たいわ したい ときに、Google AI Studio で つくった キーを かいて、もういちど おして ください。",
  },
  badKey: {
    level: "fail",
    what: "Google が この キーを うけとりませんでした。",
    next:
      "キーを もういちど コピーして、かき直して ください。" +
      `それでも とおらない ときは ${TELL_TEACHER}（キーの 制限の 設定です）。`,
  },
  keyExpired: {
    level: "fail",
    what: "この キーは 期限が きれています。",
    next: "Google AI Studio で あたらしい キーを つくって ください。",
  },
  keyRestricted: {
    level: "fail",
    what: "この キーには 制限が かかっていて、この きかいからは つかえません。",
    next: `${TELL_TEACHER}（キーの IP や サイトの 制限です）。`,
  },
  apiDisabled: {
    level: "fail",
    what: "この キーの プロジェクトで、Gemini API が まだ ON に なっていません。",
    next: `Google AI Studio で キーを つくり直すか、${TELL_TEACHER}。`,
  },
  wrongKeyType: {
    level: "fail",
    what: "この 文字列は APIキーとして うけとって もらえませんでした（AQ. で はじまる 形式）。",
    // AIza の キーは 2026年9月に 廃止の 予定なので、「作り直せ」とは 言わない（行き止まりになる）。
    next: `${TELL_TEACHER}（キーの 形式の 問題です）。`,
  },
  locationNotSupported: {
    level: "fail",
    what: "キーでは なく、いま いる 場所（国）が はじかれました。",
    next: `VPN を とめて、もういちど ためして ください。それでも とおらない ときは ${TELL_TEACHER}。`,
  },
  noPermission: {
    level: "fail",
    what: "この キーでは たいわの きのうが つかえません。",
    next: `${TELL_TEACHER}（キーの プロジェクトの 設定です）。`,
  },
  rateLimited: {
    level: "fail",
    // 分の 上限でも 返る。「きょう」と 断定すると その日を あきらめてしまう。
    what: "この キーは いま つかいすぎです。",
    next: "しばらく 時間を おいて、もういちど ためして ください。",
  },
  modelNotFound: {
    level: "fail",
    what: "たいわに つかう モデルが みつかりませんでした。",
    next: `${TELL_TEACHER}。`,
  },
  network: {
    level: "fail",
    what: "Google に つながりませんでした。",
    next:
      "Wi-Fi や モバイル回線を かえて、もういちど ためして ください。" +
      "学校の ネットワークだと つながらない ことが あります。",
  },
  upstream: {
    level: "fail",
    what: "Google から 返事が ありませんでした。",
    next: "すこし まって、もういちど ためして ください。",
  },
};

/** 見本に 並べる 順（うまく いった → 注意 → しっぱい）。 */
export const ALL_KEY_CHECK_REASONS: readonly KeyCheckReason[] = Object.keys(
  KEY_CHECK_ADVICE,
) as KeyCheckReason[];

/** 理由の 名前から 文言を 引く。知らない 名前（型を すり抜けた もの）は `upstream` に 寄せる。 */
export function adviceFor(reason: string): KeyCheckAdvice {
  return (
    (KEY_CHECK_ADVICE as Record<string, KeyCheckAdvice | undefined>)[reason] ??
    KEY_CHECK_ADVICE.upstream
  );
}

/**
 * キーを 1回 ためす。**投げない**——結果は かならず 理由の 名前で 返す。
 * 空の キーは Google に 聞かずに `noKey`。
 */
export async function checkGeminiKey(key: string): Promise<KeyCheckOutcome> {
  const trimmed = key.trim();
  if (!trimmed) return { level: "warn", reason: "noKey" };

  const minted = await createLiveToken({ apiKey: trimmed });
  if (minted.ok) return { level: "ok", reason: "ok" };
  return { level: adviceFor(minted.reason).level, reason: minted.reason };
}
