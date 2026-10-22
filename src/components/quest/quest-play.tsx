"use client";
/* eslint-disable @next/next/no-img-element -- ドット絵は next/image に 通さない。縮小・再圧縮で ドットが にじむ うえ、1枚 数KB の PNG なので 最適化の 得も 無い */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Quest, QuestPhase } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaIndex,
} from "@/lib/text/furigana";
import { assetUrl } from "@/lib/asset-url";
import {
  QUEST_LOG_FURIGANA,
  questLogLines,
  questLogOpening,
  type QuestLogTone,
} from "@/lib/quest/log";
import {
  currentPhase,
  currentPlayer,
  heroSpeakerIndex,
  isAlive,
  isGoodOption,
  optionOrder,
  reflectionPhase,
  type QuestAction,
  type QuestEvent,
  type QuestPlayer,
  type QuestState,
} from "@/lib/quest/state";
import {
  SPEAKER_NAME,
  SpriteFace,
  WATERFALL_MAP,
  chapterBackground,
  chapterOf,
  enemyFocus,
  enemySprite,
  isChapterStart,
  playerSprite,
  plainSpeakerSprite,
  questIcon,
  speakerFocus,
  speakerSprite,
} from "./quest-art";
import { QuestButton, QuestWindow } from "./quest-window";

/**
 * 画面の ことばの 読みは 画面が 持つ（教材の 読み辞書とは 混ぜない）。
 *
 * **ログの 箱は 別**——教材の 字（`option.resultText`）と 画面の 字が 混ざるので、
 * そこだけ 2つを 重ねた 索引で 描く（`QuestLogBox`）。
 */
const UI_FURIGANA = buildFuriganaIndex([
  ["場面", "ばめん"],
  ["一手", "いって"],
  ["予算", "よさん"],
  ["物語", "ものがたり"],
  ["工程", "こうてい"],
  ["記録", "きろく"],
  ["英語", "えいご"],
  ["順番", "じゅんばん"],
  ["閉", "と"],
  ["次", "つぎ"],
  ["第", "だい"],
  ["章", "しょう"],
  ["番", "ばん"],
  ["万", "まん"],
  ["滝", "たき"],
  ["上", "うえ"],
  ["前", "まえ"],
  ["終", "お"],
  ["進", "すす"],
  ["出", "で"],
  ["返", "かえ"],
  // レベルアップの 帯（「上が」は「上」より 長いので 先に 当たる）
  ["上が", "あが"],
  // バグが 出る ときの 文（教材の 辞書は「生」を なま と 読むので 語ごと 持つ）
  ["生き残", "いきのこ"],
  ["爆発", "ばくはつ"],
  ["順調", "じゅんちょう"],
  ["続", "つづ"],
]);

/** ログの 色（分け方は `QuestLogTone` が 持つ）。 */
const LOG_TONE: Record<QuestLogTone, string> = {
  normal: "qx-tone-normal",
  critical: "qx-tone-critical",
  hit: "qx-tone-hit",
  miss: "qx-tone-miss",
  system: "qx-tone-system",
};

export interface LogLine {
  readonly id: number;
  readonly text: string;
  readonly tone: QuestLogTone;
}

/**
 * ログの 箱 — **ここだけ 2つの 読み辞書を 重ねて 描く**
 *
 * 箱には 教材の 字（`option.resultText`）と 画面の 字（`questLogLines` が
 * 組み立てる 文）が 並ぶ ので、どちらの 読みも 要る。
 *
 * **教材の 索引（`furigana`）を 受け取らない**のが この 部品の 役目である。
 * 受け取れる ように すると「うっかり 教材の 索引だけで 描く」に 戻れる——
 * 2026-09-11 まで 実際に そう なって いて、画面の ことばの
 * 「レベルが 上がった！」が 教材の `["上","うえ"]` に 当たって
 * **うえがった** と 読まれて いた。索引を ここへ 閉じこめれば、その 戻り方が
 * そもそも 書けなく なる。
 *
 * 重ねる 順は **教材が 後（勝ち）**。同じ 表記が ぶつかった ときは、
 * `lint:content` が 読みを 見張って いる 教材の ほうを 信じる。
 * 「上が」は 教材の 「上」より 長いので、順に よらず 最長一致で 先に 当たる。
 */
