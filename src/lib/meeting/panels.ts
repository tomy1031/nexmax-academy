/**
 * 報告の パネル — 「言えた ぶんだけ 開く」の 数え方
 *
 * ## なぜ アプリが 数えるのか
 * AIに「この パネルを 開いて よいか」を 聞くと、同じ 答えでも 日に よって
 * 開いたり 開かなかったり する。難しさが 相手の さじ加減で 変わる。
 * だから **AIが 見るのは「どの 行を 言えたか」だけ**にして、
 * 何行で 開くかは ここで 数える（設計 #366 の 6.1）。
 *
 * ## 3つの 数
 * - `said`   … 言えた 行（積み上がる。1回の 発話で 複数 増える）
 * - `openAt` … いくつ 言えたら パネルが 開くか（既定 1）
 * - `fullAt` … いくつ 言えたら ⭕ か（既定 行の 数）
 *
 * かんたん（朝礼）は 1パネル＝1行なので openAt も fullAt も 1。
 * むずかしい（夕礼）の「きょう」「あした」は 3行の うち 2つで 開く。
 * 「こまりごと」は 3つの 箱（何が／いつまでに／お願い）で、
 * 1つで 開き、3つ そろって ⭕。
 *
 * ## 記録を そのまま 読んだ ぶんは 数えない（夕礼）
 * 夕礼の 材料は **時間順の 作業記録**なので、全行を そのまま 読み上げると
 * 教材が 探す ことばに ぜんぶ 当たる。ことばの 照合を いくら 締めても 塞がらない
 *（記録は 正しい ことばで 書かれて いる）。見わけが つくのは
 * **記録の 本文が そのまま 残って いる** ことだけ——`readsLog` が そこを 見る。
 *
 * ## 進みぐあいは ことばで 数えない
 * 進みぐあいの 札だけは キーワードでは なく **形**で 見る（`saysProgress`）。
 * 教材ごとに 言い方を 書き並べると、書き忘れた 形（「はんぶん」「75パーセント」）で
 * 開かなく なる。ただし **数なら 何でも よい ことに しない**——作業記録の 時刻
 *（`09:00`）や 教材の 固有名詞（「上位6スキル」「検索結果0件」）で 開いて いた。
 */

import type { MatchableFact } from "@/components/listening/req-matcher";
import { resolveFacts } from "@/components/listening/req-matcher";
import { normalizeReading } from "@/lib/text/normalize";

/** パネルの 中の 1行。`box` が あると 画面に 箱の 名前が 出る。 */
export interface PanelFact extends MatchableFact {
  /** 箱の 名前（「何が」「いつまでに」「お願い」）。無ければ 箱を 見せない。 */
  readonly box?: string;
}

export interface ReportPanel {
  readonly id: string;
  /** 画面に 出る 札。ページの ことばと 同じに する（規律10・R9-4）。 */
  readonly label: string;
  readonly facts: readonly PanelFact[];
  /** 開くのに 要る 行の 数（既定 1）。 */
  readonly openAt?: number;
  /** ⭕ に なる 行の 数（既定 `facts.length`）。 */
  readonly fullAt?: number;
  /**
   * ことばでは なく **形**で 見る。いまの 使い道は 進みぐあいの 札だけで、
   * 見るのは `saysProgress`（割合の ことば、または「進捗」＋数）。
   */
  readonly rule?: "number";
}

export interface PanelState {
  readonly id: string;
  /** 言えた 行の id。 */
  readonly said: readonly string[];
  readonly open: boolean;
  readonly full: boolean;
  /**
   * 司会が れいを 見せて 先へ 進めた 印。
   *
   * 開いて いないが、もう 聞き返さない。合否には 数えない
   *（開いた ことに して しまうと、言えて いない のに 合格する）。
   */
  readonly gaveUp: boolean;
}

/**
 * 数字が 1つ 以上 あるか。
 *
 * 見るのは ①算用数字 ②漢数字＋数え方 ③割合の ことば（半分・半日）
 * ④和語の 数（ひとつ〜いつつ）。教材ごとに 書き並べない。
 */
