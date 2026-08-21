/**
 * つづきから はじめる — 途中で 閉じても 1問目に 戻さない
 *
 * ## 何が 起きていたか
 * 画面は 進んだ ところを `recordContentProgress(meeting.id, { position: { panel: at } })`
 * に **書いて いたのに、読んで いなかった**（`useState(0)` のまま）。8問の 報告
 * ミーティングを 6問目まで 進めて 閉じた 学習者は、次に 開くと 1問目から。
 * 開いた札も ハートも 消える。90分の 授業では、これだけで その日が 終わる。
 *
 * ## しおりだけでは 足りない
 * 位置だけ 戻しても、**開いた札・ハート・答えた ことば**が 消えていれば、
 * 学習者の 目には やり直しに 見える（きろくカードも 残り2問ぶんしか 出ない）。
 * だから この 教材の「いまの ところ」を ひとまとめで 端末に 残す。
 *
 * 置き場は 進捗ストアと 同じ 入れ物・同じ 名前空間（`nexmax:v1`）で、鍵だけ 分ける
 *（`record.ts` と 同じ 流儀）。DBには 送らない——先生が 見る 成績では なく、
 * 学習者の 手もとの しおりである。
 *
 * ## 完走したら 消す
 * 話しきった 人が もう一度 開いたら、**はじめから 話せる**のが 正しい
 *（会話の 練習は 何度でも やり直せる）。だから 完走で 消し、位置が 質問の 数に
 * 届いて いるときは 保存が 残って いても はじめから にする。
 */

