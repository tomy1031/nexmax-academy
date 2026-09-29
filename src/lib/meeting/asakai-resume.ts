/**
 * 朝礼・夕礼の しおり — 5日を 1回の 授業で 終わらせない ための 保存
 *
 * ## なぜ ミーティングの しおりに 相乗りしないか
 * `resume.ts` の しおりは **しつもんの 番号・開いた札・答えた ことば・ハート**で
 * できて いる。こちらは **曜日**と **その日の けっか**で できて いて、
 * 同じ 欄が 1つも 無い。同じ 器に 押し込むと、片方を 直すたびに もう片方が
 * 黙って 動く（`AsakaiSession` を `MeetingSession` と 分けたのと 同じ 理由）。
 *
 * ## 戻す 単位は **日**（場面の 途中には 戻さない）
 * 設計 #366 の 1.3 は「途中で 閉じても だまって つづきから 始まる ので、
 * 授業 2回に 分けられます」。分ける 切れ目は **日**なので、水曜の 報告の
 * 途中で 閉じた 人は **水曜の はじめ**から 話し直す。
 *
 * 場面の 途中（開きかけの カード・チャットの 記録・聞き返しの 回数）まで 戻すと、
 * 保存する ものが 一気に 増えるうえ、**話の 途中から 再開する**ことに なる——
 * 相手が 何を 聞いた ところだったかを 学習者が 覚えて いない ので、
 * かえって 分からなく なる。1日は 4枚 ぶんの 短い やりとりで、話し直せる。
 *
 * ## 曜日は 数えない。**終わった日の けっか**が 正
 * `sceneAt` を 別に 持つと、`done` と ずれた ときに どちらが 正なのかが
 * データから 読めなく なる。終わった日の 数が そのまま 次の 曜日に なる。
 *
 * ## 5日 終わったら 消す
 * 話しきった 人が もう一度 開いたら **はじめから 話せる**のが 正しい
 *（`resume.ts` と 同じ 流儀）。完走の 記録は 進捗ストアの `completed` が 持つ。
 */

import { z } from "zod";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

/**
 * 1日の けっか。**合否に 数える もの**と、週の 表に 出す ものを 分けて 持つ。
 *
 * `units` の 意味は レベルで ちがう——かんたんは 開いた カードの 数、
 * むずかしいは 言えた 行の 数（`asakai.pass.units` と 同じ ものさし）。
 * ここで 数えて おかないと、週の おわりに 数え直せない
 *（そのころには その日の カードの 状態は もう 画面に 無い）。
 */
const dayResultSchema = z.object({
  day: z.string(),
  kind: z.enum(["asa", "yuu"]),
  cards: z.number().int().min(0),
  cardTotal: z.number().int().min(0),
  units: z.number().int().min(0),
  unitTotal: z.number().int().min(0),
  komariOpen: z.boolean().default(false),
  komariBoxes: z.number().int().min(0).default(0),
  komariTotal: z.number().int().min(0).default(0),
  probes: z.number().int().min(0).default(0),
  chips: z.array(z.object({ label: z.string(), open: z.boolean() })).default([]),
});

export type DayResult = z.infer<typeof dayResultSchema>;

/**
 * **1回で ぜんぶ 言えた 日**（★・2026-09-29 の 指定「最終的には 各曜日 一度で
 * 伝えられるように なると いい」）。合格の 条件では なく、その 上の 目標。
 *
 * 欄は 足さず、いま ある 数から 決める——聞き返しが 0回で 終わった 日は、
 * さいしょの 1本で 札が ぜんぶ ⭕ に なった 日だけ（打ち切りは 聞き返しの あとにしか
 * 起きない）。だから 前から 残って いる しおりにも そのまま ★が 付く。
 */
export function isOneShotDay(row: DayResult): boolean {
  return row.probes === 0 && row.cardTotal > 0 && row.cards === row.cardTotal;
}

/**
 * 同じ 曜日を 話し直した とき、**どちらの けっかを 残すか**（2026-09-29 の R5 検収）。
 *
 * ★は 合格の 上の 目標なので、★を ねらった 話し直しで **合格が 消えては いけない**
 *（問題の 札を 1回 言いそびれるだけで「合格」が「不合格」に 変わって いた）。
 * 合格に 数える 数が 1つでも 下がったら 前の けっかを 残す。★が 付いた ときは
 * いつも 新しい ほう（どの 数も 満点）。1つの 記録を 2回ぶんから つぎはぎには しない。
 */