const ARABIC = /\d/u;
const KANJI_NUMBER = /[一二三四五六七八九十百千][こつ個件人分秒時回台枚日名円％%]/u;
const HALF = /(半分|半日|はんぶん|はんにち)/u;
const WAGO = /(ひとつ|ふたつ|みっつ|よっつ|いつつ|むっつ|ななつ|やっつ|ここのつ)/u;
/**
 * 数に 見えるが 数では ない ことば。
 *
 * 「十分（じゅうぶん）」は **足りて いる**の 意味で、数え方では ない。
 * これを 数字と 数えて いた ころ、「まだ 十分 できて いません」で
 * 数字の カードが 開いて いた（かんたんでは 20枚中 1枚の 得点）。
 */
const NOT_A_COUNT = /(十分|充分|十分に)/u;
/**
 * **時刻は 数では ない。**
 *
 * 夕礼の 作業記録は 行頭が 時刻（`09:00`）なので、記録を そのまま 読み上げると
 * **1日目の 1行目で 進捗率の カードが 開いて いた**——5日 とも、ひとことも
 * パーセントを 言わない まま（2026-09-14 の 実測）。「十分（じゅうぶん）」と 同じで、
 * 数に 見えるが 数えて いない。
 *
 * `3時間` の ような **長さ**は 数の まま 残す（`時` の あとに `間` が 来ない ものだけ 落とす）。
 */
const CLOCK = /(\d{1,2}:\d{2})|(\d{1,2}時(?!間)(\d{1,2}分|半)?)/gu;

export function hasNumber(utterance: string): boolean {
  const text = normalizeReading(utterance).replace(NOT_A_COUNT, "").replace(CLOCK, "");
  return ARABIC.test(text) || KANJI_NUMBER.test(text) || HALF.test(text) || WAGO.test(text);
}

/** 割合の 言い方（`％` は NFKC で `%` に、`パーセント` は かなに 寄る）。 */
const PERCENT = /(%|ぱーせんと)/u;
/** 「進捗」と 言って いるか（数と 組んだ ときだけ 見る）。 */
const PROGRESS_WORD = /(進捗|しんちょく)/u;

/**
 * **進みぐあいを 数で 言えたか**（`rule: "number"` の パネルが 見る もの）。
 *
 * 「数字が 1つ でも あるか」で 見て いた ころ、この 教材の ふつうの 報告が
 * そのまま 当たって いた——「上位6スキルまで 表示できるように しました」
 *「検索結果0件の 場合の 表示を 追加しました」「AUPP学生10名の…」。
 * **パーセントを ひとことも 言わずに ⭕** に なるので、火曜・水曜は
 * 進捗を 言う 練習が まるごと 飛ばせて いた（2026-09-14 の 通し検収）。
 * 時刻（`09:00`）で 開いて いたのと 同じ 穴が、教材の 固有名詞に 残って いた。
 *
 * 見るのは 2つ。教材が どちらも 教えて いる 形:
 * - 割合の ことば（`75%`・`75％`・`75パーセント`）
 * - 「進捗」と いう ことば ＋ 数（「今の 進捗は 45 です」）
 *
 * カードの やること は 5日 とも「進捗（%）」、聞き返しも お手本も
 *「◯◯%です」の 形なので、**学習者は 型を 渡されて いる**。
 */
export function saysProgress(utterance: string): boolean {
  const text = normalizeReading(utterance);
  if (PERCENT.test(text)) return true;
  return PROGRESS_WORD.test(text) && hasNumber(utterance);
}

/* ------------------------------------------------------------------ *
 * 作業記録を そのまま 読んで いないか（夕礼）
 * ------------------------------------------------------------------ */

/**
 * 「そのまま 読んで いる」と 見なす 行頭（時刻）の 数。
 *
 * 1つや 2つなら、時刻を 添えて 報告して いる だけかも しれない
 *（「17時に 修正が 終わりました」）。**3つ 並べた ら 記録の 読み上げ**。
 */
export const LOG_READ_HEADS = 3;

