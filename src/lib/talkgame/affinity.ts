/**
 * 好感度（%）の たまり方 — 純粋な計算だけ
 *
 * 松井社長との 対話ゲーム（願い #177）は、ハートの 数では なく **100% を 目ざす**。
 * 画面（`TalkGameSession`）と テストの 両方から 使うので、ここに React を 置かない。
 *
 * ## 好感度は 下がらない（設計01 P8）
 * ハートの 実装（`src/lib/meeting/affection.ts`）と 同じで、**減らす道が 1本も 無い**。
 * 会話の 練習で「減る 数字」を 見せると、学習者は つぎの 一言を 出さなく なる。
 * 噛み合わなかった ターンでも 底（`FLOOR`）が 入る——日本語で 声を 出して 会話を
 * 前に 進めた こと 自体が この 教材の ねらいだから。
 *
 * ## 観点で 見る（2026-08-24 の 指定）
 * 1つの ○×では なく、**いくつかの 観点**で 見て 足し合わせる。学習者には
 *「日本語で 言えた ＋2」「りゆうが 言えた ＋3」と 内訳が 見えるので、
 * つぎに 何を 足せば 伸びるのかが 分かる（設計01 P8: 直し方が 見える 形で 返す）。
 *
 * ## 話しきれば 必ず 満タン（`liftTo`）
 * 上手な 人は **少ない ターンで** 満タンに なる。そうで ない 人も、
 * 見つける ものを 見つけ、聞く ばんを 話しきれば 満タンに なる——
 * ここが 崩れると、いちばん 助けが 要る 学習者だけが 100% に 届かない。
 * 差は「速さ」に 出て、「届く／届かない」には 出さない。
 */

/** 会話の いまの ばん。 */
export type TalkRound = "talk" | "listen" | "clear";

/**
 * 1回の 発話を 見た 結果（観点）。AI（`src/lib/talkgame/judge.ts`）が 返す。
 *
 * `optional` を 置かないのは 構造化出力が 不安定に なる ため（判定と 同じ 決まり）。
 */
export interface TalkObservations {
  /** 日本語で 言えた。 */
  japanese: boolean;
  /** 聞かれた ことに かみ合って いる。 */
  onTopic: boolean;
  /** 会社の 中身が 入って いる（サイトで 見た こと・名前・数）。 */
  concrete: boolean;
  /** りゆうが 言えた（〜から／〜ので）。 */
  reason: boolean;
  /** 自分の 気もち・考えが 入って いる。 */
  feeling: boolean;
  /** ていねいに 言えた（ですます）。 */
  polite: boolean;
  /** 聞く ばん: しつもんの 形に なって いる。 */
  question: boolean;
}

export const NO_OBSERVATIONS: TalkObservations = {
  japanese: false,
  onTopic: false,
  concrete: false,
  reason: false,
  feeling: false,
  polite: false,
  question: false,
};

/**
 * 観点ごとの 点（%）。**プロンプトでは なく コードが 持つ**ので、テストで 固定できる。
 *
 * 話す ばんは「中身（concrete）」と「りゆう（reason）」を 重く する——
 * 企業調査の 核心が「他の 会社と ちがう、その 会社の おもしろい ところ」だから
 *（2026-08-14 の 指定・docs/constraints.md）。
 * 聞く ばんは「しつもんの 形（question）」が いちばん 重い——聞けた ことが 目あて。
 */
export const TALK_POINTS: Readonly<Record<keyof TalkObservations, number>> = {
  japanese: 2,
  onTopic: 2,
  concrete: 3,
  reason: 3,
  feeling: 2,
  polite: 0,
  question: 0,
};

export const LISTEN_POINTS: Readonly<Record<keyof TalkObservations, number>> = {
  japanese: 1,
  onTopic: 3,
  concrete: 0,
  reason: 0,
  feeling: 0,
  polite: 2,
  question: 4,
};

/**
 * どの ターンでも 必ず 入る 底（%）。
 *
 * 0 に しないのは、判定に 通せなかった 教室（鍵が 無い・混んで いる）でも
 * 会話が 前へ 進む ため。**こちらの 都合で 学習者を 止めない**。
 */
