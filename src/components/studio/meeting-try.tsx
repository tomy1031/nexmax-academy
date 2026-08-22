"use client";

import { useState } from "react";
import type { Meeting } from "@/content/schema";
import { JudgeCard } from "@/components/meeting/judge-card";
import { judgeFailNote, requestCardHit, requestJudge } from "@/components/meeting/judge-api";
import { buildCardPrompt, buildJudgePrompt, type JudgeResult } from "@/lib/meeting/judge";
import { getGeminiKey } from "@/lib/profile";
import { normalizeReading } from "@/lib/text/normalize";
import { MiniButton, SelectField, StudioSection, TextAreaField } from "./studio-ui";

/**
 * **しつもんごとに、その場で ためす**
 *
 * ## なぜ しつもんごとなのか
 * 見かたの 指示文（`judgePrompt`）は 1つだが、**効き方は しつもんで まったく ちがう**。
 * 「お名前を おしえて ください」は 1語で 通るのに、「どうして ITの しごとを
 * えらびましたか」は 理由が 要る——同じ 文で 見て いるのに、片方だけ きびしく なる。
 * 教材ぜんぶで 1回 ためすのでは、その ずれが 見えない
 *（2026-08-22 の 依頼「質問ごとだと いいのですが」）。
 *
 * ## 学習者と 同じ 道を 通す
 * `requestJudge` を そのまま 呼ぶ。つまり **同じ つなぎの 決まり・同じ 道具・
 * 同じ かな検査**を 通る。ここで 通れば 学習者の 画面でも 通る。
 * 安い 別の 道（flash の `generateContent`）で ためすと、**ためした ものと
 * 動く ものが ちがう**——確かめた ことに ならない うえ、無料枠も 燃える。
 *
 * ## 保存しなくても ためせる
 * 渡すのは エディタの **下書き**。保存してからでないと 確かめられないと、
 * 先生は 直す たびに 学習者の 画面を 一度 壊す ことに なる。
 *
 * ## 送った 文も 出す
 * 返事だけ 見せても、直す ところは 分からない。**実際に 送った 文**を 隣に 置いて、
 * 自分の 書いた ところが どこに 入ったかを 見えるように する。
 */

/** 見本の 学習者名（本番では 診断の ときに 決めた 呼び名が 入る）。 */
const SAMPLE_LEARNER = "ソク";

type Phase = "idle" | "asking";