/**
 * 「そのまま 読んで いる」と 見なす **行の 本文**の 数。
 *
 * まとめた 報告にも 記録の ことばは 1つ 2つ 混ざる（「スキルグラフを 作りました」）。
 * **4行 まるごと そのまま 並ぶ**のは、まとめた 文では 起こらない。
 *
 * 5行から 下げた（2026-09-14 の 通し検収）——**時刻を 外して 4行 貼るだけで 満点**に
 * なって いた。ひとことも まとめて いない。
 */
export const LOG_READ_LINES = 4;

/** 時刻と 組んで 見る ときの 本文の 数（時刻だけでは 決めない・下の `readsLog`）。 */
export const LOG_READ_PAIR = 2;

/** 短すぎる 行は 数えない（「昼休み」は まとめた 文にも 入りうる）。 */
const LOG_LINE_MIN = 8;

/** 作業記録の 1行（行頭の 時刻と 本文）。 */
export interface LogLine {
  readonly head: string;
  readonly text: string;
}

/**
 * 行頭の 時刻を、声でも 見つかる 形に ひらく。
 *
 * **声が 本線**なので（`asakai-session.tsx` の 覚え書き）、書き起こしは
 * `09:00` を「9時」「9時ちょうど」、`09:30` を「9時30分」「9時半」と 書く。
 * 字の 形だけで 探すと、**声で 記録を 読み上げた 人だけ 素通り**する。
 */
function headForms(head: string): string[] {
  const match = /^(\d{1,2}):(\d{2})$/u.exec(normalizeReading(head));
  if (!match) return [];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const forms = [`${match[1]}:${match[2]}`, `${hour}:${match[2]}`];
  if (minute === 0) forms.push(`${hour}時`);
  else if (minute === 30) forms.push(`${hour}時30分`, `${hour}時半`);
  else forms.push(`${hour}時${minute}分`);
  return forms.map(normalizeReading);
}

/** 発話の 中に ある 行頭（時刻）の 数。同じ 時刻は 1つに 数える。 */
export function countLogHeads(utterance: string, lines: readonly LogLine[]): number {
  const haystack = normalizeReading(utterance);
  if (!haystack) return 0;
  const seen = new Set<string>();
  for (const line of lines) {
    /* 時刻の 形（`09:00`）だけを 見る。「あした」「来週の 月曜日」は 数えない */
    const forms = headForms(line.head);
    if (forms.length === 0) continue;
    if (forms.some((form) => haystack.includes(form))) seen.add(forms[0] ?? line.head);
  }
  return seen.size;
}

/** 発話の 中に **そのまま** 入って いる 記録の 行（本文）の 数。 */
export function countLogLines(utterance: string, lines: readonly LogLine[]): number {
  const haystack = normalizeReading(utterance);
  if (!haystack) return 0;
  const seen = new Set<string>();
  for (const line of lines) {
    const needle = normalizeReading(line.text);
    if (needle.length < LOG_LINE_MIN) continue;
    if (haystack.includes(needle)) seen.add(needle);
  }
  return seen.size;
}

/**
 * 作業記録を そのまま 読み上げて いるか。
 *
 * 夕礼が 学習者に 求めて いるのは **えらぶ・まとめる**で、教材の あたまにも
 *「作業記録を そのまま 読み上げません」と 書いて ある（`focus`）。
 * ところが 記録の 行には 教材が 探す ことばが ぜんぶ 入って いる ので、
 * **1文字も 変えずに 全行 読み上げるだけで 5日 とも 合格**して いた
 *（2026-09-14 の 実測: 21こ中 16こ・合格ラインは 11）。
 *
 * ことばの 照合を いくら 締めても ここは 塞がらない——記録は **正しい ことばで
 * 書かれて いる**から。見わけが つくのは **記録の 本文が そのまま 残って いる**
 * ことだけ なので、そこを 見る:
 *
 * - 行の 本文を 4行 以上 そのまま 並べて いる
 * - 行頭の 時刻を 3つ 以上 並べ、**かつ** 本文も 2行 そのまま 並べて いる
 *
 * ## 時刻だけでは 決めない（2026-09-14 の 検収）
 * 行頭は 09:00〜17:30 の 丸い 時刻なので、**まとめた 報告**にも ふつうに 入る——
 *「09:00から 12:00まで 実装、13:00から 17:00まで テストを しました」は
 * 時刻が 4つ 当たる。これを 読み上げと 見なすと、**いちばん よく まとめた 報告が
 * 差し戻される**。取りこぼしは 誤って 開く ことより 重い（設計01 P8）ので、
 * 時刻は **本文の 写しが ある ときの 上乗せ**に とどめる。
 *
 * 鍵が 無くても 同じに 動く（AIの 見立ては ここに 重ねるだけ）。
 */
