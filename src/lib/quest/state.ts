/**
 * クエストの 進行（純関数）— 旧 `waterfall_quest.html` の ルールを そのまま 持つ
 *
 * 旧アプリは `let budget`・`let hiddenRisk`・`let members[]` などの
 * グローバル変数で 進めて いた。ここでは 状態を 1つの 値に まとめ、
 * 遷移を reducer に 閉じこめて 単体テストで 固定する
 *（ことばアーケードを `arcade-reducer.ts` に 切り出した ときと 同じ 判断）。
 *
 * **UI を 含まない。** React も 絵文字も ここには 無い——画面を 立てずに 遊べる
 * ことが、ルールを テストで 守れる 条件だからである。
 *
 * ## 遊び方（原典どおり・変えない）
 * - 1台を 囲んで 1〜4人。1手ごとに 手番が 次の 人へ 回る（HP0 の 人は 飛ばす）
 * - EXP は critical=50 / hit=30 / miss=0。**手番の 人と チーム合計の 両方**へ 入る
 * - 体力の 減りは `hpCost × 連続ミス回数`（連続ミスは 人ごと。正解で 0 に 戻る）
 * - その場面の critical と hit を **両方 見つけたら 場面クリア**（ミスは 何回でも よい）
 * - 場面クリアに 至らなかった 手では `budget -= 人数 × turnCostPerMember`
 * - 必要EXPは `いまのLv × 100`。上がると `maxHp += 20` かつ HP全回復
 *
 * ## 隠れリスクの 爆発を 第8章の 入口へ 直した
 * 原典は `phaseId === 5` で 爆発して いた——**第2章の 1問目**である。
 * 上流の 雑さが 下流で 返って くるのが この 仕掛けの 意味（設計01 P9）なのに、
 * 上流が まだ 始まって いない ところで 鳴って いた。**旧版の 名残の バグ**なので、
 * 「テスト」の 入口（`RISK_PHASE_ID` に 入る 直前）に 移す。中身は 原典どおり。
 */

import { isPersonalityTypeCode, type PersonalityTypeCode } from "@/content/personality";
import type { Gender } from "@/lib/profile";
import type { Quest, QuestOption, QuestPhase } from "@/content/schema";
import { z } from "zod";

/** 手の 質ごとの EXP（原典の 値）。 */
export const EXP_BY_TYPE: Record<QuestOption["type"], number> = {
  critical: 50,
  hit: 30,
  miss: 0,
};

/** レベルが 1つ 上がるのに 要る EXP は `いまのLv × これ`。 */
export const EXP_PER_LEVEL = 100;

/** レベルアップで 増える 体力の 上限。 */
export const MAX_HP_GAIN = 20;

/**
 * 隠れリスクが 爆発する 場面（**この 場面に 入る 直前**に 鳴る）。
 * 22 = 第8章「テスト」の 1問目。原典の 5（第2章の 1問目）は バグ。
 */
export const RISK_PHASE_ID = 22;

/** 爆発の 大きさ（原典）。全員が `risk × これ` を 受け、予算は `risk × 30` 減る。 */
export const RISK_HP_MULTIPLIER = 10;
export const RISK_BUDGET_MULTIPLIER = 30;

/** 1台を 囲む 人数の 上限（`quest_saves.member_ids` の check と そろえる）。 */
export const MAX_MEMBERS = 4;

/* ------------------------------------------------------------------ *
 * 状態
 * ------------------------------------------------------------------ */

/** 遊ぶ 人 1人。`type` が null なのは **診断が まだの 人**（絵を 出さない）。 */
export interface QuestPlayer {
  readonly id: string;
  readonly name: string;
  readonly type: PersonalityTypeCode | null;
  readonly gender: Gender;
  readonly hp: number;
  readonly maxHp: number;
  readonly exp: number;
  readonly level: number;
  /** 連続ミスの 回数。体力の 減りの 倍率に なる。正解で 0 に 戻る。 */
  readonly missStreak: number;
}

/** えらぶ 前の 1人ぶん（体力や EXP を まだ 持たない）。 */
export type QuestMember = Pick<QuestPlayer, "id" | "name" | "type" | "gender">;

/** 1手の 結果。画面は これを 見て 解説を 出す。 */
export interface QuestTurnEvent {
  readonly kind: "turn";
  readonly playerIndex: number;
  readonly optionIndex: number;
  readonly optionType: QuestOption["type"];
  readonly exp: number;
  readonly hpLost: number;
  readonly moneyLost: number;
  readonly riskDelta: number;
  readonly leveledUp: boolean;
  readonly phaseCleared: boolean;
}

