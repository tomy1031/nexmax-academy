"use client";

import { useEffect, useRef, useState } from "react";
import type { Quest } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex, type FuriganaIndex } from "@/lib/text/furigana";
import {
  currentPhase,
  currentPlayer,
  heroSpeakerIndex,
  isAlive,
  type QuestAction,
  type QuestState,
} from "@/lib/quest/state";
import { PlayerFace, SPEAKER_ART, SPEAKER_NAME } from "./quest-art";
import { EnemyArt } from "./quest-enemy";
import { phaseBackground } from "./enemy-svg";
import { QuestButton, QuestWindow } from "./quest-window";

/** 画面の ことばの 読みは 画面が 持つ（教材の 読み辞書とは 混ぜない）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["場面", "ばめん"],
  ["一手", "いって"],
  ["行動", "こうどう"],
  ["危険", "きけん"],
  ["体力", "たいりょく"],
  ["物語", "ものがたり"],
  ["工程", "こうてい"],
  ["記録", "きろく"],
  ["閉", "と"],
  ["次", "つぎ"],
  ["章", "しょう"],
  ["今", "いま"],
  ["万", "まん"],
]);

/** ログの 色（原典の critical / hit / miss / system と 同じ 分け方）。 */
type LogTone = "normal" | "critical" | "hit" | "miss" | "system";

const LOG_COLOR: Record<LogTone, string> = {
  normal: "text-white",
  critical: "font-bold text-yellow-300",
  hit: "text-green-300",
  miss: "font-bold text-red-400",
  system: "text-blue-300",
};

interface LogLine {
  readonly id: number;
  readonly text: string;
  readonly tone: LogTone;
}

