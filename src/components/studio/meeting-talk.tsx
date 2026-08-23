"use client";

import { useState } from "react";
import type { Character, Meeting } from "@/content/schema";
import { MeetingSession } from "@/components/meeting/meeting-session";
import { TalkGameSession } from "@/components/talk-game/talk-game-session";
import { clearMeetingResume } from "@/lib/meeting/resume";
import { MiniButton, StudioSection } from "./studio-ui";

/**
 * **下書きの ままで、じっさいに 話して みる**
 *
 * ## なぜ 会話を まねた ものを 作らないか
 * 判定の 1往復を ためす パネル（`meeting-try.tsx`）では、**会話に ならない**。
 * 相手の こえ・つなぎ直し・字幕・札の 開き方——先生が いちばん 見たいのは
 * そこ なのに、そこだけ 別の 作りで まねると「ためした ものと 学習者が 見る ものが
 * ちがう」に なる（2026-08-22「対話の テストが したかった」）。
 *
 * だから **学習者の 画面（`MeetingSession`）を そのまま 置く**。写しでは なく 本物なので、
 * ここで 起きた ことは 学習者にも 起きる。直しは 1か所で 済む。
 *
 * ## 学習者の きろくを 汚さない
 * 進みぐあい・しおり・ハートは **教材の ID を 鍵に して** 端末に 残る。下書きを
 * そのまま 渡すと、先生の ためしが 先生自身の 学習の きろくを 上書きする。
 * ID の 前に `preview-` を つけて **別の 鍵**に し、始める たびに 消す。
 *
 * ## 下書きは 始める ときに 凍らせる
 * 打つ たびに 部品が 作り直されると、会話が 1文字ごとに 切れる。
 * 「話して みる」を 押した ときの 中身で 固定し、直したら もう一度 押して もらう。
 */

export function MeetingTalkPanel({ value, cast }: { value: Meeting; cast: readonly Character[] }) {
  /** 始めた ときの 下書き（会話の あいだは 動かさない）。 */
  const [snapshot, setSnapshot] = useState<Meeting | null>(null);
  const host = cast.find((person) => person.id === value.host.id);

  function start() {
    const preview: Meeting = { ...value, id: `preview-${value.id}` };
    // 前の ためしの つづきから 始めない（毎回 1問目から 確かめたい）
    clearMeetingResume(preview.id);
    setSnapshot(preview);
  }

  return (
    <StudioSection
      title="話して みる（下書きの まま）"
      hint="学習者と 同じ 画面を そのまま 出します。ここで 起きる ことは、学習者にも 起きます。"
      right={
        snapshot ? (
          <MiniButton tone="danger" onClick={() => setSnapshot(null)}>
            やめる
          </MiniButton>
        ) : (
          <MiniButton tone="accent" onClick={start}>
            話して みる
          </MiniButton>
        )
      }
    >
      {snapshot ? (
        <>
          <p className="text-ink-soft text-xs font-bold">
            いまの 下書きで 動いて います。文を 直したら、いちど「やめる」を 押して から もう一度
            始めて ください。
          </p>
          {/*
            **鍵は この 端末の もの**。声で 話すには マイクの きょかも 要る。
            どちらも 学習者と 同じ 道なので、ここで 通れば 学習者でも 通る。
          */}
          <div className="border-hairline rounded-2xl border-2 border-dashed p-2">
            {/* 対話ゲームの 教材は 別の 画面で 動く（願い #177）。 */}
            {snapshot.talkGame ? (
              <TalkGameSession meeting={snapshot} hostVoice={host?.voice} />
            ) : (
              <MeetingSession
                meeting={snapshot}
                hostVoice={host?.voice}
                hostMouth={host?.mouth}
                embedded
              />
            )}
          </div>
          <p className="text-ink-faint text-xs font-bold">
            ここでの 進みぐあいは 「preview-」の 名前で 別に 残る ので、先生自身の きろくは
            動きません。
          </p>
        </>
      ) : (
        <p className="text-ink-soft text-xs font-bold">
          じっさいに ヘンディさんと 話して、こえ・字幕・カードの 開き方まで 確かめられます。
        </p>
      )}
    </StudioSection>
  );
}