export function QuestLogBox({
  quest,
  lines,
  show,
}: {
  quest: Quest;
  lines: readonly LogLine[];
  show: boolean;
}) {
  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(QUEST_LOG_FURIGANA, quest.furigana)),
    [quest.furigana],
  );

  if (lines.length === 0) {
    return (
      <p className="qx-tone-system">
        <RubyText text={questLogOpening(quest)} index={index} show={show} />
      </p>
    );
  }
  return (
    <>
      {lines.map((line) => (
        <p key={line.id} className={LOG_TONE[line.tone]}>
          <RubyText text={line.text} index={index} show={show} />
        </p>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * 動き（当たり・外れ・バグ）
 * ------------------------------------------------------------------ */

/** 1回の 出来事で 出す 動き。`key` を 変えて 動きを 頭から 流し直す。 */
interface Fx {
  readonly key: number;
  /** 光り（白＝いちばん いい 手・赤＝バグが 出た） */
  readonly flash: "white" | "red" | null;
  /** 相手が 点滅する（当たった） */
  readonly enemyHit: boolean;
  /** 相手の 上に 出る 数（+50 EXP） */
  readonly enemyText: string | null;
  /** 行動した 人（一歩 出る） */
  readonly actor: number | null;
  /** 体力が 減った 人と その 数 */
  readonly hurt: ReadonlyMap<number, number>;
  readonly bugs: number;
  readonly money: number;
  readonly banner: string | null;
}

function fxOf(event: QuestEvent, players: readonly QuestPlayer[], key: number): Fx {
  if (event.kind === "revive") {
    return {
      key,
      flash: event.revived ? "white" : null,
      enemyHit: false,
      enemyText: null,
      actor: null,
      hurt: new Map(),
      bugs: 0,
      money: 0,
      banner: null,
    };
  }
  if (event.kind === "risk") {
    const hurt = new Map<number, number>();
    if (event.damage > 0) players.forEach((_, index) => hurt.set(index, event.damage));
    return {
      key,
      flash: event.damage > 0 ? "red" : null,
      enemyHit: false,
      enemyText: null,
      actor: null,
      hurt,
      bugs: 0,
      money: event.cost,
      banner: null,
    };
  }
  const player = players[event.playerIndex];
  return {
    key,
    flash: event.optionType === "critical" ? "white" : null,
    enemyHit: event.optionType !== "miss",
    enemyText: event.exp > 0 ? `+${event.exp} EXP` : null,
    actor: event.playerIndex,
    hurt: event.hpLost > 0 ? new Map([[event.playerIndex, event.hpLost]]) : new Map(),
    bugs: Math.max(0, event.riskDelta),
    money: Math.max(0, event.moneyLost),
    banner: event.leveledUp && player ? `${player.name}は レベルが 上がった！` : null,
  };
}

/* ------------------------------------------------------------------ *
 * 遊ぶ 画面
 * ------------------------------------------------------------------ */

/** 場面の 中の 仲間の 立ち位置（左・上 の %）。2列を ずらして 4人まで。 */
const TROOP_AT: readonly (readonly [number, number])[] = [
  [0, 0],
  [50, 18],
  [4, 42],
  [54, 60],
];

/**
 * クエストの 遊ぶ 画面 — ドット絵の RPG（2026-10-20 に 作りかえ）
 *
 * ## 組み立ては JRPG の まま
 * ヘッダ（しらべる・予算・たまったバグ・EXP）／PARTY／場面（背景＋相手＋仲間）／ログ／
 * COMMAND。2026-09-01 の 指定「ゲーム風UIが 売り」の 組み立てを 保ち、**見た目を ドット絵**に した。
 * スマホでは PARTY を 場面の 上に 横 4つ で 出し、COMMAND が スクロール なしで 見える ように する。
 *
 * ## 絵で 分かる
 * 場面の 背景は 章ごと（いま どの 工程か）、相手は 場面ごと（せっかち・おサイフを きにする…）。
 * 答える 番の 人は 場面の 中で 一歩 前に 出て、上に ▼ が 付く（1台を 囲んで 遊ぶ ため）。
 *
 * ## 解説は 飛ばせない
 * 当たっても 外しても、次へ 進む 前に **解説の ウィンドウを はさむ**
 *（設計01 P8 アンチパターン②）。進める ボタンは その 中にしか 無い。
 */
export function QuestPlay({
  quest,
  state,
  dispatch,
  furigana,
  furiganaOn,
  onToggleFurigana,
}: {
  quest: Quest;
  state: QuestState;
  dispatch: (action: QuestAction) => void;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
  onToggleFurigana: () => void;
}) {
  const phase = currentPhase(quest, state);
  const [log, setLog] = useState<readonly LogLine[]>([]);
  /** 最後の 出来事の 動き。`live` の あいだだけ 数や 光りを 出す。 */
  const [fx, setFx] = useState<Fx | null>(null);
  const [live, setLive] = useState(false);
  const grid = useRef<HTMLDivElement | null>(null);
  const [modal, setModal] = useState<null | "story" | "history" | "process">(null);
  /*
   * 場面の 頭の 進み（章の 札 → 会話の 何行目）。場面が 変わったら 頭から。
   * 場面の 番号と 組で 持ち、ずれて いたら 初期値と みなす（効果で 戻すと 1こま 古い 画面が 出る）。
   */
  const [talk, setTalk] = useState({ phaseIndex: state.phaseIndex, line: 0, cardDone: false });
  const here =
    talk.phaseIndex === state.phaseIndex
      ? talk
      : { phaseIndex: state.phaseIndex, line: 0, cardDone: false };
  const logSeq = useRef(0);
  const fxSeq = useRef(0);
  const logBox = useRef<HTMLDivElement | null>(null);

  /*
   * ログは **画面が 持つ**（セーブには 入れない）。セーブは 4人で 共有する 1行なので、
   * 増え続ける 文字を そこへ 混ぜると 書き込みが どんどん 重く なる。
   * 原典も 読み込み直しで ログは 消える。
   */
  const event = state.event;
  useEffect(() => {
    if (!event) return;
    const lines = questLogLines(quest, state);
    if (lines.length > 0) {
      setLog((prev) => [...prev, ...lines.map((line) => ({ ...line, id: (logSeq.current += 1) }))]);
    }
    fxSeq.current += 1;
    setFx(fxOf(event, state.players, fxSeq.current));
    setLive(true);
    /*
     * ゆれは **外した とき**と **バグが 出た とき**だけ。当たりは 光りで 見せる
     *（どちらも ゆれると 判定の ちがいが 体で 分からない）。
     * 画面を 作り直さずに 動かす ため、要素の animate を 使う。
     */
    const rough =
      event.kind === "risk"
        ? event.damage > 0
        : event.kind === "turn" && event.optionType === "miss";
    if (rough && !prefersReducedMotion()) {
      grid.current?.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(-5px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 450, easing: "steps(6)" },
      );
    }
    const timer = setTimeout(() => setLive(false), 1600);
    return () => clearTimeout(timer);
    // 出来事が 変わった ときだけ 1回。state 全体を 見ると 同じ 行が 2度 積まれる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  if (!phase) return null;

  const ruby = (text: string) => <RubyText text={text} index={furigana} show={furiganaOn} />;
  const ui = (text: string) => <RubyText text={text} index={UI_FURIGANA} show={furiganaOn} />;
  const chapter = chapterOf(phase);

  const cardOpen =
    isChapterStart(phase) &&
    state.chosen.length === 0 &&
    event === null &&
    here.line === 0 &&
    !here.cardDone;
  const step: "risk" | "revive" | "result" | "card" | "talk" | "choose" =
    event?.kind === "risk"
      ? "risk"
      : event?.kind === "revive"
        ? "revive"
        : event?.kind === "turn"
          ? "result"
          : cardOpen
            ? "card"
            : state.chosen.length === 0 && here.line < phase.dialogue.length
              ? "talk"
              : "choose";
  const showTurn = step === "choose";
  const openCard = () => setTalk({ ...here, cardDone: true });

  const shown = live ? fx : null;
  const party = (
    <QuestWindow title="PARTY" className="qx-party">
      <div
        className="qx-plist"
        style={{ ["--qx-n" as string]: state.players.length } as React.CSSProperties}
      >
        {state.players.map((player, index) => (
          <PartyCard
            key={player.id}
            player={player}
            turn={showTurn && index === state.turn}
            hurt={shown?.hurt.get(index)}
          />
        ))}
      </div>
    </QuestWindow>
  );

  return (
    <div className="qx-play">
      <div ref={grid} className="qx-grid">
        {/* ── ヘッダ: しらべる ボタンと メーター ── */}
        <QuestWindow className="qx-head">
          <div className="qx-row">
            <QuestButton data-quest="story" onClick={() => setModal("story")}>
              {ui("物語")}
            </QuestButton>
            <QuestButton data-quest="history" onClick={() => setModal("history")}>
              {ui("記録")}
            </QuestButton>
            <QuestButton data-quest="process" onClick={() => setModal("process")}>
              {ui("工程")}
            </QuestButton>
            <span className="qx-sp" />
            <QuestButton
              onClick={onToggleFurigana}
              aria-pressed={furiganaOn}
              className={furiganaOn ? "qx-on" : ""}
            >
              ふりがな {furiganaOn ? "ON" : "OFF"}
            </QuestButton>
          </div>
          <div className="qx-row qx-meters">
            <span className="qx-meter qx-coin">
              <img className="qx-px" src={questIcon("coin")} alt="" />
              <span className="qx-lbl">{ui("予算")}</span>
              <b>{state.budget}</b>
              {ui("万")}
              {shown && shown.money > 0 ? (
                <Float key={`m${shown.key}`} kind="money" text={`-${shown.money}万`} />
              ) : null}
            </span>
            <span className={`qx-meter qx-bug ${shown && shown.bugs > 0 ? "qx-bump" : ""}`}>
              <img className="qx-px" src={questIcon("bug")} alt="" />
              <span className="qx-lbl">たまったバグ</span>
              <b>{state.hiddenRisk}</b>
              {shown && shown.bugs > 0 ? (
                <Float key={`b${shown.key}`} kind="bugs" text={`+${shown.bugs}`} />
              ) : null}
            </span>
            <span className="qx-meter qx-star">
              <img className="qx-px" src={questIcon("star")} alt="" />
              <span className="qx-lbl">EXP</span>
              <b>{state.teamExp}</b>
            </span>
          </div>
        </QuestWindow>

        {party}

        {/* ── 場面（背景・相手・仲間） ── */}
        <QuestWindow className="qx-scene">
          <img className="qx-bg qx-px" src={chapterBackground(chapter)} alt="" />
          <div className="qx-shade" />
          <div className="qx-hud">
            <span className="qx-ch">
              <em>{ui(`第${chapter}章`)}</em>
              {ruby(phase.chapter)}
            </span>
            <div className="qx-blocks" aria-hidden>
              {Array.from({ length: 10 }, (_, k) => (
                <i
                  key={k}
                  className={k + 1 < chapter ? "qx-done" : k + 1 === chapter ? "qx-now" : ""}
                />
              ))}
              <span>
                {ui("場面")} {phase.id}/{quest.phases.length}
              </span>
            </div>
          </div>
          <div
            key={`e${fx?.key ?? 0}`}
            data-quest="enemy"
            className={`qx-enemy ${fx?.enemyHit ? "qx-hit" : ""}`}
          >
            <img className="qx-px" src={enemySprite(phase.id)} alt="" />
            {shown?.enemyText ? <Float kind="exp" text={shown.enemyText} top="10%" /> : null}
          </div>
          <div className="qx-plate">{ruby(phase.enemy.name)}</div>
          <div className="qx-troop">
            {state.players.map((player, index) => {
              const at = TROOP_AT[index] ?? [0, 0];
              const hurt = shown?.hurt.get(index);
              return (
                <div
                  key={`${player.id}-${fx?.key ?? 0}`}
                  className={[
                    "qx-mem",
                    showTurn && index === state.turn ? "qx-turn" : "",
                    isAlive(player) ? "" : "qx-down",
                    fx?.actor === index ? "qx-act" : "",
                    fx?.hurt.has(index) ? "qx-hurt" : "",
                  ].join(" ")}
                  style={{ left: `${at[0]}%`, top: `${at[1]}%` }}
                >
                  <img className="qx-px" src={playerSprite(player)} alt="" />
                  {hurt ? <Float kind="dmg" text={`-${hurt}`} top="0" /> : null}
                </div>
              );
            })}
          </div>
          <div className="qx-fx">
            {shown?.flash ? (
              <div
                key={`f${shown.key}`}
                className={`qx-flash qx-go ${shown.flash === "red" ? "qx-red" : ""}`}
              />
            ) : null}
            {shown?.flash === "white" ? <Sparks key={`s${shown.key}`} /> : null}
            {shown?.banner ? (
              <div key={`l${shown.key}`} className="qx-banner">
                {ui(shown.banner)}
              </div>
            ) : null}
          </div>
          {step === "card" ? (
            <button type="button" className="qx-card" onClick={openCard}>
              <span className="qx-no">{ui(`第${chapter}章`)}</span>
              <span className="qx-nm">{ruby(phase.chapter)}</span>
              <span className="qx-ds qx-t">{ruby(phase.desc)}</span>
              <span className="qx-go">▼ おして はじめる</span>
            </button>
          ) : null}
        </QuestWindow>

        {/* ── メッセージログ ── */}
        <QuestWindow className="qx-log">
          <div ref={logBox} data-quest="log" aria-live="polite" className="h-full overflow-y-auto">
            <QuestLogBox quest={quest} lines={log} show={furiganaOn} />
          </div>
        </QuestWindow>

        {/* ── COMMAND ── */}
        <QuestWindow
          title={
            step === "risk" || step === "result" || step === "revive"
              ? "RESULT"
              : step === "choose"
                ? "COMMAND"
                : "STORY"
          }
          className="qx-cmd"
        >
          {step === "card" ? (
            <button type="button" data-quest="next" className="qx-talk" onClick={openCard}>
              <SpriteFace
                src={enemySprite(phase.id)}
                focus={enemyFocus(phase.enemy.art)}
                className="qx-portrait"
              />
              <span>
                <span className="qx-who">{ui(`第${chapter}章`)}</span>
                <span className="qx-say qx-t">{ruby(`${phase.chapter}が はじまります。`)}</span>
              </span>
              <span className="qx-more">
                おして はじめる <i>▼</i>
              </span>
            </button>
          ) : step === "talk" ? (
            <Dialogue
              key={`${state.phaseIndex}-${here.line}`}
              state={state}
              phase={phase}
              line={here.line}
              furigana={furigana}
              furiganaOn={furiganaOn}
              onNext={() => setTalk({ ...here, line: here.line + 1 })}
            />
          ) : step === "risk" && event?.kind === "risk" ? (
            <RiskBody event={event} ui={ui} onNext={() => dispatch({ type: "advance" })} />
          ) : step === "revive" && event?.kind === "revive" ? (
            <ReviveBody quest={quest} event={event} onNext={() => dispatch({ type: "advance" })} />
          ) : step === "result" && event?.kind === "turn" ? (
            <ResultBody
              phase={phase}
              optionIndex={event.optionIndex}
              ruby={ruby}
              ui={ui}
              onNext={() => dispatch({ type: "advance" })}
            />
          ) : (
            <ChooseBody state={state} phase={phase} ruby={ruby} ui={ui} dispatch={dispatch} />
          )}
        </QuestWindow>
      </div>

      {modal ? (
        <QuestModal
          title={modal === "story" ? "STORY" : modal === "history" ? "HISTORY" : "PROCESS CHART"}
          ui={ui}
          onClose={() => setModal(null)}
        >
          {modal === "story" ? (
            <StoryBody quest={quest} state={state} ruby={ruby} show={furiganaOn} />
          ) : modal === "history" ? (
            log.length === 0 ? (
              <p className="qx-t">まだ ありません。</p>
            ) : (
              <QuestLogBox quest={quest} lines={log} show={furiganaOn} />
            )
          ) : (
            <ProcessChart quest={quest} state={state} ruby={ruby} ui={ui} />
          )}
        </QuestModal>
      ) : null}

      {state.reflection ? (
        <ReflectionModal quest={quest} state={state} ruby={ruby} dispatch={dispatch} />
      ) : null}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------------------------------------------ *
 * 小さな 部品
 * ------------------------------------------------------------------ */

function Float({
  kind,
  text,
  top = "-6px",
}: {
  kind: "exp" | "dmg" | "bugs" | "money";
  text: string;
  top?: string;
}) {
  return (
    <span aria-hidden className={`qx-float qx-${kind}`} style={{ left: "50%", top }}>
      <RubyText text={text} index={UI_FURIGANA} />
    </span>
  );
}

/** いちばん いい 手の ときの 星。場所は 毎回 同じで よい（動きで 気づかせる）。 */
function Sparks() {
  const at: readonly (readonly [number, number])[] = [
    [18, 30],
    [30, 18],
    [40, 44],
    [22, 58],
    [34, 66],
    [12, 46],
  ];
  return (
    <>
      {at.map(([left, top], index) => (
        <i
          key={index}
          className="qx-spark"
          style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${index * 60}ms` }}
        />
      ))}
    </>
  );
}

/** 仲間 1人の 札（名前・体力の ゲージ・Lv・HP）。 */
function PartyCard({ player, turn, hurt }: { player: QuestPlayer; turn: boolean; hurt?: number }) {
  const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
  const tone = ratio < 0.3 ? "qx-low" : ratio < 0.6 ? "qx-mid" : "";
  return (
    <div className={`qx-pcard ${turn ? "qx-turn" : ""} ${isAlive(player) ? "" : "qx-down"}`}>
      <div className="qx-top">
        <SpriteFace src={playerSprite(player)} />
        <span className="qx-nm">{player.name}</span>
      </div>
      <div className="qx-hpbar">
        <i className={tone} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <div className="qx-nums">
        <span>Lv{player.level}</span>
        <span className="qx-hp">HP {player.hp}</span>
      </div>
      {hurt ? <Float kind="dmg" text={`-${hurt}`} top="0" /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * COMMAND ウィンドウの 中身
 * ------------------------------------------------------------------ */

/**
 * 場面の 頭の 会話（1行ずつ・文字送り・hero は メンバーに 順番で 回る）。
 *
 * **押すと その 行を 全部 出し、もう 一度 押すと 次の 行へ。** 読むのが 早い 人も
 * 待たされず、ゆっくりの 人は 自分の ペースで 読める（1画面1文）。
 * ルビの ついた 語は ひとかたまりで 出す（「打ち合わせ」の 読みが 途中で 切れない）。
 */
function Dialogue({
  state,
  phase,
  line,
  furigana,
  furiganaOn,
  onNext,
}: {
  state: QuestState;
  phase: QuestPhase;
  line: number;
  furigana: FuriganaIndex;
  furiganaOn: boolean;
  onNext: () => void;
}) {
  const current = phase.dialogue[line];
  const tokens = useMemo(() => {
    if (!current) return [];
    const segments = furiganaOn ? annotateRuby(current.text, furigana) : [{ text: current.text }];
    return segments.flatMap((seg) =>
      seg.reading ? [seg] : [...seg.text].map((char) => ({ text: char, reading: undefined })),
    );
  }, [current, furigana, furiganaOn]);
  // 動きを 減らす 設定の 人には、はじめから 全部 出す
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? Number.MAX_SAFE_INTEGER : 0));
  const done = shown >= tokens.length;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setShown((n) => {
        if (n + 1 >= tokens.length) clearInterval(timer);
        return n + 1;
      });
    }, 38);
    return () => clearInterval(timer);
  }, [tokens.length]);

  if (!current) return null;

  const heroOrdinal = phase.dialogue
    .slice(0, line)
    .filter((item) => item.speaker === "hero").length;
  const hero =
    current.speaker === "hero"
      ? state.players[heroSpeakerIndex(state.phaseIndex, heroOrdinal, state.players.length)]
      : undefined;

  const typed = tokens.slice(0, shown).map((tok, i) =>
    tok.reading ? (
      <ruby key={i}>
        {tok.text}
        <rt>{tok.reading}</rt>
      </ruby>
    ) : (
      <span key={i}>{tok.text}</span>
    ),
  );

  return (
    <button
      type="button"
      data-quest="next"
      className="qx-talk"
      onClick={() => (done ? onNext() : setShown(tokens.length))}
    >
      {current.speaker === "system" ? (
        <span />
      ) : current.speaker === "hero" ? (
        hero ? (
          <SpriteFace src={playerSprite(hero)} className="qx-portrait" />
        ) : (
          <span />
        )
      ) : (
        <SpriteFace
          src={speakerSprite(current.speaker, phase)}
          focus={speakerFocus(current.speaker)}
          className="qx-portrait"
        />
      )}
      <span>
        {current.speaker === "system" ? null : current.speaker === "hero" ? (
          <span className="qx-who">{hero?.name ?? "あなた"}</span>
        ) : (
          <span className="qx-who">
            <RubyText text={SPEAKER_NAME[current.speaker]} index={furigana} show={furiganaOn} />
          </span>
        )}
        <span className={`qx-say qx-t ${current.speaker === "system" ? "qx-system" : ""}`}>
          {typed}
        </span>
      </span>
      <span className="qx-more" style={{ visibility: done ? "visible" : "hidden" }}>
        <RubyText text="おして 次へ" index={UI_FURIGANA} show={furiganaOn} /> <i>▼</i>
      </span>
    </button>
  );
}

/**
 * 4択。**場面ごとに シャッフル**して 出す（原典どおり。`optionOrder`）。
 * 押した 札は 消えるが、**位置は ずらさない**——ずれると 残った 札を 読み直す ことに なる。
 *
 * `data-option-type` は e2e が 札の 質で 押し分ける ための 印（見た目も 動きも 変えない）。
 * 並びが シャッフルされる ので、先頭を 押し続けると 倒れるまでの 長さが 運で 決まって いた。
 */
function ChooseBody({
  state,
  phase,
  ruby,
  ui,
  dispatch,
}: {
  state: QuestState;
  phase: QuestPhase;
  ruby: (text: string) => React.ReactNode;
  ui: (text: string) => React.ReactNode;
  dispatch: (action: QuestAction) => void;
}) {
  const player = currentPlayer(state);
  const order = optionOrder(state.seed, phase);
  return (
    <div className="grid">
      <div className="qx-ask">
        {player ? <SpriteFace src={playerSprite(player)} /> : null}
        <span className="min-w-0">
          <span className="qx-who">
            {player?.name}の {ui("番")}
          </span>
          <span className="qx-q qx-t">{ruby(phase.question)}</span>
        </span>
      </div>
      <ul className="qx-opts">
        {order.map((index) => {
          const option = phase.options[index];
          if (!option) return null;
          if (state.chosen.includes(index)) {
            // 押した 札の 場所は 空けて おく（高さを 保つ ために 字は 見えない ように 置く）
            return (
              <li key={index} aria-hidden className="invisible">
                <span className="qx-opt">
                  <span />
                  <span className="qx-t min-w-0">{ruby(option.text)}</span>
                </span>
              </li>
            );
          }
          return (
            <li key={index}>
              <button
                type="button"
                data-quest="option"
                data-option-type={option.type}
                className="qx-opt"
                onClick={() => dispatch({ type: "choose", optionIndex: index })}
              >
                <span aria-hidden className="qx-cur">
                  ▶
                </span>
                <span className="qx-t min-w-0">{ruby(option.text)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** えらんだ あとの 解説（当たっても 外しても 必ず 読ませる）。 */
function ResultBody({
  phase,
  optionIndex,
  ruby,
  ui,
  onNext,
}: {
  phase: QuestPhase;
  optionIndex: number;
  ruby: (text: string) => React.ReactNode;
  ui: (text: string) => React.ReactNode;
  onNext: () => void;
}) {
  const option = phase.options[optionIndex];
  if (!option) return null;
  return (
    <div className="qx-res">
      <p className={`qx-rt qx-t ${LOG_TONE[option.type]}`}>{ruby(option.resultText)}</p>
      <p className="qx-ex qx-t">{ruby(option.explanation)}</p>
      <QuestButton tone="primary" data-quest="next" onClick={onNext}>
        {ui("次の 一手")} ▶
      </QuestButton>
    </div>
  );
}

/**
 * たまって いた バグが 出る（場面5の 入口・原典どおり）。
 * 画面が 赤く 光って ゆれ、全員の 体力と 予算が 減る（動きは `fxOf`）。
 * 文は 原典の「たまって いた バグが 爆発するぞ…！」「なんとか 生き残った…」を そのまま 使う。
 */
function RiskBody({
  event,
  ui,
  onNext,
}: {
  event: Extract<QuestEvent, { kind: "risk" }>;
  ui: (text: string) => React.ReactNode;
  onNext: () => void;
}) {
  return (
    <div data-quest="risk" className="qx-res">
      <p className="qx-rt qx-t qx-tone-miss">
        <RubyText text="たまって いた「バグ」が 爆発するぞ…！" index={UI_FURIGANA} />
      </p>
      {event.damage === 0 ? (
        <p className="qx-ex qx-t qx-tone-critical">
          <RubyText
            text="すごい！ バグは ひとつも なかった！ テストは 順調だ！"
            index={UI_FURIGANA}
          />
        </p>
      ) : (
        <>
          <ul className="qx-chips">
            <li>
              <img className="qx-px" src={questIcon("bug")} alt="" />
              {event.risk}
            </li>
            <li>
              <img className="qx-px" src={questIcon("heart")} alt="" />-{event.damage}
            </li>
            <li>
              <img className="qx-px" src={questIcon("coin")} alt="" />-{event.cost}
              {ui("万")}
            </li>
          </ul>
          {event.survived ? (
            <p className="qx-ex qx-t">
              <RubyText text="なんとか 生き残った…テストを 続けよう…" index={UI_FURIGANA} />
            </p>
          ) : null}
        </>
      )}
      <QuestButton tone="primary" data-quest="next" onClick={onNext}>
        {ui("次へ")} ▶
      </QuestButton>
    </div>
  );
}

/** 反省クイズを 終えて 再開した ときの しらせ（文は ログと 同じ）。 */
function ReviveBody({
  quest,
  event,
  onNext,
}: {
  quest: Quest;
  event: Extract<QuestEvent, { kind: "revive" }>;
  onNext: () => void;
}) {
  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(QUEST_LOG_FURIGANA, quest.furigana)),
    [quest.furigana],
  );
  return (
    <div data-quest="revive" className="qx-res">
      {event.revived ? (
        <p className="qx-rt qx-t qx-tone-critical">
          <RubyText text="【復活】倒れて いた メンバーの HPが 全回復した！" index={index} />
        </p>
      ) : null}
      {event.relief > 0 ? (
        <p className="qx-rt qx-t qx-tone-hit">
          <RubyText text={`【特別救済】特別予算 ${event.relief}万が 支給された！`} index={index} />
        </p>
      ) : null}
      <p className="qx-ex qx-t">
        <RubyText text="場面の 最初から やり直します。" index={index} />
      </p>
      <QuestButton tone="primary" data-quest="next" onClick={onNext}>
        <RubyText text="次へ" index={UI_FURIGANA} /> ▶
      </QuestButton>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * STORY（登場人物の 紹介つき・原典 renderStoryModal）
 * ------------------------------------------------------------------ */

/** STORY の 紹介文の 読み（この 窓でしか 使わない 語。全＝まった は ここだけの 読み）。 */
const STORY_FURIGANA = buildFuriganaIndex([
  ["主人公", "しゅじんこう"],
  ["神社長", "かみしゃちょう"],
  ["山田", "やまだ"],
  ["営業", "えいぎょう"],
  ["先輩", "せんぱい"],
  ["担当", "たんとう"],
  ["客様", "きゃくさま"],
  ["神様", "かみさま"],
  ["社長", "しゃちょう"],
  ["無理", "むり"],
  ["無事", "ぶじ"],
  ["無茶", "むちゃ"],
  ["使命", "しめい"],
  ["時間", "じかん"],
  ["実際", "じっさい"],
  ["願", "ねが"],
  ["足", "た"],
  ["金", "かね"],
  ["守", "まも"],
  ["思", "おも"],
  ["全", "まった"],
  ["赤", "あか"],
  ["人", "ひと"],
  ["追", "お"],
  ["書", "か"],
  ["続", "つづ"],
]);

const CHARACTERS: readonly {
  speaker: keyof typeof SPEAKER_NAME;
  name: string;
  text: string;
}[] = [
  {
    speaker: "yamada",
    name: "営業の山田さん",
    text: "主人公の先輩で、営業（セールス）の担当。プロジェクトのアドバイスをくれるが、たまにミスもする。",
  },
  {
    speaker: "god",
    name: "神社長",
    text: "「お客様は神様です」と思っている、ゴッドマートの社長。ITのことは全くわからない。「AIでいいカンジによろしく！」「やっぱりボタンは赤にして！」など、神様のような無茶なお願いで、プロジェクトをパニックにする。",
  },
  {
    speaker: "engineer",
    name: "エンジニア",
    text: "システムを実際にプログラミングする人。いつも時間に追われながら、パソコンにむかってコードを書き続けている。",
  },
];

function StoryBody({
  quest,
  state,
  ruby,
  show,
}: {
  quest: Quest;
  state: QuestState;
  ruby: (text: string) => React.ReactNode;
  show: boolean;
}) {
  const story = (text: string) => <RubyText text={text} index={STORY_FURIGANA} show={show} />;
  return (
    <div className="grid gap-3">
      <p className="qx-t">{ruby(quest.description)}</p>
      <p className="qx-t qx-tone-critical">{ruby(quest.focus)}</p>

      <div className="grid gap-2 border border-[#262d47] p-2">
        <p className="m-0 text-[#ffd84a]">{story("プレイヤー（あなたたち）")}</p>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {state.players.map((player) => (
            <li key={player.id} className="flex items-center gap-1">
              <SpriteFace src={playerSprite(player)} size={28} />
              <span className="text-xs">{player.name}</span>
            </li>
          ))}
        </ul>
        <p className="qx-t m-0 text-xs leading-relaxed">
          {story(
            "プロジェクトのリーダー。無理なお願いや、足りない時間とお金...。たくさんのピンチからチームを守り、システムを無事にリリースさせるミッション（使命）がある。",
          )}
        </p>
      </div>

      {CHARACTERS.map((character) => (
        <div
          key={character.speaker}
          className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-2 border border-[#262d47] p-2"
        >
          <img className="qx-px h-14 w-14" src={plainSpeakerSprite(character.speaker)} alt="" />
          <div className="min-w-0">
            <p className="m-0 text-[#ffd84a]">{story(character.name)}</p>
            <p className="qx-t m-0 text-xs leading-relaxed">{story(character.text)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 反省クイズ（倒れた あとの「やり直す」・原典 renderReflectionModal）
 * ------------------------------------------------------------------ */

const REFLECT_FURIGANA = buildFuriganaIndex([
  ["反省完了", "はんせいかんりょう"],
  ["反省", "はんせい"],
  ["不正解", "ふせいかい"],
  ["正解", "せいかい"],
  ["間違", "まちが"],
  ["問題", "もんだい"],
  ["選択", "せんたく"],
  ["原因", "げんいん"],
  ["理解", "りかい"],
  ["復習", "ふくしゅう"],
  ["見直", "みなお"],
  ["一度", "いちど"],
  ["一つ", "ひとつ"],
  ["復活", "ふっかつ"],
  ["再開", "さいかい"],
  ["前", "まえ"],
  ["正", "ただ"],
  ["他", "ほか"],
  ["後", "あと"],
  ["倒", "たお"],
]);

/** 直前の 札の 結果の ひとこと（原典の ログの 文）。 */
const REFLECT_SAY: Record<"one" | "all" | "requeue" | "wrong", { text: string; tone: string }> = {
  one: { text: "【正解】原因の一つを理解した。まだ他にもあるぞ！", tone: "qx-tone-hit" },
  all: { text: "【正解】すべての原因を理解できた！", tone: "qx-tone-hit" },
  requeue: { text: "【正解】だが間違えすぎだ！後でもう一度復習しよう！", tone: "qx-tone-hit" },
  wrong: { text: "【不正解】もう一度見直そう...", tone: "qx-tone-miss" },
};

/**
 * 反省クイズ。**その回に 外した 問題**を 1問ずつ 出し、いい手を 全部 選べたら 次へ。
 * 札には 解説も 添える（原典どおり——ここは 試験では なく、外した 理由を 読み直す 場）。
 * 全部 終えたら「プロジェクト再開」で 倒れた 人が 全回復し、その 場面の 最初から。
 *
 * `data-option-type` は 4択と 同じ e2e の 印。外れを 押すと その 問題が 後ろに 回る ので、
 * 先頭を 押し続けると 終わるまでの 長さが 運で 決まって いた（2026-10-22 に CI で 時間切れ）。
 */
function ReflectionModal({
  quest,
  state,
  ruby,
  dispatch,
}: {
  quest: Quest;
  state: QuestState;
  ruby: (text: string) => React.ReactNode;
  dispatch: (action: QuestAction) => void;
}) {
  const reflection = state.reflection;
  if (!reflection) return null;
  const phase = reflectionPhase(quest, state);
  const say = reflection.last ? REFLECT_SAY[reflection.last] : null;
  const r = (text: string) => <RubyText text={text} index={REFLECT_FURIGANA} />;

  return (
    <div data-quest="reflection" className="qx-modal">
      <QuestWindow>
        {phase ? (
          <>
            <h3>
              <span className="text-[#ff6464]">
                {r("【反省クイズ】")} {reflection.index + 1} / {reflection.queue.length}
              </span>
            </h3>
            <div className="qx-body grid gap-2">
              {say ? <p className={`qx-t m-0 ${say.tone}`}>{r(say.text)}</p> : null}
              <p className="m-0 text-xs text-[#ffd84a]">{ruby(phase.name)}</p>
              <p className="qx-t m-0 border border-[#39436a] bg-[#070a18] p-2">
                Q: {ruby(phase.question)}
              </p>
              <p className="qx-t m-0 text-xs text-[#cfd5e6]">
                {r("前に間違えた問題です。どれが正しい選択だったでしょうか？")}
              </p>
              <ul className="m-0 grid list-none gap-2 p-0">
                {optionOrder(state.seed, phase, reflection.index + 1).map((index) => {
                  const option = phase.options[index];
                  if (!option) return null;
                  const picked = reflection.picked.includes(index);
                  const tone = !picked
                    ? "border-[#39436a]"
                    : isGoodOption(option)
                      ? "border-[#74e886] bg-[#13351c]"
                      : "border-[#ff6464] bg-[#3a1414]";
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        data-quest="reflect"
                        data-option-type={option.type}
                        disabled={picked}
                        onClick={() => dispatch({ type: "reflect", optionIndex: index })}
                        className={`qx-t w-full cursor-pointer border-2 bg-transparent p-2 text-left disabled:cursor-default ${tone}`}
                      >
                        <span className="block">{ruby(option.text)}</span>
                        <span className="block text-xs font-normal text-[#8d96b4]">
                          {ruby(option.explanation)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        ) : (
          <>
            <h3>
              <span className="text-[#ffd84a]">{r("【反省完了】")}</span>
            </h3>
            <div className="qx-body grid gap-2">
              {say ? <p className={`qx-t m-0 ${say.tone}`}>{r(say.text)}</p> : null}
              <p className="qx-t m-0">
                {r("すべての間違いを理解できたようだ。倒れていたメンバーが復活した！")}
              </p>
            </div>
            <QuestButton
              tone="primary"
              data-quest="resume"
              onClick={() => dispatch({ type: "resume" })}
            >
              {r("プロジェクト再開")}
            </QuestButton>
          </>
        )}
      </QuestWindow>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * しらべる 画面（原典の 3つの モーダル）
 * ------------------------------------------------------------------ */

function QuestModal({
  title,
  ui,
  onClose,
  children,
}: {
  title: string;
  ui: (text: string) => React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-quest="modal" className="qx-modal">
      <QuestWindow>
        <h3>
          <span>{title}</span>
          <button type="button" aria-label="とじる" onClick={onClose} className="qx-x">
            ×
          </button>
        </h3>
        <div className="qx-body">{children}</div>
        <QuestButton onClick={onClose} className="w-full">
          {ui("閉じる")}
        </QuestButton>
      </QuestWindow>
    </div>
  );
}

/**
 * 工程の 図 — **10段の 滝**。
 *
 * レクチャーの「ウォーターフォールは 英語で 滝。上から 順番に 終わらせ、前が 終わらないと
 * 次に 進まない」を 絵に した もの。いまの 段に 1人目の ネクマックスが 立ち、
 * 終わった 段には ✓ が 付く。
 *
 * 章の 名前は **データから 集める**——原典は 9つを ソースに 直書きして いて、
 * 第10章「保守」が 抜けて いた。
 */
function ProcessChart({
  quest,
  state,
  ruby,
  ui,
}: {
  quest: Quest;
  state: QuestState;
  ruby: (text: string) => React.ReactNode;
  ui: (text: string) => React.ReactNode;
}) {
  const chapters: { num: number; name: string }[] = [];
  for (const phase of quest.phases) {
    const num = chapterOf(phase);
    if (num > 0 && !chapters.some((item) => item.num === num)) {
      chapters.push({ num, name: phase.chapter });
    }
  }
  chapters.sort((a, b) => a.num - b.num);

  const now = quest.phases[state.phaseIndex];
  const nowNum = now ? chapterOf(now) : 1;
  const lead = state.players[0];

  return (
    <div className="qx-falls">
      <img className="qx-px" src={assetUrl(WATERFALL_MAP)} alt="" />
      <ol>
        {chapters.map((chapter) => {
          const past = chapter.num < nowNum;
          const current = chapter.num === nowNum;
          return (
            <li key={chapter.num} className={past ? "qx-done" : current ? "qx-now" : ""}>
              <span className="qx-n">{past ? "✓" : chapter.num}</span>
              <span className="qx-l qx-t">
                {ruby(chapter.name)}
                {current && lead ? (
                  <img className="qx-me qx-px" src={playerSprite(lead)} alt="" />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="qx-note qx-t">
        {ui(
          "ウォーターフォールは 英語で「滝」。上から 順番に 終わらせます。前が 終わらないと 次に 進みません。",
        )}
      </p>
    </div>
  );
}