import { z } from "zod";
import { EMPTY_AFFECTION, type AffectionState } from "@/lib/meeting/affection";
import { defaultBackend, readContentProgress, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

const resumeSchema = z.object({
  meetingId: z.string(),
  /** つぎに 聞かれる 質問の 番号（0始まり）。 */
  index: z.number().int().min(0),
  /** 開いた札（言い直しを 求められずに 答えられた 質問）。 */
  openIds: z.array(z.string()),
  /** 質問ID → さいごに 言った ことば。 */
  answers: z.record(z.string(), z.string()),
  /** ハートの 内訳（`affection.ts` の AffectionState と 同じ かたち）。 */
  affection: z.object({
    perQuestion: z.record(z.string(), z.number()),
    finished: z.boolean(),
  }),
  /**
   * いま 見て いた ばん。
   *
   * `.default()` に して あるのは、**この 欄が 無い ころの 保存値も 読める**ように
   * する ため（消えた ぶんだけ 学習者が 1問目に 戻されるのは 避けたい）。
   */
  round: z.enum(["ask", "listen"]).default("ask"),
  /** 聞き出せた こと（ラウンド2の 札）。同じく 既定つき。 */
  found: z.array(z.string()).default([]),
});

export type MeetingResume = z.infer<typeof resumeSchema>;

/** 画面が これから 始める ところ。 */
export interface MeetingStart {
  readonly index: number;
  readonly openIds: readonly string[];
  readonly answers: Readonly<Record<string, string>>;
  readonly affection: AffectionState;
  /** いま 見て いた ばん。 */
  readonly round: "ask" | "listen";
  /** 聞き出せた こと（ラウンド2の 札）。 */
  readonly found: readonly string[];
  /** 途中から 戻ったか（画面の 組み立てに 使う。**学習者には 出さない**）。 */
  readonly resumed: boolean;
}

/** はじめから。 */
export const FRESH_START: MeetingStart = {
  index: 0,
  openIds: [],
  answers: {},
  affection: EMPTY_AFFECTION,
  round: "ask",
  found: [],
  resumed: false,
};

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:meeting-resume:${meetingId}`;
}

/* ------------------------------------------------------------------ *
 * どこから 始めるか（純粋）
 * ------------------------------------------------------------------ */

/**
 * 保存されて いた ものと しおりから、始める ところを 決める。
 *
 * 規則は 5つ:
 * 1. 位置が 分からない・整数で ない なら はじめから
 * 2. 位置が **質問の 数に 届いて いれば** はじめから（＝完走ずみ。もう一度 話せる）
 * 3. 教材が 直されて 質問が 減った ときも、はみ出す 位置なら はじめから
 * 4. 1問目で まだ 何も 無い ときも はじめから（戻す ものが 無い）
 * 5. 開いた札・答え・ハートは **いまの 教材に ある 質問の ぶんだけ** 戻す
 *    （先生が 質問を 入れかえた あとに、消えた 質問の 札が 開いた ままにならない）
 *
 * しおり（`position.panel`）だけが 残って いる ときも 位置は 戻す——
 * 札と ハートは 空でも、6問目から 再開できる ほうが 学習者には ずっと よい。
 *
 * 完走ボーナス（`finished`）は 戻さない。途中から 始めるのだから、まだ 話しきって
 * いない——ここで true を 引き継ぐと、話しきる 前に ごほうびが 開く。
 */
export function startFrom(
  saved: MeetingResume | null,
  panel: number | undefined,
  questionIds: readonly string[],
): MeetingStart {
  /*
   * 内訳（保存された もの）を 先に 見る。しおりは 進捗ストアの もので、
   * 位置しか 持たない——両方 ある ときに しおりを 採ると、位置と 札が ずれる。
   */
  const candidate = saved?.index ?? panel;
  if (typeof candidate !== "number" || !Number.isInteger(candidate)) return FRESH_START;
  /*
   * **位置が 質問の 数に とどいて いる ＝「聞く ばん」に いる**（2026-08-21）。
   *
   * 前は そこを「完走ずみ → はじめから」に して いた。ラウンド2が できてから、
   * その 位置は「ヘンディさんに 聞く ばんに 進んだ」を 指す ように なった ので、
   * **はじめに 戻すと ラウンド2に 入った 人が 毎回 1問目へ 落ちる**。
   * 話しきったか どうかは 進捗ストアの `completed` が 持つ（あちらは 上書きされない）。
   */
  if (candidate < 0 || candidate > questionIds.length) return FRESH_START;

  /*
   * **通りすぎた しつもんの 札は 開いた ことに する**（2026-08-21 の 指摘
   *「途中から 始めたら 4つ目しか 開かれて いませんでした」）。
   *
   * 札を 開くのは これまで **言い直しを 求められずに 答えられた とき だけ**だった。
   * つまり 1回で 言えなかった しつもんは、答えて 先へ 進んだ あとも ？ の まま 残る。
   * 途中から 戻って きた 学習者の 目には、**やった はずの ところが 消えて いる**——
   * できなかった ことを 数える 板に なって いて、P8（罰を 見せない）に 反する。
   *
   * いま どこに いるかが N 問目なら、その 前の N 問は 聞かれて 答えて 通りすぎて いる。
   * だから 位置から 開く 札を 起こす。しおりしか 無い ときも 同じ（内訳が 無くても
   * 位置は 分かる）。
   */
  const passed = questionIds.slice(0, Math.min(candidate, questionIds.length));

  // しおりだけの ときは 位置と 通りすぎた 札を 戻す（答え・ハートは 内訳が 無いので 空）
  if (!saved) {
    return candidate === 0
      ? FRESH_START
      : { ...FRESH_START, index: candidate, openIds: passed, resumed: true };
  }
  const listening = saved.round === "listen" || candidate >= questionIds.length;

  const known = new Set(questionIds);
  const pick = <T>(source: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(source).filter(([id]) => known.has(id)));

  const savedOpen = saved.openIds.filter((id) => known.has(id));
  const answers = pick(saved.answers);
  const nothingYet = candidate === 0 && savedOpen.length === 0 && Object.keys(answers).length === 0;
  if (nothingYet) return FRESH_START;
  // 通りすぎた ぶん ∪ 保存されて いた ぶん（並びは しつもんの 順に そろえる）
  const open = new Set([...passed, ...savedOpen]);
  const openIds = questionIds.filter((id) => open.has(id));

  return {
    index: candidate,
    openIds,
    answers,
    affection: { perQuestion: pick(saved.affection.perQuestion), finished: false },
    round: listening ? "listen" : "ask",
    found: saved.found,
    resumed: true,
  };
}

/* ------------------------------------------------------------------ *
 * 読み書き
 * ------------------------------------------------------------------ */

export function readMeetingResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): MeetingResume | null {
  const raw = backend.get(keyOf(meetingId)) ?? "";
  if (raw === "") return null;
  try {
    const parsed = resumeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // 壊れた保存値は「まだ無い」として扱う（学習は続けられる）
    return null;
  }
}

export function saveMeetingResume(
  resume: MeetingResume,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(keyOf(resume.meetingId), JSON.stringify(resume));
}

/** 完走したとき・やり直すときに 消す。 */
export function clearMeetingResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(meetingId));
}

/**
 * 端末に 残って いる ものを 読んで、始める ところを 組み立てる。
 *
 * しおり（`content:<id>` の `position.panel`）は 進捗ストアが 持ち、内訳は
 * こちらが 持つ。2つの 保存先を 突き合わせる のは ここ 1か所だけにする。
 */
export function restoreMeeting(
  meetingId: string,
  questionIds: readonly string[],
  backend: ProgressBackend = defaultBackend(),
): MeetingStart {
  return startFrom(
    readMeetingResume(meetingId, backend),
    readContentProgress(meetingId, backend)?.position?.panel,
    questionIds,
  );
}