export function readsLog(utterance: string, lines: readonly LogLine[]): boolean {
  const copied = countLogLines(utterance, lines);
  if (copied >= LOG_READ_LINES) return true;
  return countLogHeads(utterance, lines) >= LOG_READ_HEADS && copied >= LOG_READ_PAIR;
}

/**
 * **AIの 見立てを 効かせて よいか**（写しの あとが 残って いるか）。
 *
 * AIが 返す `readsLog` は 引き算（発話 1本を 丸ごと 0に する）なので、
 * **言い分の 無い ところでは 効かせない**。ここが 無かった ころ、
 * 記録を 持たない 朝礼でも AIの 一言だけで 発話が 消せた
 *（発話の 中に 囲いを 書いて 閉じるだけで 作れた）。
 *
 * 本文の 写しが 2行 以上 ある ときだけ、AIは「まとめて いない」と 言える。
 */
export function couldBeLog(utterance: string, lines: readonly LogLine[]): boolean {
  return countLogLines(utterance, lines) >= LOG_READ_PAIR;
}

const openAtOf = (panel: ReportPanel) => panel.openAt ?? 1;
const fullAtOf = (panel: ReportPanel) => panel.fullAt ?? Math.max(1, panel.facts.length);

/** 空の 状態（場面の はじまり）。 */
export function initialPanelStates(panels: readonly ReportPanel[]): PanelState[] {
  return panels.map((panel) => ({
    id: panel.id,
    said: [],
    open: false,
    full: false,
    gaveUp: false,
  }));
}

export interface PanelStep {
  /** 更新後の 状態。 */
  readonly states: readonly PanelState[];
  /** この 発話で **新しく 言えた** 行（画面の めくる 演出に 使う）。 */
  readonly newFacts: readonly string[];
  /** この 発話で **新しく 開いた** パネル。 */
  readonly opened: readonly string[];
  /** この 発話で **⭕ に なった** パネル。 */
  readonly completed: readonly string[];
  /**
   * 作業記録を そのまま 読み上げて いた（夕礼）。**この とき 状態は 動かない**。
   *
   * 罰では なく **言い直し**。画面は 司会に「まとめて ください」と 言わせ、
   * 聞き返しは そのまま 数える ので、2回 つづけば お手本が 出て 先へ 進む
   *（0点で 終わらせない 仕組みは そのまま 効く）。
   */
  readonly readLog: boolean;
}

/**
 * 1回の 発話を 当てて、状態を 進める。
 *
 * 純関数に して あるので、鍵が 無い 環境でも 単体テストで 守れる。
 * `aiSaidIds` は AIが 返した 行の id（無ければ 空でよい＝ことばだけで 動く）。
 */