export function keptDayResult(prev: DayResult | undefined, next: DayResult): DayResult {
  if (!prev || isOneShotDay(next)) return next;
  const lower =
    next.units < prev.units ||
    next.komariBoxes < prev.komariBoxes ||
    (prev.komariOpen && !next.komariOpen);
  return lower ? prev : next;
}

/**
 * **報告の 途中**（その日の 板・聞き返しの 回数・チャット）。
 *
 * 2026-09-17 の 指定「回答結果が リセットされて しまう。曜日を 切り替えた 場合や
 * 画面を 切り替えた 場合。ストレージ保管して 再現できるように」。
 *
 * ここまでは **終わった 日**しか 残して いなかった（「戻す 単位は 日」）ので、
 * 火曜を 話しかけた まま 月曜の タブを 見に 行くと、戻った ときには 板が 空に なって いた。
 * 授業では「前の 日を もう一度 見る」が ふつうに 起きる。
 *
 * **日ごとに 1つ**持つ。1つだけ 持つ 形に すると、済んだ 日を 見に 行った だけで
 * 途中の 日が 消える。チャットも そのまま 残す——板だけ 戻して 会話が 空だと、
 * 相手が 何を 聞いた ところだったかが 画面から 読めない。
 */
const chatLineSchema = z.object({
  who: z.string().default(""),
  speakerId: z.string().default(""),
  text: z.string(),
  self: z.boolean().optional(),
  audio: z.string().optional(),
});

const panelStateSchema = z.object({
  id: z.string(),
  said: z.array(z.string()).default([]),
  open: z.boolean().default(false),
  full: z.boolean().default(false),
  gaveUp: z.boolean().default(false),
});

/**
 * その日 送った ことば 1本（きょうの 評価の「あなたの 回答」に 並ぶ）。
 *
 * **控えに 入れる**（2026-09-18 の 通しプレイ検収）。持って いなかった ころ、
 * 開き直した 直後は 空に 戻り、**❌ の 札が 押せなく なって いた**
 *（押せるかは「1本 送ったか」で 決めて いる）——打ち切られた すぐ あとに
 * やり直したい 人が、そこだけ 行き止まりに なる。ふりかえりの 中身も 消えて いた。
 */
const sayLogSchema = z.object({
  question: z.string().default(""),
  answer: z.string().default(""),
  heard: z.boolean().default(false),
  opened: z.number().int().min(0).optional(),
  /** この 1本で 進んだ 札の id（「あなたの 答え」を 項目ごとに 引くため）。 */
  panels: z.array(z.string()).optional(),
});

const asakaiDraftSchema = z.object({
  states: z.array(panelStateSchema).default([]),
  attempts: z.record(z.string(), z.number().int().min(0)).default({}),
  probes: z.number().int().min(0).default(0),
  askedId: z.string().nullable().default(null),
  /**
   * 司会の 聞き返しの 字（2026-09-28 の 検収）。無いと、開き直した あとの こたえが
   * AIに「報告 まるごと」と して 見られ、聞き返しの ポップアップも 出ない。
   */
  askedText: z.string().default(""),
  lines: z.array(chatLineSchema).default([]),
  log: z.array(sayLogSchema).default([]),
});

export type AsakaiDraft = z.infer<typeof asakaiDraftSchema>;
/** 書く ときの 形（`.default()` の 欄は 省いて よい。読む ときに 埋まる）。 */
export type AsakaiDraftInput = z.input<typeof asakaiDraftSchema>;

/**
 * 端末に 残す かたち。
 *
 * 欄を 足す ときは **かならず `.default()` を 付ける**——付けないと
 * 古い しおりが まるごと 落ちて、**全員が 月曜に 戻る**（fable の 罠7）。
 */
const asakaiResumeSchema = z.object({
  meetingId: z.string(),
  done: z.array(dayResultSchema).default([]),
  /** 話しかけて いる 日（曜日の id → 途中）。終わった 日は `done` が 持つ。 */
  drafts: z.record(z.string(), asakaiDraftSchema).default({}),
  /**
   * **5日 そろったが、週の けっかを まだ 閉じて いない**（2026-09-28 の 点検 B4）。
   *
   * 前は 5日 そろった しおりを「完走ずみ」と して 月曜から 始めて いたので、
   * 金曜の 評価を 読んで いる 最中に 更新・退室すると **5日ぶんが 消え、
   * 完了も 付かなかった**。この 印が ある ときは 週の けっかから 始める。
   */
  weekPending: z.boolean().default(false),
});

export type AsakaiResume = z.infer<typeof asakaiResumeSchema>;

