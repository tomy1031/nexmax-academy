"use client";

import { useState } from "react";
import type { Meeting } from "@/content/schema";
import { CARD_SYSTEM, JUDGE_SYSTEM } from "@/components/meeting/judge-api";
import {
  askInstruction,
  listenInstruction,
  type InstructionSource,
} from "@/lib/meeting/instructions";
import { buildCardPrompt, buildJudgePrompt } from "@/lib/meeting/judge";
import { MiniButton, StudioSection } from "./studio-ui";

/**
 * AIに 何を 渡して いるか を そのまま 見せる
 *
 * ## なぜ 見せるのか
 * 先生が 直せるのは「話し方」「見かた」「話題」だけで、**その まわりに 何が
 * ついて 送られるのかは 見えなかった**。見えないと、返事が おかしい ときに
 * 自分の 書いた 文の せいなのか、アプリの せいなのかが 分からない。
 * 組み上がった 全文が 読めれば、直す ところが 自分で 決められる
 *（2026-08-22 の 依頼「管理画面で 調整と チェックが 可能なように」）。
 *
 * ## 保存する 前の 下書きで 組む
 * `value` は エディタが いま 持って いる 下書き。**保存しなくても** 直した ことが
 * すぐ ここに 出る。保存してからでないと 確かめられない と、先生は 直す たびに
 * 学習者の 画面を 壊す ことに なる。
 *
 * ## 直せない ところも 見せる
 * かっこ禁止・ト書き禁止・「1回だけ 道具を 呼ぶ」——これらは わざと コードが
 * 持って いる（消せると、過去の 事故が そのまま 戻る）。**隠すのでは なく、
 * 見えるが 直せない**に する。何が 決まりなのかを 知った うえで 書いて もらう。
 *
 * ## AIは 呼ばない
 * ここは 文字を 組み立てて 出すだけ。鍵が 無くても 使える し、待ち時間も 無い。
 * 実際に 返事を もらう「ためす」は 別（`meeting-try.tsx`）。
 */

/** 判定の 文を 組むのに 要る「学習者の ことば」の 見本。 */
const SAMPLE_UTTERANCE = "わたしは ソクです。";
/** 見本の 学習者名（本番では 診断の ときに 決めた 呼び名が 入る）。 */
const SAMPLE_LEARNER = "ソク";

type Pane = "ask" | "listen" | "judge" | "cards";

const PANES: readonly { key: Pane; label: string; note: string }[] = [
  {
    key: "ask",
    label: "01 答える ばん",
    note: "ヘンディさんが しつもんし、学生が 答える 時間に 渡す 文です。",
  },
  {
    key: "listen",
    label: "02 聞く ばん",
    note: "学生が しつもんする 時間に 渡す 文です。ここで はじめて 話題を 渡します。",
  },
  {
    key: "judge",
    label: "日本語の 見かた",
    note: "会話とは 別の つなぎで 送ります。声では 返さず、道具で 見かたを 返します。",
  },
  {
    key: "cards",
    label: "札の あたり",
    note: "ことばで 当たらなかった ときだけ 送ります。迷ったら 開かない 側に 寄せます。",
  },
];

export function MeetingPromptPreview({ value }: { value: Meeting }) {
  const [pane, setPane] = useState<Pane>("ask");
  const [open, setOpen] = useState(false);

  const source: InstructionSource = {
    persona: value.persona,
    hostName: value.host.name,
    discover: value.discover ?? [],
  };
  const topics = (value.discover ?? []).map((item) => ({ id: item.id, label: item.label }));
  const first = value.questions[0];

  const text =
    pane === "ask"
      ? askInstruction(source)
      : pane === "listen"
        ? listenInstruction(source, SAMPLE_LEARNER)
        : pane === "judge"
          ? [
              JUDGE_SYSTEM,
              "",
              "--- ここから 1回ごとに 送る 文 ---",
              "",
              first
                ? buildJudgePrompt({
                    ask: first.ask,
                    hint: first.hint,
                    keywords: first.keywords,
                    judgePrompt: value.judgePrompt,
                    hostName: value.host.name,
                    learnerName: SAMPLE_LEARNER,
                    utterance: SAMPLE_UTTERANCE,
                    attempt: 1,
                  })
                : "しつもんを 1つ 作ると、ここに 見本が 出ます。",
            ].join("\n")
          : [
              CARD_SYSTEM,
              "",
              "--- ここから 1回ごとに 送る 文 ---",
              "",
              topics.length > 0
                ? buildCardPrompt(topics, "日本で びっくりした ことは ありますか。")
                : "話題を 1つ 作ると、ここに 見本が 出ます。",
            ].join("\n");

  const now = PANES.find((item) => item.key === pane);

  return (
    <StudioSection
      title="AIに 渡して いる 文（見るだけ）"
      hint="下書きの ままで 組み上がります。ここは 直せません——直すのは 上の「話し方」「見かた」「話題」です。"
      right={
        <MiniButton tone="plain" onClick={() => setOpen((v) => !v)}>
          {open ? "とじる" : "ひらく"}
        </MiniButton>
      }
    >
      {open ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {PANES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPane(item.key)}
                aria-pressed={pane === item.key}
                className="rounded-full px-3 py-1.5 text-xs font-extrabold"
                style={{
                  background:
                    pane === item.key ? "var(--color-sky-deep)" : "var(--color-panel-tint)",
                  color: pane === item.key ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {now ? <p className="text-ink-soft text-xs font-bold">{now.note}</p> : null}
          {/*
            **等幅で、折り返して 出す**。指示文は 1行が 長い ので、横に 流すと
            右端が 読めない。読む ための 面なので 選んで コピーも できる ように する。
          */}
          <pre
            aria-label="組み上がった 指示文"
            className="bg-cream text-ink max-h-96 overflow-auto rounded-2xl p-3 text-[11px] leading-relaxed font-bold whitespace-pre-wrap"
          >
            {text}
          </pre>
          <p className="text-ink-faint text-xs font-bold">
            太字の ない ところ（かっこを つかわない・道具は 1回だけ など）は アプリが 持って
            います。消すと 前に 起きた ふぐあいが もどる ため、ここでは 直せません。
          </p>
        </>
      ) : (
        <p className="text-ink-soft text-xs font-bold">
          いま AIに 渡して いる 文を、そのまま 読めます。
        </p>
      )}
    </StudioSection>
  );
}