export const FLOOR = 1;

/** 満タンに 近づいても、1回で 飛び越えない ように 上限で 止める。 */
export function clampPercent(value: number, goal: number): number {
  return Math.max(0, Math.min(goal, Math.round(value)));
}

/** その ばんの 観点表。 */
export function pointsTable(round: TalkRound): Readonly<Record<keyof TalkObservations, number>> {
  return round === "listen" ? LISTEN_POINTS : TALK_POINTS;
}

/** 1回の 発話で 上がる ぶん（%）。 */
export function gainFor(round: TalkRound, observations: TalkObservations): number {
  const table = pointsTable(round);
  let total = 0;
  for (const [key, on] of Object.entries(observations) as [keyof TalkObservations, boolean][]) {
    if (on) total += table[key];
  }
  return Math.max(FLOOR, total);
}

/** 画面に 内訳を 出す ための 並び（点の 大きい 順・0点の 観点は 出さない）。 */
export function breakdown(
  round: TalkRound,
  observations: TalkObservations,
): { key: keyof TalkObservations; points: number; on: boolean }[] {
  const table = pointsTable(round);
  return (Object.keys(table) as (keyof TalkObservations)[])
    .filter((key) => table[key] > 0)
    .sort((a, b) => table[b] - table[a])
    .map((key) => ({ key, points: table[key], on: observations[key] }));
}

/** 教材が 決める 進み方。 */
export interface TalkPlan {
  /** 満タン（%）。 */
  goal: number;
  /** 聞く ばんが 開く（%）。 */
  openAt: number;
  /** 話す ばんで 見つける「おもしろい」の 数。 */
  findCount: number;
}

/**
 * 話す ばんの ターンの 上限。
 *
 * 見つからない まま 何十回も 聞かれると、いちばん 助けが 要る 学習者だけが
 * 会話を 終われなく なる（ミーティングの `MAX_ATTEMPTS` と 同じ 考え方）。
 * 見つける 数の 3倍まで 深掘りしたら、そこで 話す ばんを 閉じる。
 */
export const TALK_TURN_CAP_RATIO = 3;

/** 聞く ばんの しつもんの 数（少なくとも／多くとも）。 */
export const LISTEN_MIN_ASKS = 3;
export const LISTEN_MAX_ASKS = 6;

export interface TalkState {
  readonly round: TalkRound;
  readonly percent: number;
  /** 見つけた「おもしろい」の ラベル（同じ ものは 入らない）。 */
  readonly found: readonly string[];
  /** 話した 回数（話す ばん）。 */
  readonly turns: number;
  /** 聞いた 回数（聞く ばん）。 */
  readonly asked: number;
}

export const EMPTY_TALK: TalkState = {
  round: "talk",
  percent: 0,
  found: [],
  turns: 0,
  asked: 0,
};

/** 1回の 発話の 結果。画面は `gained` を「好感度 +n%」として 見せる。 */
export interface TalkStep {
  readonly state: TalkState;
  /** この ターンで 観点から 上がった ぶん（%）。内訳の 合計と 必ず 一致する。 */
  readonly gained: number;
  /**
   * 観点とは 別に、**話しきった ぶんの 底上げ**で 増えた ぶん（%）。
   *
   * 内訳と メーターの 動きが 食い違うのを 防ぐ ため に 分けて 持つ。
   * ここを `gained` に 混ぜて いた ころ、5つめを 話した ターンだけ
   * 「+7%」と 出て メーターは 26 動いた（2026-08-24 の 検収指摘）。
   */
  readonly lifted: number;
  /** 新しく 見つけた「おもしろい」（無ければ null）。 */
  readonly discovered: string | null;
  /** この ターンで ばんが 変わったか。 */
  readonly turned: TalkRound | null;
  /**
   * **この 発話を 見た ときの ばん**（切りかえ後の `state.round` では ない）。
   *
   * 画面の 内訳は この ばんの 観点表で 描く。切りかえ後の ばんで 描くと、
   * 答えた だけの ターンに「しつもんの 形に なって いない」が 並ぶ——
   * やって いない ことを 責める 形に なる（規律1・2026-08-24 の 検収指摘）。
   */
  readonly judgedAs: TalkRound;
}