export function applyUtterance({
  utterance,
  panels,
  states,
  aiSaidIds = [],
  logLines = [],
  aiReadsLog = false,
}: {
  utterance: string;
  panels: readonly ReportPanel[];
  states: readonly PanelState[];
  aiSaidIds?: readonly string[];
  /** 作業記録の 行。空なら 丸読みは 見ない（朝礼は 記録を 持たない）。 */
  logLines?: readonly LogLine[];
  /**
   * AIも「記録の 読み上げ」と 見た（鍵が あれば 届く。無ければ false）。
   *
   * **単独では 効かない**——`couldBeLog`（本文の 写しが 2行 以上）と 組んだ ときだけ。
   * AIの この 印は 引き算なので、言い分の 無い ところで 効かせると
   * **正しく まとめた 報告が AIの 見誤りだけで 消える**（設計01 P8 に 逆行）。
   */
  aiReadsLog?: boolean;
}): PanelStep {
  const byId = new Map(states.map((s) => [s.id, s]));

  /*
   * **記録を そのまま 読んだ ぶんは 数えない**（2026-09-14）。
   *
   * ことばの 照合は 記録の 行に ぜんぶ 当たる——記録は 正しい ことばで
   * 書かれて いるから。ここで 止めないと、**1文字も 変えずに 読み上げるだけで
   * 合格**する（21こ中 16こ・合格ラインは 11）。教材の あたまが
   *「作業記録を そのまま 読み上げません」と 書いて いる ことを、判定が
   * 一度も 見て いなかった。
   */
  if (readsLog(utterance, logLines) || (aiReadsLog && couldBeLog(utterance, logLines))) {
    return { states, newFacts: [], opened: [], completed: [], readLog: true };
  }
  const newFacts: string[] = [];
  const opened: string[] = [];
  const completed: string[] = [];

  const next = panels.map((panel) => {
    const prev = byId.get(panel.id) ?? {
      id: panel.id,
      said: [],
      open: false,
      full: false,
      gaveUp: false,
    };

    /*
     * **れいを 見せて 先へ 進めた パネルは、もう 動かさない**（2026-09-11）。
     *
     * 前は `gaveUp` でも 照合を つづけて いた ので、司会の れいを そのまま
     * 書き写すと `open` だけ true に なり、**板は ❌ なのに 合否は ⭕** に なった。
     * 言えなかった ことを 言えた ことに しない（規律1）。
     */
    if (prev.gaveUp) return prev;

    // 形で 見る パネル（数字）は 行を 持たない
    if (panel.rule === "number") {
      if (prev.open || !saysProgress(utterance)) return prev;
      opened.push(panel.id);
      completed.push(panel.id);
      return { ...prev, open: true, full: true };
    }

    const saidSet = new Set(prev.said);
    const hit = resolveFacts({ utterance, facts: panel.facts, saidIds: saidSet, aiSaidIds });
    if (hit.length === 0) return prev;

    newFacts.push(...hit);
    const said = [...prev.said, ...hit];
    const open = said.length >= openAtOf(panel);
    const full = said.length >= fullAtOf(panel);
    if (open && !prev.open) opened.push(panel.id);
    if (full && !prev.full) completed.push(panel.id);
    return { ...prev, said, open, full };
  });

  return { states: next, newFacts, opened, completed, readLog: false };
}

/**
 * 司会が つぎに 聞き返す パネル。
 *
 * 並びは **枠組みの 順**（データに 書いた 順）で、開いて いない ものから 1つ。
 * `gaveUp`（れいを 見せた）は 飛ばす——2回 聞いて 開かなかった ものを
 * 3回目に また 聞くと、そこで 会話が 止まる。
 */
export function nextProbePanel(
  panels: readonly ReportPanel[],
  states: readonly PanelState[],
): ReportPanel | null {
  const byId = new Map(states.map((s) => [s.id, s]));
  for (const panel of panels) {
    const state = byId.get(panel.id);
    if (!state || state.gaveUp) continue;
    if (!state.open) return panel;
    // 箱が 残って いる（開いて いるが ⭕ で ない）ものも 聞き返す
    if (!state.full) return panel;
  }
  return null;
}

/**
 * 開いた 数（合否に 使う）。
 *
 * `gaveUp` は `applyUtterance` が その 時点で 止める ので、
 * 開かない まま 打ち切られた パネルは ここでも 数に 入らない。
 */
export function countOpen(states: readonly PanelState[]): number {
  return states.filter((s) => s.open).length;
}

/** 言えた 行の 数（むずかしい側の 箱を 数える ときに 使う）。 */
export function countFacts(states: readonly PanelState[]): number {
  return states.reduce((sum, s) => sum + s.said.length, 0);
}
