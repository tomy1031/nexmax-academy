/**
 * 会話の きろく — 「きょう 話せた こと」を 手に残す（設計01 P13）
 *
 * 会話の練習は終わった瞬間に消える。何を言えたのか本人にも残らないので、
 * 次に来たときは毎回ゼロから始まる感じがする。**話した中身そのものを成果物にして**
 * 端末に残し、次に来たときに「まえの きろく」として読めるようにする。
 *
 * ## どこに置くか
 * 進捗ストア（src/lib/progress/store.ts）と同じ入れ物・同じ名前空間を使い、
 * 鍵だけ分ける。ストア本体に足さないのは、これが**先生が見る成績ではない**から
 * （P11 の二層でいう「学習者を励ますためだけ」の側）。DBには送らない。
 *
 * ## 文字列は保存しない側で作る
 * 質問文の短縮（`shortAsk`）と日付の整形は、画面ではなくここに置く。
 * 札のラベルと きろくの見出しで**同じ短縮**を使うため（2か所で別々に切ると、
 * 同じ質問が画面の場所によって違う名前になる）。
 */

import { z } from "zod";
import { defaultBackend, type ProgressBackend } from "@/lib/progress/store";

/** 進捗ストアと同じ名前空間（あちらの定数は非公開なので、鍵の形だけ合わせる）。 */
const NAMESPACE = "nexmax:v1";

const recordLineSchema = z.object({
  questionId: z.string(),
  /** 短縮ずみの質問（`shortAsk` を通したもの）。 */
  ask: z.string(),
  /** 学習者が言った／書いたことば。 */
  answer: z.string(),
});

const recordSchema = z.object({
  meetingId: z.string(),
  /** ISO8601。 */
  at: z.string(),
  lines: z.array(recordLineSchema),
  /** 好感度モードのときだけ入る。 */
  hearts: z.number().optional(),
  maxHearts: z.number().optional(),
});

export type MeetingRecordLine = z.infer<typeof recordLineSchema>;
export type MeetingRecord = z.infer<typeof recordSchema>;

function keyOf(meetingId: string): string {
  return `${NAMESPACE}:meeting-record:${meetingId}`;
}

/* ------------------------------------------------------------------ *
 * 文字列づくり（純粋）
 * ------------------------------------------------------------------ */

/** 文の切れ目。日本語の句点と、書き言葉に混ざる半角記号の両方を見る。 */
const SENTENCE = /[^。！？!?]+[。！？!?]?/gu;
/** 問いかけの文（「〜ますか。」「〜ですか？」）。 */
const ASKING = /か[。？?]?\s*$/u;

/**
 * 長い質問から、**聞かれていること1文**を機械的に取り出して短くする。
 *
 * 要約はしない（要約はAIが要るうえ、毎回ちがう言い方になって札の名前が安定しない）。
 * 規則は2つだけ: ①「〜か」で終わる文が あれば その最初の1つ ②無ければ 最後の文。
 * 「はじめまして。わたしは ヘンディです。お名前を おしえて ください。」なら
 * ②で「お名前を おしえて ください。」が残る——あいさつではなく問いが札に出る。
 */
export function shortAsk(ask: string, max = 18): string {
  const sentences = (ask.trim().match(SENTENCE) ?? []).map((s) => s.trim()).filter((s) => s !== "");
  const picked = sentences.find((s) => ASKING.test(s)) ?? sentences.at(-1) ?? ask.trim();
  const letters = [...picked];
  return letters.length <= max ? picked : `${letters.slice(0, max).join("")}…`;
}

/**
 * きろくの日付。
 * 数字だけで出す——「年・月・日」を足すと、読み辞書の無い漢字が学習者の画面に出る（規律2）。
 */
export function formatRecordDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}/${pad(at.getMonth() + 1)}/${pad(at.getDate())}`;
}

/* ------------------------------------------------------------------ *
 * 読み書き
 * ------------------------------------------------------------------ */

/**
 * 端末の保存値は「外の入れ物」なので、React からは購読して読む。
 * 同じ中身なら同じ参照を返さないと、購読が回り続ける（call-shell の readProfile と同じ流儀）。
 */
const cache = new Map<string, { raw: string; value: MeetingRecord | null }>();
const listeners = new Set<() => void>();

export function subscribeMeetingRecord(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readMeetingRecord(
  meetingId: string,
  backend: ProgressBackend = defaultBackend(),
): MeetingRecord | null {
  const raw = backend.get(keyOf(meetingId)) ?? "";
  const hit = cache.get(meetingId);
  if (hit && hit.raw === raw) return hit.value;
  const value = parse(raw);
  cache.set(meetingId, { raw, value });
  return value;
}

/** サーバでは端末の保存値が読めない。無い前提で描いて、画面が出てから差し替える。 */
export function readMeetingRecordOnServer(): MeetingRecord | null {
  return null;
}

function parse(raw: string): MeetingRecord | null {
  if (raw === "") return null;
  try {
    const parsed = recordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // 壊れた保存値は「まだ無い」として扱う（学習は続けられる）
    return null;
  }
}

/** 最新の1回だけ残す。何度も来る教材なので、増やし続けると端末を圧迫する。 */
export function saveMeetingRecord(
  record: MeetingRecord,
  backend: ProgressBackend = defaultBackend(),
): void {
  backend.set(keyOf(record.meetingId), JSON.stringify(record));
  cache.delete(record.meetingId);
  for (const listener of listeners) listener();
}