/** 隠れリスクの 爆発。`damage` が 0 なら「バグは ひとつも なかった」。 */
export interface QuestRiskEvent {
  readonly kind: "risk";
  readonly risk: number;
  readonly damage: number;
  readonly cost: number;
}

/**
 * **いま 画面が 見せる もの**。null なら 4択に 戻る。
 *
 * 進行と 見せ物を 1つの 値で 運ぶのは、解説を 読ませ終える 前に 次の 場面へ
 * 進めない ように するため（設計01 P8「えらんだ 直後に 必ず 解説を 読ませる」）。
 */
export type QuestEvent = QuestTurnEvent | QuestRiskEvent;

export type QuestStatus =
  | { readonly kind: "playing" }
  | { readonly kind: "cleared" }
  | { readonly kind: "over"; readonly reason: "hp" | "budget" };

export interface QuestState {
  readonly questId: string;
  readonly players: readonly QuestPlayer[];
  /** 手番の 人（`players` の 位置）。 */
  readonly turn: number;
  /** いまの 場面（`quest.phases` の 位置）。 */
  readonly phaseIndex: number;
  readonly budget: number;
  /** チーム合計の EXP（メーターに 出す）。 */
  readonly teamExp: number;
  readonly hiddenRisk: number;
  /** この 場面で いちばん 良い 手を 見つけたか。 */
  readonly foundCritical: boolean;
  /** この 場面で 良い 手を 見つけたか。 */
  readonly foundHit: boolean;
  /** この 場面で もう 押した 札（消すために 持つ）。 */
  readonly chosen: readonly number[];
  /** 何場面 クリアしたか（結果の 画面に 出す）。 */
  readonly clearedPhases: number;
  readonly event: QuestEvent | null;
  readonly status: QuestStatus;
}

export type QuestAction =
  | { readonly type: "choose"; readonly optionIndex: number }
  /** 解説（または 爆発の しらせ）を 読み終えた。 */
  | { readonly type: "advance" };

/* ------------------------------------------------------------------ *
 * はじめる
 * ------------------------------------------------------------------ */

export function createQuestState(quest: Quest, members: readonly QuestMember[]): QuestState {
  const count = Math.max(1, members.length);
  return {
    questId: quest.id,
    players: members.map((member) => ({
      ...member,
      hp: quest.startHp,
      maxHp: quest.startHp,
      exp: 0,
      level: 1,
      missStreak: 0,
    })),
    turn: 0,
    phaseIndex: 0,
    budget: quest.budgetBase + count * quest.budgetPerMember,
    teamExp: 0,
    hiddenRisk: 0,
    foundCritical: false,
    foundHit: false,
    chosen: [],
    clearedPhases: 0,
    event: null,
    status: { kind: "playing" },
  };
}

/* ------------------------------------------------------------------ *
 * 読み取り（画面が 使う 小さな 問い合わせ）
 * ------------------------------------------------------------------ */

export function currentPhase(quest: Quest, state: QuestState): QuestPhase | null {
  return quest.phases[state.phaseIndex] ?? null;
}

/** いま 手番の 人。全員 倒れて いれば null。 */
export function currentPlayer(state: QuestState): QuestPlayer | null {
  return state.players[state.turn] ?? null;
}

export function isAlive(player: QuestPlayer): boolean {
  return player.hp > 0;
}

/**
 * 会話の `speaker: "hero"` を **メンバーに 順番で 割り当てる**（原典どおり）。
 *
 * 場面が 変わるたび 先頭が ずれるので、30場面 のあいだに **全員へ 主役の 番が 回る**
 *（設計01 P1 の 実装例「主人公セリフをメンバー間でローテーションさせる」）。
 *
 * @param heroLineOrdinal その 場面の 中で 何本目の hero のセリフか（0始まり）
 */
export function heroSpeakerIndex(
  phaseIndex: number,
  heroLineOrdinal: number,
  memberCount: number,
): number {
  if (memberCount <= 0) return 0;
  return (phaseIndex + heroLineOrdinal) % memberCount;
}

/* ------------------------------------------------------------------ *
 * 遷移
 * ------------------------------------------------------------------ */

export function questReducer(quest: Quest, state: QuestState, action: QuestAction): QuestState {
  switch (action.type) {
    case "choose":
      return onChoose(quest, state, action.optionIndex);
    case "advance":
      return onAdvance(quest, state);
  }
}

