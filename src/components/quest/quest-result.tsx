"use client";

import type { Quest } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import type { QuestState } from "@/lib/quest/state";
import { PlayerFace } from "./quest-art";

const UI_FURIGANA = buildFuriganaIndex([
  ["場面", "ばめん"],
  ["進", "すす"],
  ["仲間", "なかま"],
  ["一年", "いちねん"],
  ["最後", "さいご"],
  ["続", "つづ"],
  ["遊", "あそ"],
]);

/**
 * 終わりの 画面
 *
 * ## 手ぶらで 帰さない
 * 途中で 終わった ときも、**そこまでに 進んだ 場面の 数**を まず 大きく 出す
 *（設計01 P8「0点でも ほめ要素を 1つ 作る」）。そのうえで **次の 一手**を 1つだけ
 * 置く——うまく いかなかった 理由を 並べても、次に 何を するかは 増えない。
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
    <section className="card-island p-5 sm:p-6">
      <p aria-hidden className="text-center text-6xl leading-none">
        {cleared ? "🏆" : "🌱"}
      </p>
      <h2 className="text-navy mt-2 text-center text-2xl font-black">
        {cleared ? "クリア！" : "ここまで 進みました"}
      </h2>

      <p className="text-ink mt-3 text-center text-lg font-black">
        <RubyText
          text={`場面 ${state.clearedPhases} / ${quest.phases.length}`}
          index={UI_FURIGANA}
        />
      </p>

      <ul className="text-ink mt-4 flex flex-wrap justify-center gap-2 text-sm font-black">
        <li className="bg-panel-tint rounded-full px-3 py-1">💰 {state.budget} G</li>
        <li className="bg-panel-tint rounded-full px-3 py-1">⭐ EXP {state.teamExp}</li>
        <li className="bg-panel-tint rounded-full px-3 py-1">⚠ リスク {state.hiddenRisk}</li>
      </ul>

      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {state.players.map((player) => (
          <li
            key={player.id}
            className="border-hairline bg-panel flex items-center gap-2 rounded-2xl border-2 p-2"
          >
            <PlayerFace player={player} size={40} />
            <span className="min-w-0">
              <span className="text-ink block truncate text-xs font-black">{player.name}</span>
              <span className="text-ink-soft text-[10px] font-bold">
                Lv {player.level} ・ {player.hp} / {player.maxHp}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="bg-panel-tint text-ink mt-5 rounded-2xl px-4 py-3 leading-relaxed font-bold">
        {cleared ? (
          <RubyText
            text="🎯 1年ぶんの 仕事を 最後まで 進めました。もういちど 遊ぶと、もっと 良い 手が 見つかります。"
            index={UI_FURIGANA}
          />
        ) : reason === "budget" ? (
          <RubyText
            text="🎯 次は お金の 減りかたを 見ながら 進みましょう。早く 見つけるほど、お金が 残ります。"
            index={UI_FURIGANA}
          />
        ) : (
          <RubyText
            text="🎯 次は 上流（さいしょの 章）で ていねいに 聞きましょう。⚠ が 小さいほど、あとが 楽に なります。"
            index={UI_FURIGANA}
          />
        )}
      </p>

      <div className="mt-5 flex justify-center">
        <button
          type="button"
          data-quest="restart"
          onClick={onRestart}
          className="btn-game px-6 py-3 [--btn-face:#f26fa7] [--btn-shadow:#d94d84]"
        >
          <RubyText text="もういちど 遊ぶ" index={UI_FURIGANA} />
        </button>
      </div>
    </section>
  );
}