/**
 * 同じ「おもしろい」を 2回 数えない ための ならし。
 *
 * AIが 返す ラベルは 揺れる（「カンボジアの プログラム」「カンボジア プログラム」）。
 * 空白と 記号を 落として 比べる——ここを 厳密に すると、同じ 発見で 札が 2枚 開く。
 */
export function normalizeTopic(label: string): string {
  return label
    .replace(/[\s　・、。「」（）()]/g, "")
    .toLowerCase()
    .trim();
}

export function alreadyFound(found: readonly string[], label: string): boolean {
  const key = normalizeTopic(label);
  if (!key) return true;
  return found.some((one) => normalizeTopic(one) === key);
}

/**
 * 1回の 発話を 状態に 写す。
 *
 * ばんの 切りかえは **ここだけ**が 決める（画面に 書くと、直すたびに 黙って 基準が 動く）。
 */
export function applyTurn(
  state: TalkState,
  plan: TalkPlan,
  observations: TalkObservations,
  topic: string | null,
): TalkStep {
  if (state.round === "clear") {
    return { state, gained: 0, lifted: 0, discovered: null, turned: null, judgedAs: "clear" };
  }
  const judgedAs = state.round;
  const gained = gainFor(state.round, observations);
  const fresh =
    state.round === "talk" && topic && !alreadyFound(state.found, topic) ? topic.trim() : null;
  const found = fresh ? [...state.found, fresh] : state.found;
  const turns = state.round === "talk" ? state.turns + 1 : state.turns;
  const asked = state.round === "listen" ? state.asked + 1 : state.asked;
  let percent = clampPercent(state.percent + gained, plan.goal);
  let round: TalkRound = state.round;
  let turned: TalkRound | null = null;

  let lifted = 0;

  if (state.round === "talk") {
    /*
     * **聞く ばんへ 移る 3つの 入口**。
     *
     * - 見つける ものを 見つけた（ねらいの 本筋）
     * - **好感度が 入口に とどいた**（2026-08-24 の 指定「一定数の 好感度を 得たら、
     *   そこから 逆に 学生が 質問する」）。上手な 人を 深掘りに 縛りつけない
     * - 深掘りの 上限（いちばん 助けが 要る 人だけ 会話を 終われない、を 防ぐ）
     *
     * 好感度の 入口を 足したのは、**満タンなのに 終われない**を 消す ためでも ある。
     * 1ターンの 最大は 12 なので、話す ばんを 出る ときの 好感度は
     * `openAt + 11` を 超えない。聞く ばんの 1ターンは 最大 10 なので、
     * 少なくとも `LISTEN_MIN_ASKS` 回 聞かないと 満タンには 届かない——
     * 「100% の まま クリアしない」ターンが 生まれない（2026-08-24 の 検収指摘）。
     */
    const enough =
      found.length >= plan.findCount ||
      percent >= plan.openAt ||
      turns >= plan.findCount * TALK_TURN_CAP_RATIO;
    if (enough) {
      // 話しきった ぶんの 底上げ（届いた 人と 同じ 場所に 立たせる）
      const before = percent;
      percent = Math.max(percent, Math.min(plan.openAt, plan.goal));
      lifted = percent - before;
      round = "listen";
      turned = "listen";
    }
  } else {
    const enough = percent >= plan.goal || asked >= LISTEN_MAX_ASKS;
    if (enough && asked >= LISTEN_MIN_ASKS) {
      const before = percent;
      percent = plan.goal;
      lifted = percent - before;
      round = "clear";
      turned = "clear";
    }
  }

  return {
    state: { round, percent, found, turns, asked },
    gained,
    lifted,
    discovered: fresh,
    turned,
    judgedAs,
  };
}

/**
 * 話す ばんの 進み具合（画面の 札の 数）。
 * 見つけた 数が 上限を こえて 見えないよう、ここで 畳む。
 */
export function foundCount(state: TalkState, plan: TalkPlan): number {
  return Math.min(state.found.length, plan.findCount);
}