function onChoose(quest: Quest, state: QuestState, optionIndex: number): QuestState {
  // 解説を 読んで いる あいだ・終わった あとは 押せない（二重に 数えない）
  if (state.event !== null || state.status.kind !== "playing") return state;

  const phase = currentPhase(quest, state);
  const option = phase?.options[optionIndex];
  if (!phase || !option) return state;
  // 同じ 札は 1場面に 1回だけ（画面でも 消すが、鍵は こちら側に 置く）
  if (state.chosen.includes(optionIndex)) return state;

  const playerIndex = state.turn;
  const player = state.players[playerIndex];
  if (!player) return state;

  const missed = option.type === "miss";
  const missStreak = missed ? player.missStreak + 1 : 0;
  // 「正解なら 倍率1」——連続ミスだけが 傷を 深くする（設計01 P9）
  const hpLost = option.hpCost * (missed ? missStreak : 1);
  const exp = EXP_BY_TYPE[option.type];

  const damaged: QuestPlayer = {
    ...player,
    hp: Math.max(0, player.hp - hpLost),
    exp: player.exp + exp,
    missStreak,
  };
  const grown = levelUp(damaged);

  const players = state.players.map((each, index) => (index === playerIndex ? grown : each));

  const foundCritical = state.foundCritical || option.type === "critical";
  const foundHit = state.foundHit || option.type === "hit";
  const phaseCleared = foundCritical && foundHit;

  // 場面クリアに **至らなかった 手**だけ 人件費が 出ていく（時間＝金の 体感・設計01 P9）
  const turnCost = phaseCleared ? 0 : state.players.length * quest.turnCostPerMember;
  const budget = state.budget + option.moneyCost - turnCost;

  const next: QuestState = {
    ...state,
    players,
    budget,
    teamExp: state.teamExp + exp,
    hiddenRisk: Math.max(0, state.hiddenRisk + option.risk),
    foundCritical,
    foundHit,
    chosen: [...state.chosen, optionIndex],
    turn: nextTurn(players, playerIndex),
    event: {
      kind: "turn",
      playerIndex,
      optionIndex,
      optionType: option.type,
      exp,
      hpLost,
      moneyLost: -option.moneyCost + turnCost,
      riskDelta: option.risk,
      leveledUp: grown.level > player.level,
      phaseCleared,
    },
  };

  return { ...next, status: judge(next) };
}

function onAdvance(quest: Quest, state: QuestState): QuestState {
  if (state.event === null) return state;

  // おしまい／クリアの ときは 解説を 閉じるだけ（結果の 画面へ）
  if (state.status.kind !== "playing") return { ...state, event: null };

  // 爆発の しらせを 読み終えた——そのまま テストの 場面へ
  if (state.event.kind === "risk") return { ...state, event: null };

  // まだ 両方 見つけて いない 場面は、同じ 場面の つづき（次の 人の 番）
  if (!state.event.phaseCleared) return { ...state, event: null };

  const clearedPhases = state.clearedPhases + 1;
  const phaseIndex = state.phaseIndex + 1;
  const nextPhase = quest.phases[phaseIndex];

  if (!nextPhase) {
    return { ...state, clearedPhases, event: null, status: { kind: "cleared" } };
  }

  const moved: QuestState = {
    ...state,
    clearedPhases,
    phaseIndex,
    foundCritical: false,
    foundHit: false,
    chosen: [],
    event: null,
  };

  return nextPhase.id === RISK_PHASE_ID ? explodeRisk(moved) : moved;
}

/**
 * 溜まって いた 隠れリスクが 返って くる（原典の 中身の まま）。
 *
 * リスク 0 なら「バグは ひとつも なかった」で 何も 起きない。あれば 全員が
 * `risk × 10` を 受け、予算が `risk × 30` 減る。**生き残れば リスクは 0 に 戻る**。
 */
function explodeRisk(state: QuestState): QuestState {
  const risk = state.hiddenRisk;
  if (risk <= 0) {
    return { ...state, event: { kind: "risk", risk: 0, damage: 0, cost: 0 } };
  }

  const damage = risk * RISK_HP_MULTIPLIER;
  const cost = risk * RISK_BUDGET_MULTIPLIER;
  const players = state.players.map((player) => ({
    ...player,
    hp: Math.max(0, player.hp - damage),
  }));
  const survived = players.every(isAlive);

  const next: QuestState = {
    ...state,
    players,
    budget: state.budget - cost,
    // 生き残った ときだけ 0 に 戻す（倒れた ときは そのまま おしまいなので 使われない）
    hiddenRisk: survived ? 0 : risk,
    event: { kind: "risk", risk, damage, cost },
  };

  return { ...next, status: judge(next) };
}