/**
 * クエストの 遊ぶ 画面 — 旧アプリ `renderMainGame` の 移植
 *
 * ## サイトの カードに 戻さない
 * 2026-09-01 の 指定「ゲーム風UIが 売り」。黒地・等幅・白い 枠の ウィンドウを 4つ
 *（ヘッダ／敵／ログ／PARTY＋COMMAND）並べる 原典の 組み立てを そのまま 使う。
 * 2026-08-31 の 移植では 中身（HP・レベル・リスク・4択・解説）は 正しく 移したのに
 * **見た目だけ** アプリの カードに 直して しまい、遊びの 手ざわりが 消えて いた。
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
  const [shake, setShake] = useState(false);
  const [modal, setModal] = useState<null | "story" | "history" | "process">(null);
  const logSeq = useRef(0);
  const logBox = useRef<HTMLDivElement | null>(null);

  /*
   * ログは **画面が 持つ**（セーブには 入れない）。セーブは 4人で 共有する 1行なので、
   * 増え続ける 文字を そこへ 混ぜると 書き込みが どんどん 重く なる。
   * 原典も 読み込み直しで ログは 消える。
   */
  const event = state.event;
  useEffect(() => {
    if (!event || !phase) return;
    const lines: { text: string; tone: LogTone }[] = [];
    if (event.kind === "turn") {
      const option = phase.options[event.optionIndex];
      const player = state.players[event.playerIndex];
      if (player) lines.push({ text: `${player.name}の 行動！`, tone: "normal" });
      if (option) lines.push({ text: option.resultText, tone: option.type });
      if (event.moneyLost > 0) {
        lines.push({ text: `お金が ${event.moneyLost}万 減った！`, tone: "miss" });
      }
      if (event.hpLost > 0 && player) {
        lines.push({ text: `${player.name}は ${event.hpLost}の ダメージ！`, tone: "miss" });
        if (player.hp <= 0) {
          lines.push({ text: `${player.name}は たおれて しまった！`, tone: "miss" });
        }
      }
      if (event.leveledUp && player) {
        lines.push({ text: `${player.name}は レベルが 上がった！`, tone: "critical" });
      }
    } else {
      lines.push({ text: "===== テスト スタート =====", tone: "system" });
      if (event.damage === 0) {
        lines.push({ text: "すごい！ バグは ひとつも なかった！", tone: "critical" });
      } else {
        lines.push({ text: `【警告】${event.risk}個の 大きな バグが 見つかった！`, tone: "miss" });
        lines.push({
          text: `やり直しだ！ お金 -${event.cost}万、みんなに ${event.damage}の ダメージ！`,
          tone: "miss",
        });
      }
    }
    setLog((prev) => [...prev, ...lines.map((line) => ({ ...line, id: (logSeq.current += 1) }))]);
    const rough =
      event.kind === "risk" ? event.damage > 0 : event.optionType === "miss" || event.hpLost > 0;
    if (rough) {
      setShake(true);
      const timer = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
    // 出来事が 変わった ときだけ 1回。state 全体を 見ると 同じ 行が 2度 積まれる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  if (!phase) return null;

  const ruby = (text: string) => <RubyText text={text} index={furigana} show={furiganaOn} />;
  const chapterLabel = phase.name.replace(/.*：/, "");

  return (
    <div
      className={`mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-1 py-3 md:p-3 ${
        shake ? "animate-[quest-shake_0.5s_ease-in-out]" : ""
      }`}
    >
      {/* ── ヘッダ: しらべる ボタンと メーター ── */}
      <QuestWindow className="!p-1.5 md:!p-2">
        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
          <QuestButton
            data-quest="story"
            onClick={() => setModal("story")}
            className="!px-2 !py-0.5 !text-[10px] md:!text-xs"
          >
            <RubyText text="物語" index={UI_FURIGANA} />
          </QuestButton>
          <QuestButton
            data-quest="history"
            onClick={() => setModal("history")}
            className="!px-2 !py-0.5 !text-[10px] md:!text-xs"
          >
            <RubyText text="記録" index={UI_FURIGANA} />
          </QuestButton>
          <QuestButton
            data-quest="process"
            onClick={() => setModal("process")}
            className="!px-2 !py-0.5 !text-[10px] md:!text-xs"
          >
            <RubyText text="工程" index={UI_FURIGANA} />
          </QuestButton>
          <span className="text-[10px] font-bold whitespace-nowrap text-yellow-400 md:text-sm">
            G: <RubyText text={`${state.budget}万`} index={UI_FURIGANA} />
          </span>
          <span className="text-[10px] font-bold whitespace-nowrap text-blue-300 md:text-sm">
            EXP: {state.teamExp}
          </span>
          <span className="text-[10px] font-bold whitespace-nowrap text-purple-400 md:text-sm">
            <RubyText text="危険" index={UI_FURIGANA} />: {state.hiddenRisk}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="max-w-[9rem] truncate text-[10px] font-bold text-slate-300 md:max-w-none md:text-sm">
              {ruby(chapterLabel)}
            </span>
            <button
              type="button"
              onClick={onToggleFurigana}
              aria-pressed={furiganaOn}
              className={`rounded border-[1.5px] px-1.5 py-0.5 text-[10px] font-bold ${
                furiganaOn
                  ? "border-yellow-300 bg-yellow-300 text-black"
                  : "border-slate-400 bg-black text-slate-300"
              }`}
            >
              ふりがな {furiganaOn ? "ON" : "OFF"}
            </button>
          </span>
        </div>
      </QuestWindow>

      {/* ── 敵 ── */}
      <QuestWindow
        className={`relative min-h-[150px] items-center justify-center overflow-hidden md:min-h-[200px] ${phaseBackground(
          phase.id,
        )}`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:30px_30px]" />
        <div className="z-10 flex w-full flex-col items-center justify-center py-2">
          <EnemyArt phaseId={phase.id} />
          <div className="mx-2 mt-1 rounded border-2 border-white bg-black/80 px-3 py-1 text-center text-[10px] font-bold tracking-widest text-white shadow-lg md:text-sm">
            {ruby(phase.enemy.name)}
          </div>
        </div>
      </QuestWindow>

      {/* ── メッセージログ ── */}
      <QuestWindow className="!p-2">
        <div
          ref={logBox}
          data-quest="log"
          className="h-16 overflow-y-auto text-xs leading-relaxed md:h-20 md:text-sm"
        >
          {log.length === 0 ? (
            <p className="text-blue-300">
              <RubyText text={`${quest.title} が 始まった！`} index={UI_FURIGANA} />
            </p>
          ) : (
            log.map((line) => (
              <p key={line.id} className={LOG_COLOR[line.tone]}>
                {ruby(line.text)}
              </p>
            ))
          )}
        </div>
      </QuestWindow>

      {/* ── PARTY と COMMAND ── */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
        <QuestWindow title="PARTY" className="!p-1.5 md:col-span-4">
          <ul className="mt-2 flex flex-col">
            {state.players.map((player, index) => {
              const turn = index === state.turn;
              return (
                <li
                  key={player.id}
                  className={`flex items-center justify-between gap-1.5 border-b border-slate-700 p-1.5 ${
                    turn ? "border-l-4 border-l-yellow-400 bg-slate-800" : ""
                  } ${isAlive(player) ? "" : "opacity-40 grayscale"}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className="w-3 shrink-0 text-yellow-400">
                      {turn ? "▶" : ""}
                    </span>
                    <PlayerFace player={player} size={26} bob={turn} />
                    <span className="truncate text-xs font-bold text-white">{player.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[10px] text-slate-300">
                    <span>Lv{player.level}</span>
                    <span
                      className={player.hp < player.maxHp * 0.3 ? "text-red-400" : "text-white"}
                    >
                      HP {player.hp}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </QuestWindow>

        <QuestWindow
          title={state.event ? "RESULT" : state.chosen.length === 0 ? "STORY" : "COMMAND"}
          className="!p-2 md:col-span-8"
        >
          <PhaseBody
            key={state.phaseIndex}
            quest={quest}
            state={state}
            dispatch={dispatch}
            ruby={ruby}
          />
        </QuestWindow>
      </div>

      {modal ? (
        <QuestModal
          title={modal === "story" ? "STORY" : modal === "history" ? "HISTORY" : "PROCESS CHART"}
          onClose={() => setModal(null)}
        >
          {modal === "story" ? (
            <div className="space-y-3 text-left text-xs leading-relaxed text-slate-200 md:text-sm">
              <p>{ruby(quest.description)}</p>
              <p className="text-yellow-300">{ruby(quest.focus)}</p>
            </div>
          ) : modal === "history" ? (
            <div className="space-y-1 text-left text-xs leading-relaxed md:text-sm">
              {log.length === 0 ? (
                <p className="text-slate-400">まだ ありません。</p>
              ) : (
                log.map((line) => (
                  <p key={line.id} className={LOG_COLOR[line.tone]}>
                    {ruby(line.text)}
                  </p>
                ))
              )}
            </div>
          ) : (
            <ProcessChart quest={quest} state={state} ruby={ruby} />
          )}
        </QuestModal>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * COMMAND ウィンドウの 中身
 * ------------------------------------------------------------------ */

/**
 * 会話 → 4択 → 解説。**1つの ウィンドウに 1つだけ**出す
 *（constraints「1画面1文・1コマ1情報」）。
 *
 * 会話は 場面の 頭でだけ 流す。外して 同じ 場面に 戻った ときに 話が 巻き戻ると、
 * 「進んで いない」ように 見える——だから **まだ 1つも 押して いない ときだけ**。
 */
function PhaseBody({
  quest,
  state,
  dispatch,
  ruby,
}: {
  quest: Quest;
  state: QuestState;
  dispatch: (action: QuestAction) => void;
  ruby: (text: string) => React.ReactNode;
}) {
  const phase = currentPhase(quest, state);
  const [line, setLine] = useState(0);
  if (!phase) return null;

  const event = state.event;

  /* 1) 隠れリスクの 爆発（第8章の 入口） */
  if (event?.kind === "risk") {
    return (
      <div data-quest="risk" className="mt-1 flex flex-col gap-3">
        <p className="text-lg font-bold text-red-300">
          {event.damage === 0 ? "🎉 バグは ひとつも なかった！" : "💥 たまって いた バグが 出た！"}
        </p>
        {event.damage > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs font-bold text-white">
            <li className="rounded border border-slate-600 px-2 py-1">⚠ {event.risk}</li>
            <li className="rounded border border-slate-600 px-2 py-1">💔 -{event.damage}</li>
            <li className="rounded border border-slate-600 px-2 py-1">💰 -{event.cost} G</li>
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-slate-200">
            <RubyText
              text="ここまで ていねいに 進めた ぶんが、そのまま 返って きました。"
              index={UI_FURIGANA}
            />
          </p>
        )}
        <QuestButton tone="primary" data-quest="next" onClick={() => dispatch({ type: "advance" })}>
          <RubyText text="次へ" index={UI_FURIGANA} />
        </QuestButton>
      </div>
    );
  }

  /* 2) えらんだ あとの 解説（当たっても 外しても 必ず 読ませる） */
  if (event?.kind === "turn") {
    const option = phase.options[event.optionIndex];
    if (!option) return null;
    return (
      <div className="mt-1 flex flex-col gap-3">
        <p
          className={`text-sm leading-relaxed font-bold break-words md:text-base ${
            LOG_COLOR[event.optionType]
          }`}
        >
          {ruby(option.resultText)}
        </p>
        <p className="max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-900/80 p-2 text-xs leading-relaxed text-white md:text-sm">
          {ruby(option.explanation)}
        </p>
        <QuestButton tone="primary" data-quest="next" onClick={() => dispatch({ type: "advance" })}>
          <RubyText text="次の 一手" index={UI_FURIGANA} />
        </QuestButton>
      </div>
    );
  }

  /* 3) 場面の 頭の 会話（1行ずつ・hero は メンバーに 順番で 回る） */
  if (state.chosen.length === 0 && line < phase.dialogue.length) {
    const current = phase.dialogue[line];
    if (!current) return null;
    const heroOrdinal = phase.dialogue
      .slice(0, line)
      .filter((item) => item.speaker === "hero").length;
    const hero =
      state.players[heroSpeakerIndex(state.phaseIndex, heroOrdinal, state.players.length)];

    return (
      <button
        type="button"
        data-quest="next"
        onClick={() => setLine((value) => value + 1)}
        className="mt-1 flex w-full flex-col rounded border border-slate-700 bg-slate-900 p-3 text-left shadow-inner transition-colors hover:bg-slate-800"
      >
        {current.speaker === "system" ? (
          <span className="text-sm leading-relaxed text-slate-300">{ruby(current.text)}</span>
        ) : (
          <>
            <span className="mb-2 flex items-center gap-2 border-b border-slate-700 pb-1 font-bold text-yellow-400">
              {current.speaker === "hero" ? (
                <>
                  {hero ? <PlayerFace player={hero} size={24} /> : null}
                  <span className="truncate">{hero?.name ?? "あなた"}</span>
                </>
              ) : (
                <>
                  <span aria-hidden className="text-xl leading-none">
                    {SPEAKER_ART[current.speaker]}
                  </span>
                  <span>{ruby(SPEAKER_NAME[current.speaker])}</span>
                </>
              )}
            </span>
            <span className="text-sm leading-relaxed text-white md:text-base">
              {ruby(current.text)}
            </span>
          </>
        )}
        <span className="mt-2 animate-pulse text-right text-xs text-slate-500">
          <RubyText text="おして 次へ ▶" index={UI_FURIGANA} />
        </span>
      </button>
    );
  }

  /* 4) 4択。押した 札は 消える（同じ 手を 2度 数えない） */
  const player = currentPlayer(state);
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/80 p-2 text-xs leading-relaxed font-bold text-white md:text-sm">
        {player ? <PlayerFace player={player} size={24} bob /> : null}
        <span className="truncate text-yellow-400">{player?.name}</span>
        <span className="min-w-0 flex-1">{ruby(phase.question)}</span>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {phase.options.map((option, index) =>
          state.chosen.includes(index) ? null : (
            <li key={index}>
              <button
                type="button"
                data-quest="option"
                onClick={() => dispatch({ type: "choose", optionIndex: index })}
                className="flex h-full w-full items-start gap-1.5 rounded border-[1.5px] border-slate-500 bg-black p-2 text-left text-xs leading-relaxed font-bold break-words text-white transition-colors hover:border-white hover:bg-slate-800 md:text-sm"
              >
                <span aria-hidden className="mt-[3px] shrink-0 text-[10px] text-slate-500">
                  ▶
                </span>
                <span className="min-w-0">{ruby(option.text)}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * しらべる 画面（原典の 3つの モーダル）
 * ------------------------------------------------------------------ */

function QuestModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-quest="modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <QuestWindow className="w-full max-w-md !bg-slate-900 shadow-[0_0_30px_rgba(40,40,60,0.8)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
          <h3 className="text-base font-bold tracking-widest text-teal-400 md:text-lg">{title}</h3>
          <button
            type="button"
            aria-label="とじる"
            onClick={onClose}
            className="text-2xl leading-none text-slate-400 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto pr-1">{children}</div>
        <QuestButton onClick={onClose} className="mt-3 w-full">
          <RubyText text="閉じる" index={UI_FURIGANA} />
        </QuestButton>
      </QuestWindow>
    </div>
  );
}

/**
 * 工程の 一覧（原典 `renderProcessModal` の 移植）。
 *
 * 章の 名前は **データから 集める**——原典は 9つを ソースに 直書きして いて、
 * 第10章「保守」が 抜けて いた。
 */
function ProcessChart({
  quest,
  state,
  ruby,
}: {
  quest: Quest;
  state: QuestState;
  ruby: (text: string) => React.ReactNode;
}) {
  const chapters: { num: number; name: string }[] = [];
  for (const phase of quest.phases) {
    const match = /第(\d+)章/.exec(phase.name);
    const num = match ? Number(match[1]) : 0;
    if (num > 0 && !chapters.some((item) => item.num === num)) {
      chapters.push({ num, name: phase.chapter });
    }
  }
  chapters.sort((a, b) => a.num - b.num);

  const now = quest.phases[state.phaseIndex]?.name ?? "";
  const nowNum = Number(/第(\d+)章/.exec(now)?.[1] ?? 1);

  return (
    <div className="text-left">
      <p className="mb-3 text-xs text-slate-300">
        <RubyText text="いま どこを 進んで いるかの 図です。" index={UI_FURIGANA} />
      </p>
      <ol className="flex flex-col gap-1.5">
        {chapters.map((chapter) => {
          const past = chapter.num < nowNum;
          const current = chapter.num === nowNum;
          const tone = current
            ? "border-yellow-300 bg-yellow-600 text-white shadow-[0_0_15px_rgba(253,224,71,0.5)]"
            : past
              ? "border-teal-500 bg-teal-900 text-teal-300"
              : "border-slate-700 bg-slate-800 text-slate-500";
          return (
            <li key={chapter.num} className="flex items-center gap-3">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${tone}`}
              >
                {past ? "✓" : chapter.num}
              </span>
              <span
                className={`min-w-0 flex-1 rounded border p-2 text-sm font-bold tracking-wider ${tone}`}
              >
                {ruby(chapter.name)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
