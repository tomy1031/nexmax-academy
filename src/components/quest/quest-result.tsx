"use client";
/* eslint-disable @next/next/no-img-element -- ドット絵は next/image に 通さない。縮小・再圧縮で ドットが にじむ うえ、1枚 数KB の PNG なので 最適化の 得も 無い */

import type { Quest } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import type { QuestState } from "@/lib/quest/state";
import { PlayerFace, playerSprite, questIcon } from "./quest-art";
import { QuestButton, QuestWindow } from "./quest-window";

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
  ["一度", "いちど"],
  ["相談", "そうだん"],
  ["体力", "たいりょく"],
  ["早", "はや"],
  ["減", "へ"],
  ["見", "み"],
  ["金", "かね"],
  ["万", "まん"],
  ["救済措置", "きゅうさいそち"],
  ["合計", "ごうけい"],
  ["最終利益", "さいしゅうりえき"],
  ["真", "しん"],
  ["最初", "さいしょ"],
  ["失敗", "しっぱい"],
]);

/**
 * 終わりの 画面 — 旧アプリ `renderEndScreen` の 移植
 *
 * ## 言葉は 原典の まま
 * 倒れたら「GAME OVER」「クエストは 失敗した…」。移植の ときに「TO BE CONTINUED」と
 * 前向きな 言い方に 変えて いたが、2026-10-21 に tomy さんが「無理して ポジティブっぽく
 * するのは 気持ち悪い」として 原典に 戻した。結果は はっきり 書き（必ず守るルール 1）、
 * 次に する ことは「やり直す（コンティニュー）」の ボタンで 示す。
 *
 * ゲーム風UIが 売り（2026-09-01 の 指定）で、**負けの 画面も ゲームの 一部**である。
 * 2026-10-20 から ドット絵の RPG の 見た目（仲間の ネクマックスが 並び、クリアなら 跳ねる）。
 */
export function QuestResult({
  quest,
  state,
  onRestart,
  onContinue,
}: {
  quest: Quest;
  state: QuestState;
  onRestart: () => void;
  /** 倒れた あとの「やり直す」（反省クイズへ）。クリアの ときは 出さない。 */
  onContinue: () => void;
}) {
  const cleared = state.status.kind === "cleared";

  return (
    <div className="qx-end">
      <QuestWindow className="!px-4 !py-5 text-center">
        <ul className="flex flex-wrap items-end justify-center gap-2" aria-hidden>
          {state.players.map((player) => (
            <li key={player.id}>
              <img
                className={`qx-px h-16 w-16 ${cleared ? "animate-bounce" : "opacity-70"}`}
                src={playerSprite(player)}
                alt=""
              />
            </li>
          ))}
        </ul>
        <h2 className={`qx-end-title mt-3 ${cleared ? "text-[#ffd84a]" : "text-[#ff6464]"}`}>
          {cleared ? "PROJECT CLEAR!" : "GAME OVER"}
        </h2>
        <p className="qx-t mt-3 text-sm leading-relaxed">
          {cleared ? (
            <RubyText
              text="無事に システムを リリースした！ 君たちは 本当の プロだ！"
              index={UI_FURIGANA}
            />
          ) : (
            // 原典の 文（2026-10-21 tomy さん「無理して ポジティブっぽく するのは 気持ち悪い」）
            <RubyText
              text="クエストは 失敗した…ウォーターフォールの 闇に 飲まれたのだ。"
              index={UI_FURIGANA}
            />
          )}
        </p>

        <p className="mt-4 text-xl">
          <RubyText
            text={`場面 ${state.clearedPhases} / ${quest.phases.length}`}
            index={UI_FURIGANA}
          />
        </p>
      </QuestWindow>

      {/* 最終ステータス */}
      <QuestWindow
        title={<RubyText text="最終ステータス" index={UI_FURIGANA} />}
        className="!px-3 !pt-5 !pb-3"
      >
        <ul className="qx-stats">
          <li>
            <span className="flex items-center gap-2 text-[#8d96b4]">
              <img className="qx-px" src={questIcon("coin")} alt="" />
              <RubyText text="最終の 残高" index={UI_FURIGANA} />
            </span>
            <span className="text-[#ffd84a]">
              <RubyText text={`${state.budget} 万`} index={UI_FURIGANA} />
            </span>
          </li>
          {cleared && state.relief > 0 ? (
            <li>
              <span className="flex items-center gap-2 text-[#8d96b4]">
                <img className="qx-px" src={questIcon("coin")} alt="" />
                <RubyText text="救済措置の 合計" index={UI_FURIGANA} />
              </span>
              <span className="text-[#ff6464]">
                <RubyText text={`- ${state.relief} 万`} index={UI_FURIGANA} />
              </span>
            </li>
          ) : null}
          {cleared ? (
            // 原典の「真の 最終利益」＝ 残高から 特別救済で もらった ぶんを 引いた もの
            <li>
              <span className="flex items-center gap-2 text-white">
                <img className="qx-px" src={questIcon("coin")} alt="" />
                <RubyText text="真の 最終利益" index={UI_FURIGANA} />
              </span>
              <span
                className={state.budget - state.relief >= 0 ? "text-[#74e886]" : "text-[#ff6464]"}
              >
                <RubyText text={`${state.budget - state.relief} 万`} index={UI_FURIGANA} />
              </span>
            </li>
          ) : null}
          <li>
            <span className="flex items-center gap-2 text-[#8d96b4]">
              <img className="qx-px" src={questIcon("star")} alt="" />
              <RubyText text="全体EXP" index={UI_FURIGANA} />
            </span>
            <span className="text-[#8ccdff]">{state.teamExp}</span>
          </li>
          <li>
            <span className="flex items-center gap-2 text-[#8d96b4]">
              <img className="qx-px" src={questIcon("bug")} alt="" />
              たまったバグ
            </span>
            <span className="text-[#cfa6ff]">{state.hiddenRisk}</span>
          </li>
        </ul>

        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {state.players.map((player) => (
            <li key={player.id} className="flex items-center gap-2 border border-[#262d47] p-2">
              <PlayerFace player={player} size={30} />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between text-xs">
                  <span className="truncate">{player.name}</span>
                  <span className="whitespace-nowrap text-[#ffd84a]">Lv{player.level}</span>
                </span>
                <span className="flex justify-between text-[11px] text-[#8d96b4]">
                  <span>
                    HP <span className="text-[#74e886]">{player.hp}</span>
                  </span>
                  <span>
                    EXP <span className="text-[#8ccdff]">{player.exp}</span>
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </QuestWindow>

      {cleared ? (
        <QuestButton tone="blue" data-quest="restart" onClick={onRestart}>
          <RubyText text="もう一度 遊ぶ" index={UI_FURIGANA} />
        </QuestButton>
      ) : (
        <div className="grid gap-3">
          {/*
           * 原典の「やり直す（コンティニュー）」。その回に 外した 問題の 反省クイズを 解くと、
           * 倒れた 人が 全回復して その 場面の 最初から（お金が 尽きて いたら 特別救済）。
           */}
          <QuestButton tone="primary" data-quest="continue" onClick={onContinue}>
            <RubyText text="やり直す（コンティニュー）" index={UI_FURIGANA} />
          </QuestButton>
          <QuestButton data-quest="restart" onClick={onRestart} className="w-full !py-2">
            <RubyText text="最初から 遊ぶ" index={UI_FURIGANA} />
          </QuestButton>
        </div>
      )}
    </div>
  );
}
