"use client";

import type { Quest } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import type { QuestState } from "@/lib/quest/state";
import { PlayerFace } from "./quest-art";
import { QuestWindow } from "./quest-window";

const UI_FURIGANA = buildFuriganaIndex([
  ["場面", "ばめん"],
  ["進", "すす"],
  ["仲間", "なかま"],
  ["最後", "さいご"],
  ["続", "つづ"],
  ["遊", "あそ"],
  ["最終", "さいしゅう"],
  ["残高", "ざんだか"],
  ["全体", "ぜんたい"],
  ["無事", "ぶじ"],
  ["君", "きみ"],
  ["本当", "ほんとう"],
  ["闇", "やみ"],
  ["飲", "の"],
  ["直", "なお"],
]);

/**
 * 終わりの 画面 — 旧アプリ `renderEndScreen` の 移植
 *
 * ## 手ぶらで 帰さない
 * 途中で 終わった ときも、**そこまでに 進んだ 場面の 数**を まず 大きく 出す
 *（設計01 P8「0点でも ほめ要素を 1つ 作る」）。そのうえで **次の 一手**を 1つだけ
 * 置く——うまく いかなかった 理由を 並べても、次に 何を するかは 増えない。
 *
 * 原典の「GAME OVER」の 見た目（赤い ドクロと 大きな 字）は そのまま 使う。
 * ゲーム風UIが 売り（2026-09-01 の 指定）で、**負けの 画面も ゲームの 一部**である。
 * ただし ことばは 前向きに する（絶対規律1）。
 */
export function QuestResult({
  quest,
  state,
  onRestart,
}: {
  quest: Quest;
  state: QuestState;
  onRestart: () => void;
}) {
  const cleared = state.status.kind === "cleared";
  const reason = state.status.kind === "over" ? state.status.reason : null;

  return (
    <div className="flex items-start justify-center px-2 py-6">
      <QuestWindow className="w-full max-w-2xl text-center">
        <p aria-hidden className="mt-2 text-6xl leading-none">
          {cleared ? "🏆" : "🌱"}
        </p>
        <h2
          className={`mt-2 text-3xl font-black tracking-widest ${
            cleared ? "text-yellow-400" : "text-sky-300"
          }`}
        >
          {cleared ? "PROJECT CLEAR!" : "TO BE CONTINUED"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white">
          {cleared ? (
            <RubyText
              text="無事に システムを リリースした！ 君たちは 本当の プロだ！"
              index={UI_FURIGANA}
            />
          ) : reason === "budget" ? (
            <RubyText
              text="お金が つきた ところで 一度 おわり。つぎは もっと 早く 相談してみよう。"
              index={UI_FURIGANA}
            />
          ) : (
            <RubyText
              text="ここで 一度 おわり。つぎは 体力の 減りかたを 見ながら 進もう。"
              index={UI_FURIGANA}
            />
          )}
        </p>

        <p className="mt-4 text-lg font-black text-white">
          <RubyText
            text={`場面 ${state.clearedPhases} / ${quest.phases.length}`}
            index={UI_FURIGANA}
          />
        </p>

        {/* 最終ステータス */}
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left">
          <h3 className="mb-2 border-b border-slate-700 pb-1 text-sm font-bold text-yellow-300">
            <RubyText text="最終ステータス" index={UI_FURIGANA} />
          </h3>
          <div className="flex flex-col gap-2 text-xs md:text-sm">
            <div className="flex items-center justify-between rounded border border-slate-800 bg-black p-2">
              <span className="text-slate-300">
                <RubyText text="最終の 残高" index={UI_FURIGANA} />
              </span>
              <span className="font-bold text-yellow-400">{state.budget} 万G</span>
            </div>
            <div className="flex items-center justify-between rounded border border-slate-800 bg-black p-2">
              <span className="text-slate-300">
                <RubyText text="全体EXP" index={UI_FURIGANA} />
              </span>
              <span className="font-bold text-blue-300">{state.teamExp}</span>
            </div>
            <div className="flex items-center justify-between rounded border border-slate-800 bg-black p-2">
              <span className="text-slate-300">⚠ リスク</span>
              <span className="font-bold text-purple-400">{state.hiddenRisk}</span>
            </div>
          </div>

          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {state.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-2 rounded border border-slate-700 bg-black p-2"
              >
                <PlayerFace player={player} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between text-xs">
                    <span className="truncate font-bold text-white">{player.name}</span>
                    <span className="font-bold whitespace-nowrap text-yellow-400">
                      Lv{player.level}
                    </span>
                  </span>
                  <span className="flex justify-between text-[10px] text-slate-300">
                    <span>
                      HP <span className="font-bold text-green-400">{player.hp}</span>
                    </span>
                    <span>
                      EX <span className="font-bold text-blue-300">{player.exp}</span>
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          data-quest="restart"
          onClick={onRestart}
          className="mt-5 w-full rounded border-2 border-white bg-blue-800 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
        >
          <RubyText text="もう一度 遊ぶ" index={UI_FURIGANA} />
        </button>
      </QuestWindow>
    </div>
  );
}
