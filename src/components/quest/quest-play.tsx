"use client";

import { useState } from "react";
import type { Quest, QuestOption } from "@/content/schema";
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
import { ENEMY_ART, PlayerFace, SPEAKER_ART, SPEAKER_NAME } from "./quest-art";

/** 画面の ことばの 読みは 画面が 持つ（教材の 読み辞書とは 混ぜない）。 */
const UI_FURIGANA = buildFuriganaIndex([
  ["場面", "ばめん"],
  ["一手", "いって"],
  ["次", "つぎ"],
  ["手", "て"],
  ["良", "よ"],
  ["探", "さが"],
  ["危険", "きけん"],
  ["体力", "たいりょく"],
  ["読", "よ"],
]);

/**
 * えらんだ 直後の 見出し。**正誤の 札では なく、次に 向かう ことば**にする
 *（設計01 P8。「不正解」「間違い」「ダメ」は 使わない — 絶対規律1）。
 */
const RESULT_HEADING: Record<QuestOption["type"], string> = {
  critical: "🌟 いちばん 良い 手！",
  hit: "✅ 良い 手！",
  miss: "🔭 べつの 手を 探そう",
};

/**
 * クエストの 遊ぶ 画面（会話 → 4択 → 解説）
 *
 * ## 4択を 押したら 必ず 解説を 読む
 * 当たっても 外しても、次へ 進む 前に **解説の カードを 1枚 はさむ**
 *（設計01 P8 アンチパターン②「正解をすぐ表示して次の問題へ進む」）。
 * 進める ボタンは カードの 中にしか 無いので、飛ばせない。
 *
 * ## メーターは G / EXP / ⚠ の 3つ
 * 時計は 出さない。この ゲームで 減るのは 時間では なく **お金と 体力**で、
 * 溜まるのは **隠れリスク**である。⚠ は 原典どおり 画面に 出す——
 * 見えて いる のに 触れない ものが、第8章で 返って くる のが 効く（設計01 P9）。
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
  if (!phase) return null;

  const ruby = (text: string) => <RubyText text={text} index={furigana} show={furiganaOn} />;

  return (
    <div className="flex flex-col gap-3">
      {/* メーター。390px でも 3つが 1行に 収まる 大きさにする */}
      <section className="card-island flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-soft text-xs font-black">
            <RubyText
              text={`場面 ${state.phaseIndex + 1} / ${quest.phases.length}`}
              index={UI_FURIGANA}
            />
          </p>
          <button
            type="button"
            onClick={onToggleFurigana}
            aria-pressed={furiganaOn}
            className={`rounded-full border-2 px-3 py-1 text-[11px] font-extrabold ${
              furiganaOn ? "bg-sky border-sky text-white" : "border-hairline text-ink-soft bg-panel"
            }`}
          >
            ふりがな {furiganaOn ? "ON" : "OFF"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Meter icon="💰" label="G" value={state.budget} accent="#f0a819" />
          <Meter icon="⭐" label="EXP" value={state.teamExp} accent="#4fa8e8" />
          <Meter icon="⚠" label="リスク" value={state.hiddenRisk} accent="#d94d84" />
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {state.players.map((player, index) => {
            const turn = index === state.turn;
            return (
              <li
                key={player.id}
                className={`flex items-center gap-2 rounded-2xl border-2 p-2 ${
                  turn ? "border-coral bg-panel-tint" : "border-hairline bg-panel"
                } ${isAlive(player) ? "" : "opacity-45"}`}
              >
                <PlayerFace player={player} size={36} bob={turn} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-xs font-black">{player.name}</span>
                  <span className="bg-sky-soft mt-1 block h-2 w-full overflow-hidden rounded-full">
                    <span
                      className="block h-full rounded-full bg-[#58c273] transition-[width]"
                      style={{ width: `${Math.round((player.hp / player.maxHp) * 100)}%` }}
                    />
                  </span>
                  <span className="text-ink-soft text-[10px] font-bold">
                    {player.hp} / {player.maxHp} ・ Lv {player.level}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 相手役。絵文字を 大きく 出す（絵に 差しかえる 日まで quest-art.tsx が 持つ） */}
      <section className="card-island flex items-center gap-3 p-4">
        <span aria-hidden className="text-5xl leading-none sm:text-6xl">
          {ENEMY_ART[phase.enemy.art]}
        </span>
        <div className="min-w-0">
          <p className="text-ink text-lg font-black break-words">{ruby(phase.enemy.name)}</p>
          <p className="text-ink-soft text-xs font-bold break-words">{ruby(phase.name)}</p>
          <p className="text-ink-soft text-xs font-bold break-words">{ruby(phase.desc)}</p>
        </div>
      </section>

      <PhaseBody
        key={state.phaseIndex}
        quest={quest}
        state={state}
        dispatch={dispatch}
        ruby={ruby}
      />
    </div>
  );
}

function Meter({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <span className="border-hairline bg-panel flex flex-col items-center rounded-2xl border-2 px-1 py-2">
      <span className="text-[10px] font-black tracking-widest text-[#5a7089]">
        <span aria-hidden>{icon}</span> {label}
      </span>
      <span className="text-lg leading-none font-black" style={{ color: accent }}>
        {value}
      </span>
    </span>
  );
}

/**
 * 会話 → 4択 → 解説。**1画面に 1つだけ**出す
 *（constraints「1画面1文・1コマ1情報」。長い 文を ならべない）。
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
      <section data-quest="risk" className="card-island border-coral border-4 p-5">
        <p className="text-navy text-xl font-black">
          {event.damage === 0 ? "🎉 バグは ひとつも なかった！" : "💥 たまって いた バグが 出た！"}
        </p>
        {event.damage === 0 ? (
          <p className="text-ink mt-2 font-bold">
            <RubyText
              text="ここまで ていねいに 進めた ぶんが、そのまま 返って きました。"
              index={UI_FURIGANA}
            />
          </p>
        ) : (
          <ul className="text-ink mt-3 flex flex-wrap gap-2 text-sm font-black">
            <li className="bg-panel-tint rounded-full px-3 py-1">
              ⚠ {event.risk} → <span aria-hidden>💔</span> -{event.damage}
            </li>
            <li className="bg-panel-tint rounded-full px-3 py-1">
              <span aria-hidden>💰</span> -{event.cost} G
            </li>
          </ul>
        )}
        <button
          type="button"
          data-quest="next"
          onClick={() => dispatch({ type: "advance" })}
          className="btn-game mt-4 px-6 py-3 [--btn-face:#4fa8e8] [--btn-shadow:#0272ae]"
        >
          <RubyText text="次へ" index={UI_FURIGANA} />
        </button>
      </section>
    );
  }

  /* 2) えらんだ あとの 解説（正誤に かかわらず 必ず 読ませる） */
  if (event?.kind === "turn") {
    const option = phase.options[event.optionIndex];
    const player = state.players[event.playerIndex];
    if (!option) return null;
    return (
      <section className="card-island p-5">
        <p className="text-navy text-lg font-black break-words">
          {RESULT_HEADING[event.optionType]}
        </p>
        <p className="text-ink mt-2 leading-relaxed font-bold break-words">
          {ruby(option.resultText)}
        </p>

        <ul className="text-ink mt-3 flex flex-wrap gap-2 text-xs font-black">
          {event.exp > 0 ? (
            <li className="bg-sky-soft rounded-full px-3 py-1">⭐ EXP +{event.exp}</li>
          ) : null}
          {event.hpLost > 0 ? (
            <li className="bg-panel-tint rounded-full px-3 py-1">
              💔 {player?.name} -{event.hpLost}
            </li>
          ) : null}
          {event.moneyLost > 0 ? (
            <li className="bg-panel-tint rounded-full px-3 py-1">💰 -{event.moneyLost} G</li>
          ) : null}
          {event.riskDelta !== 0 ? (
            <li className="bg-panel-tint rounded-full px-3 py-1">
              ⚠ {event.riskDelta > 0 ? `+${event.riskDelta}` : event.riskDelta}
            </li>
          ) : null}
          {event.leveledUp ? (
            <li className="rounded-full bg-[#ffe9a8] px-3 py-1">🎊 レベルアップ！</li>
          ) : null}
        </ul>

        <p className="bg-panel-tint text-ink mt-4 rounded-2xl px-4 py-3 leading-relaxed font-bold break-words">
          {ruby(option.explanation)}
        </p>

        <button
          type="button"
          data-quest="next"
          onClick={() => dispatch({ type: "advance" })}
          className="btn-game mt-4 px-6 py-3 [--btn-face:#58c273] [--btn-shadow:#3aa458]"
        >
          <RubyText text="次の 一手" index={UI_FURIGANA} />
        </button>
      </section>
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
      <section className="card-island p-5">
        {current.speaker === "system" ? (
          <p className="text-ink-soft text-center leading-relaxed font-bold break-words">
            {ruby(current.text)}
          </p>
        ) : (
          <div className="flex items-start gap-3">
            {current.speaker === "hero" ? (
              hero ? (
                <PlayerFace player={hero} size={52} />
              ) : null
            ) : (
              <span aria-hidden className="text-4xl leading-none">
                {SPEAKER_ART[current.speaker]}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-ink-soft text-xs font-black break-words">
                {current.speaker === "hero"
                  ? (hero?.name ?? "あなた")
                  : ruby(SPEAKER_NAME[current.speaker])}
              </p>
              <p className="text-ink mt-1 leading-relaxed font-bold break-words">
                {ruby(current.text)}
              </p>
            </div>
          </div>
        )}

        <button
          type="button"
          data-quest="next"
          onClick={() => setLine((value) => value + 1)}
          className="btn-game mt-4 px-6 py-3 [--btn-face:#4fa8e8] [--btn-shadow:#0272ae]"
        >
          <RubyText text="次へ" index={UI_FURIGANA} />
        </button>
      </section>
    );
  }

  /* 4) 4択。押した 札は 消える（同じ 手を 2度 数えない） */
  const player = currentPlayer(state);
  return (
    <section className="card-island p-5">
      <div className="flex items-center gap-2">
        {player ? <PlayerFace player={player} size={40} bob /> : null}
        <p className="text-ink-soft text-xs font-black">
          <span className="text-ink">{player?.name}</span> の ばん
        </p>
      </div>

      <p className="text-navy mt-2 text-lg leading-relaxed font-black break-words">
        {ruby(phase.question)}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {phase.options.map((option, index) =>
          state.chosen.includes(index) ? null : (
            <li key={index}>
              <button
                type="button"
                data-quest="option"
                onClick={() => dispatch({ type: "choose", optionIndex: index })}
                className="border-hairline bg-panel text-ink hover:border-sky w-full rounded-2xl border-2 px-4 py-3 text-left leading-relaxed font-bold break-words"
              >
                {ruby(option.text)}
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