export function MeetingTryPanel({ value }: { value: Meeting }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [utterance, setUtterance] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [judge, setJudge] = useState<JudgeResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  /** ラウンド2の ためし（札に 当たるか）。 */
  const [asked, setAsked] = useState("");
  const [cardNote, setCardNote] = useState<string | null>(null);
  const [cardPhase, setCardPhase] = useState<Phase>("idle");

  const question = value.questions[at];
  const topics = (value.discover ?? []).map((item) => ({ id: item.id, label: item.label }));

  async function tryJudge() {
    if (!question || utterance.trim() === "") return;
    if (getGeminiKey() === "") {
      setNote("AIの かぎが まだ ありません。「せってい」で 入れると ためせます。");
      return;
    }
    setPhase("asking");
    setJudge(null);
    setNote(null);
    const context = {
      ask: question.ask,
      hint: question.hint,
      keywords: question.keywords,
      judgePrompt: value.judgePrompt,
      hostName: value.host.name,
      learnerName: SAMPLE_LEARNER,
      utterance: utterance.trim(),
      attempt: 1,
    };
    setSent(buildJudgePrompt(context));
    const result = await requestJudge({
      ...context,
      meetingId: value.id,
      questionId: question.id,
    });
    setPhase("idle");
    if (result.ok) setJudge(result.judge);
    else setNote(judgeFailNote(result.reason));
  }

  /**
   * 札の ためし。**ことばの 照合を 先に 見せる**——当たれば AIを 呼ばずに 済むし、
   * 「みじかすぎる ことばが 別の しつもんに 当たる」も ここで 見つかる。
   */
  async function tryCard() {
    if (asked.trim() === "") return;
    const reading = normalizeReading(asked);
    const hit = (value.discover ?? []).find((item) =>
      item.keywords.some((word) => reading.includes(normalizeReading(word))),
    );
    if (hit) {
      setCardNote(`ことばで あたりました → ${hit.label}`);
      return;
    }
    if (getGeminiKey() === "") {
      setCardNote("ことばでは あたりません。AIの かぎを 入れると、AIにも きけます。");
      return;
    }
    setCardPhase("asking");
    setCardNote(null);
    const id = await requestCardHit(value.id, topics, asked.trim());
    setCardPhase("idle");
    const found = topics.find((item) => item.id === id);
    setCardNote(
      found
        ? `ことばでは あたりませんでしたが、AIが 見つけました → ${found.label}`
        : "どの 話題にも あたりませんでした。ことばを 足すか、話題の 書き方を 見なおして ください。",
    );
  }

  return (
    <StudioSection
      title="ためす（しつもんごと）"
      hint="いま 書いて ある ままで、AIに 1回 きいて みます。保存しなくても ためせます。"
      right={
        <MiniButton tone="plain" onClick={() => setOpen((v) => !v)}>
          {open ? "とじる" : "ひらく"}
        </MiniButton>
      }
    >
      {!open ? (
        <p className="text-ink-soft text-xs font-bold">
          しつもんを 1つ えらんで、学生の こたえを 打つと、AIの 見かたが かえって きます。
        </p>
      ) : (
        <>
          <SelectField
            label="どの しつもんで ためすか"
            value={String(at)}
            onChange={(next) => {
              setAt(Number(next));
              setJudge(null);
              setNote(null);
              setSent(null);
            }}
            options={value.questions.map((item, index) => ({
              value: String(index),
              label: `${index + 1}. ${item.ask || "（まだ 書いて いません）"}`,
            }))}
          />

          {question?.hint ? (
            <p className="text-ink-faint text-xs font-bold">ヒント: {question.hint}</p>
          ) : null}

          <TextAreaField
            label="学生の こたえ"
            value={utterance}
            onChange={setUtterance}
            rows={2}
            placeholder="わたしは ソクです。"
            hint="言い方を 変えて 何回か ためすと、きびしすぎる ところが 見つかります。"
          />

          <div className="flex flex-wrap items-center gap-2">
            <MiniButton
              tone="accent"
              disabled={phase === "asking" || utterance.trim() === ""}
              onClick={() => void tryJudge()}
            >
              {phase === "asking" ? "きいて います…" : "AIに きく"}
            </MiniButton>
            {phase === "asking" ? (
              <span className="text-ink-soft text-xs font-bold">
                はじめの 1回は つなぐのに 数びょう かかります。
              </span>
            ) : null}
          </div>

          {note ? (
            <p className="bg-cream text-ink rounded-2xl px-3 py-2 text-xs font-bold">{note}</p>
          ) : null}

          {/* 学習者が 見る ものと 同じ 部品で 出す。ここで 見た ものが そのまま 出る */}
          {judge ? <JudgeCard judge={judge} hostName={value.host.name} /> : null}

          {sent ? (
            <details className="bg-cream rounded-2xl p-3">
              <summary className="text-ink cursor-pointer text-xs font-black">
                この しつもんで 送った 文を 見る
              </summary>
              <pre className="text-ink mt-2 max-h-80 overflow-auto text-[11px] leading-relaxed font-bold whitespace-pre-wrap">
                {sent}
              </pre>
            </details>
          ) : null}

          {topics.length > 0 ? (
            <div className="border-hairline space-y-3 rounded-2xl border-2 border-dashed p-3">
              <p className="text-navy text-sm font-black">🔎 聞く ばんの ためし（札に あたるか）</p>
              <TextAreaField
                label="学生の しつもん"
                value={asked}
                onChange={setAsked}
                rows={2}
                placeholder="日本で びっくりした ことは ありますか。"
              />
              <MiniButton
                tone="accent"
                disabled={cardPhase === "asking" || asked.trim() === ""}
                onClick={() => void tryCard()}
              >
                {cardPhase === "asking" ? "きいて います…" : "あたるか みる"}
              </MiniButton>
              {cardNote ? (
                <p className="bg-panel-tint text-ink rounded-2xl px-3 py-2 text-xs font-bold">
                  {cardNote}
                </p>
              ) : null}
              <details>
                <summary className="text-ink-soft cursor-pointer text-xs font-black">
                  AIに 送る 文を 見る
                </summary>
                <pre className="text-ink mt-2 max-h-60 overflow-auto text-[11px] leading-relaxed font-bold whitespace-pre-wrap">
                  {buildCardPrompt(
                    topics,
                    asked.trim() || "日本で びっくりした ことは ありますか。",
                  )}
                </pre>
              </details>
            </div>
          ) : null}

          <p className="text-ink-faint text-xs font-bold">
            ここで つかう かぎは、この 端末に 入れた ものです。学生の かぎは つかいません。
          </p>
        </>
      )}
    </StudioSection>
  );
}