/** 画面が これから 始める ところ。 */
export interface AsakaiStart {
  /** 何日目から 始めるか（0始まり）。 */
  readonly sceneAt: number;
  /** 終わった日の けっか（週の 表に そのまま 出る）。 */
  readonly results: readonly DayResult[];
  /** 途中から 戻ったか（画面の 組み立てに 使う。**学習者には 出さない**）。 */
  readonly resumed: boolean;
  /** 5日 そろって、週の けっかを まだ 閉じて いない（週の けっかから 始める）。 */
  readonly weekPending?: boolean;
}

export const FRESH_ASAKAI: AsakaiStart = { sceneAt: 0, results: [], resumed: false };

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:asakai-resume:${meetingId}`;
}

/* ------------------------------------------------------------------ *
 * どこから 始めるか（純粋）
 * ------------------------------------------------------------------ */

/**
 * 保存されて いた ものから、始める ところを 決める。
 *
 * 規則は 4つ:
 * 1. 保存が 無い・空なら 月曜から
 * 2. 5日 そろって **週の けっかを まだ 閉じて いない**なら、週の けっかから（2026-09-28）
 * 3. 終わった日が 場面の 数に とどいて いれば 月曜から（＝完走ずみ。何度でも 話せる）
 * 4. 教材が 直されて 場面が 減った ときも、はみ出す なら 月曜から
 */
export function startAsakaiFrom(
  /* 見るのは `done` と 週の けっか待ち だけ（途中は 日ごとに 別で 読む）。 */
  saved: (Pick<AsakaiResume, "done"> & { readonly weekPending?: boolean }) | null,
  sceneCount: number,
): AsakaiStart {
  const done = saved?.done ?? [];
  if (done.length === 0) return FRESH_ASAKAI;
  if (done.length === sceneCount && saved?.weekPending === true) {
    return { sceneAt: sceneCount - 1, results: done, resumed: true, weekPending: true };
  }
  if (done.length >= sceneCount) return FRESH_ASAKAI;
  return { sceneAt: done.length, results: done, resumed: true };
}

/* ------------------------------------------------------------------ *
 * 読み書き
 * ------------------------------------------------------------------ */

export function readAsakaiResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): AsakaiResume | null {
  const raw = backend.get(keyOf(meetingId)) ?? "";
  if (raw === "") return null;
  try {
    const parsed = asakaiResumeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // 壊れた保存値は「まだ無い」として扱う（学習は続けられる）
    return null;
  }
}

export function saveAsakaiResume(
  meetingId: string,
  done: readonly DayResult[],
  backend: ProgressBackend = defaultBackend(),
  /** 場面の 数。渡すと、5日 そろった ときに「週の けっか待ち」の 印を 立てる。 */
  sceneCount?: number,
): void {
  /* **途中（`drafts`）と 印を 巻き込んで 消さない**——読んでから 書く。 */
  const saved = readAsakaiResume(meetingId, backend);
  const weekPending =
    sceneCount !== undefined ? done.length >= sceneCount : (saved?.weekPending ?? false);
  backend.set(
    keyOf(meetingId),
    JSON.stringify({ meetingId, done, drafts: saved?.drafts ?? {}, weekPending }),
  );
}

/** その日の 途中を 読む（無ければ null）。 */
export function readAsakaiDraft(
  meetingId: string,
  day: string,
  backend: ProgressBackend = defaultBackend(),
): AsakaiDraft | null {
  return readAsakaiResume(meetingId, backend)?.drafts?.[day] ?? null;
}

/** その日の 途中を 残す（話すたび・板が 動くたび）。 */
export function saveAsakaiDraft(
  meetingId: string,
  day: string,
  draft: AsakaiDraftInput,
  backend: ProgressBackend = defaultBackend(),
): void {
  const saved = readAsakaiResume(meetingId, backend);
  const drafts = { ...(saved?.drafts ?? {}), [day]: draft };
  backend.set(
    keyOf(meetingId),
    JSON.stringify({
      meetingId,
      done: saved?.done ?? [],
      drafts,
      weekPending: saved?.weekPending ?? false,
    }),
  );
}

/** その日が 終わったら 途中を 捨てる（けっかは `done` に 移る）。 */
export function clearAsakaiDraft(
  meetingId: string,
  day: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  const saved = readAsakaiResume(meetingId, backend);
  if (!saved) return;
  const drafts = { ...saved.drafts };
  if (!(day in drafts)) return;
  delete drafts[day];
  backend.set(
    keyOf(meetingId),
    JSON.stringify({ meetingId, done: saved.done, drafts, weekPending: saved.weekPending }),
  );
}

/** 完走したとき・やり直すときに 消す。 */
export function clearAsakaiResume(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.remove(keyOf(meetingId));
}

/** 端末に 残って いる ものを 読んで、始める ところを 組み立てる。 */
export function restoreAsakai(
  meetingId: string,
  sceneCount: number,
  backend: ProgressBackend = defaultBackend(),
): AsakaiStart {
  return startAsakaiFrom(readAsakaiResume(meetingId, backend), sceneCount);
}

/* ------------------------------------------------------------------ *
 * 保存した 会話を **今の 教材**に 合わせ直す
 * ------------------------------------------------------------------ */

/**
 * 音の 置き場所から **どの 行か**を 取り出す（`<教材ID>/<行の 鍵>`）。
 *
 * 音の ファイル名は `<行の 鍵>-<文の 指紋 8桁>.wav`（`scripts/make_meeting_audio.ts`）。
 * 文や 読みを 直すと 指紋だけが 変わり、**行の 鍵は 変わらない**——だから 鍵で 引けば、
 * 古い 音の 場所からでも 今の 行に たどり着ける。指紋の 無い 名前は 引かない（null）。
 */
export function voicedSlotOf(audio: string | undefined): string | null {
  const hit = audio?.match(/\/audio\/meetings\/([^/]+)\/(.+)-[0-9a-f]{8}\.wav$/u);
  return hit ? `${hit[1]}/${hit[2]}` : null;
}

interface VoicedLine {
  readonly speakerId: string;
  readonly text: string;
  readonly audio: string;
}

/**
 * 場面の 中の **音の ある 行**を ぜんぶ、行の 鍵で 引ける ように する。
 *
 * 渡すのは **開く 日の 場面 1つ**（5日ぶん まとめて 渡さない）。しおりは 日ごとなので、
 * ほかの 日の 行に 差し替わる 道を はじめから 作らない。
 */
export function voicedLinesBySlot(root: unknown): Map<string, VoicedLine> {
  const found = new Map<string, VoicedLine>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    const line = value as { speakerId?: unknown; text?: unknown; audio?: unknown };
    if (typeof line.text === "string" && typeof line.audio === "string") {
      const slot = voicedSlotOf(line.audio);
      if (slot) {
        found.set(slot, {
          speakerId: typeof line.speakerId === "string" ? line.speakerId : "",
          text: line.text,
          audio: line.audio,
        });
      }
    }
    Object.values(value).forEach(walk);
  };
  walk(root);
  return found;
}

/**
 * 保存して おいた 会話の 行を、**今の 教材の 文と 音**に 差し替える。
 *
 * ## なぜ 要るか（2026-09-29 に 実発生）
 * 途中の しおり（`drafts`）は チャットの 行を **保存した ときの 形の まま**持つ。
 * 行には 音の 場所も 入って いる ので、開き直して 鳴らし直すと **保存した 日の 音**が 鳴る。
 * `ABA` を「アバ」と 読んで いた 音を 作り直した あとも、直す 前に 話しかけて いた 人には
 * 古い「アバペイ」が 鳴りつづけた（古い ファイルも 配信に 残って いる）。
 * 文も 同じで、司会の セリフを 書き直しても 保存した 人には 前の 文が 出る。
 *
 * ## 差し替える 条件は **行の 鍵と 話し手の 両方**が 合う こと
 * 行の 鍵は **並びの 番号**で できて いる（`s0-member-1` など）。メンバーの 順番を
 * 入れ替えると（2026-09-13 に 実際に あった）、同じ 鍵が **別の 人の 行**に なる。
 * 鍵だけで 差し替えると、奥田さんの 行に ニャムさんの 文と 声が 入る。
 *
 * ## 合う 行が 無い ときは **古い 声を 鳴らさない**
 * この 教材の 鍵なのに 今の 場面に 合う 行が 無いのは、文を 直して 音を 外した
 * （作り直し待ち）か、並びが 変わった とき。どちらも 古い 声は もう 正しくない——
 * 残すと、外すよう 言われた セリフが 声で 流れつづける。字は 残す（会話の 流れを 崩さない）。
 *
 * 学習者の 発話と、名前を 埋めた 行（`◯◯さん`。音を 持たない）には 触らない。
 */
export function refreshSavedLines<T extends { speakerId: string; text: string; audio?: string }>(
  lines: readonly T[],
  current: ReadonlyMap<string, VoicedLine>,
  meetingId: string,
): T[] {
  return lines.map((line) => {
    const slot = voicedSlotOf(line.audio);
    if (!slot) return line;
    const now = current.get(slot);
    if (now && now.speakerId === line.speakerId) {
      return { ...line, text: now.text, audio: now.audio };
    }
    if (!slot.startsWith(`${meetingId}/`)) return line;
    const silent = { ...line };
    delete silent.audio;
    return silent;
  });
}