/** レベルが 上がるだけ 上げる（上がったら 体力の 上限が 増え、**全回復**する）。 */
function levelUp(player: QuestPlayer): QuestPlayer {
  let next = player;
  while (next.exp >= next.level * EXP_PER_LEVEL) {
    const level = next.level + 1;
    const maxHp = next.maxHp + MAX_HP_GAIN;
    next = { ...next, exp: next.exp - next.level * EXP_PER_LEVEL, level, maxHp, hp: maxHp };
  }
  return next;
}

/**
 * 次に 手番が 回る 人（**倒れた 人は 飛ばす**）。
 * 全員 倒れて いたら 位置を 動かさない——その ときは そもそも おしまいである。
 */
function nextTurn(players: readonly QuestPlayer[], from: number): number {
  const count = players.length;
  if (count === 0) return 0;
  for (let step = 1; step <= count; step += 1) {
    const index = (from + step + count) % count;
    const player = players[index];
    if (player && isAlive(player)) return index;
  }
  return (from + 1 + count) % count;
}

/** 終わりの 判定。倒れた 人が 1人でも いれば おしまい、お金が 尽きても おしまい。 */
function judge(state: QuestState): QuestStatus {
  if (state.players.some((player) => !isAlive(player))) return { kind: "over", reason: "hp" };
  if (state.budget <= 0) return { kind: "over", reason: "budget" };
  return state.status;
}

/* ------------------------------------------------------------------ *
 * 保存の かたち
 *
 * `quest_saves.state`（jsonb）と 端末の 保存に そのまま 入れる。読み戻すのは
 * **別の 日・別の 版の アプリ**なので、必ず ここを 通して 形を 確かめる
 *——壊れた 保存値で 画面が 落ちるより、はじめから 遊べる ほうが よい。
 * ------------------------------------------------------------------ */

const typeCodeSchema = z
  .custom<PersonalityTypeCode>((value) => isPersonalityTypeCode(value))
  .nullable();

const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: typeCodeSchema,
  gender: z.enum(["male", "female"]),
  hp: z.number().int().min(0),
  maxHp: z.number().int().positive(),
  exp: z.number().int().min(0),
  level: z.number().int().positive(),
  missStreak: z.number().int().min(0),
});

export const questStateSchema = z.object({
  questId: z.string(),
  players: z.array(playerSchema).min(1).max(MAX_MEMBERS),
  turn: z.number().int().min(0),
  phaseIndex: z.number().int().min(0),
  budget: z.number().int(),
  teamExp: z.number().int().min(0),
  hiddenRisk: z.number().int().min(0),
  foundCritical: z.boolean(),
  foundHit: z.boolean(),
  chosen: z.array(z.number().int().min(0)),
  clearedPhases: z.number().int().min(0),
  // 見せ物は 保存しない。開き直したら 4択から 読み直す（解説だけ 残っても 意味が 無い）
  event: z.null().default(null),
  status: z.union([
    z.object({ kind: z.literal("playing") }),
    z.object({ kind: z.literal("cleared") }),
    z.object({ kind: z.literal("over"), reason: z.enum(["hp", "budget"]) }),
  ]),
});

/**
 * 2つの 保存値の うち **進んで いる ほう**を 返す。
 *
 * DB へ 書くのは 節目だけ・端末へは 1手ごと なので、**端末の ほうが 新しい**
 * ことが 正常に 起きる（場面の 途中で 閉じた とき）。逆に、別の 端末で 続きを
 * 遊んだ 組では DB の ほうが 新しい。どちらかを 決め打ちすると、片方の 進みが
 * 黙って 消える——数えて 選ぶ。
 */
export function furtherAlong(a: QuestState | null, b: QuestState | null): QuestState | null {
  if (!a) return b;
  if (!b) return a;
  if (a.clearedPhases !== b.clearedPhases) return a.clearedPhases > b.clearedPhases ? a : b;
  return a.chosen.length >= b.chosen.length ? a : b;
}

/** 保存の ために 削ぐ（解説の 途中は 残さない）。 */
export function toSaved(state: QuestState): QuestState {
  return { ...state, event: null };
}

/** 保存値を 状態へ 戻す。読めなければ null（呼ぶ側が はじめから 始める）。 */
export function parseQuestState(value: unknown, quest: Quest): QuestState | null {
  const parsed = questStateSchema.safeParse(value);
  if (!parsed.success) return null;
  const state = parsed.data;
  // 教材を 直して 場面が 減った あとの 保存値は 読まない（存在しない 場面に 座らせない）
  if (state.questId !== quest.id) return null;
  if (state.phaseIndex >= quest.phases.length) return null;
  if (state.turn >= state.players.length) return null;
  return state;
}
