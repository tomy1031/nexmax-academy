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
 * ## 数字は ことばで 数えない
 * 「数字を 1つ」だけは キーワードでは なく **形**で 見る。
 * 教材ごとに 数字の キーワードを 書き並べると、書き忘れた 言い方
 *（「はんぶん」「よんこ」）で 開かなく なる。
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
  /** ことばでは なく 形で 見る（いまは「数字が 1つ 以上 あるか」だけ）。 */
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

export function hasNumber(utterance: string): boolean {
  const text = normalizeReading(utterance).replace(NOT_A_COUNT, "");
  return ARABIC.test(text) || KANJI_NUMBER.test(text) || HALF.test(text) || WAGO.test(text);
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
}: {
  utterance: string;
  panels: readonly ReportPanel[];
  states: readonly PanelState[];
  aiSaidIds?: readonly string[];
}): PanelStep {
  const byId = new Map(states.map((s) => [s.id, s]));
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
      if (prev.open || !hasNumber(utterance)) return prev;
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

  return { states: next, newFacts, opened, completed };
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
