"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { Scenario } from "@/content/schema";
import { FeedbackMessage } from "@/components/feedback-message";
import type { FeedbackKey } from "@/lib/feedback";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import { CaptionBar, CallShell } from "@/components/call-shell";
import { LiveReason } from "./live-reason";
import { resolveMatch } from "./req-matcher";
import { useLiveSession } from "./use-live-session";

/**
 * たいわ（Live対話）— 同じ Zoom風シェルの中で、お客さま役のAIと日本語で話す。
 *
 * リスニング（聞く教材）と枠を共有するが、学習者がすることは正反対（聞く／話す）。
 * 呼び名も行き先（/talk）も分けてある。混ぜると、学習者は聞くつもりで
 * マイクに向かうことになる。
 *
 * 要件ボードは最初「？？？」で伏せてあり、聞き出せた項目だけが開く。
 * 判定は3層（AI → ローカルのキーワード救済 → 手動）で、AIの誤判定で
 * 正しい質問が却下されないようにする（設計01 §3）。
 *
 * ## 声も 文字も、同じ judge() を通る
 * 以前は判定がテキスト送信のときにしか走らず、**声で話した学習者は何をしても
 * ボードが1つも開かなかった**。いまは聞き取り（相手が話しはじめた合図で1つに
 * 束ねた発話）も同じ入口へ流す。判定の道を2本持つと、必ず片方が腐る。
 */

/**
 * キーワードが1語だけ当たった（＝あと ひとこと）ときの文言。
 * 「番ちがい」ではなく「おしい」を返す——1語 当てた 学習者を 迷子に しない。
 */
const CLOSE_NOTE: FeedbackKey = "talk.close";

export function TalkSession({
  scenario,
  /**
   * ステージの枠（ContentFrame）の中に置くとき。自前の外枠と戻りリンクを出さない
   * ——戻り先は枠が持つ（教材ごとに戻り先が違うと、学習者は1本おわるたびに
   * 別の一覧へ放り出される）。
   */
  embedded = false,
}: {
  scenario: Scenario;
  embedded?: boolean;
}) {
  const furigana = useMemo(() => buildFuriganaIndex(scenario.furigana ?? []), [scenario.furigana]);
  const live = useLiveSession();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  // 画面に出す文言は型付きキーだけ（自由文字列を書けなくする — 設計03 §1.3-1）
  const [note, setNote] = useState<FeedbackKey | null>(null);
  const [draft, setDraft] = useState("");
  /**
   * いま出しているヒントの項目。
   *
   * 以前は「まだ聞けていない項目の**先頭**」を開きっぱなしで出していた。
   * それだと、上から順に読み上げるだけで全部そろってしまい、
   * 「自分で聞き出す」練習にならない。押したときに、まだ聞けていない中から
   * ひとつだけ出す。
   */
  const [hintId, setHintId] = useState<string | null>(null);
  /** 「はじめの 一言」カードを閉じたか。 */
  const [openerClosed, setOpenerClosed] = useState(false);
  /**
   * すでに開いた項目。判定はAIを待つあいだに進むので、**待つ前の写しではなく
   * ここを見る**（待っているあいだに開いた項目を、もう一度開けにいかないため）。
   */
  const openRef = useRef<ReadonlySet<string>>(new Set());
  /** 判定ずみの発話ID（同じ発話を二度見ない）。 */
  const judgedRef = useRef(0);

  const participants = useMemo(
    () => [
      {
        id: "client",
        name: scenario.client.name,
        role: scenario.client.role,
        accent: "leaf" as const,
      },
    ],
    [scenario.client],
  );

  /**
   * 発話を1つ判定し、開いた項目があればボードをめくる。
   * **声でも 文字でも ここを通る**（判定の道を分けない）。
   */
  const judge = useCallback(
    (utterance: string) => {
      const reqs = scenario.interview.reqs;
      const closed = reqs.filter((req) => !openRef.current.has(req.id));
      if (closed.length === 0 || !utterance.trim()) return;

      /*
       * 判定は **端末の 中だけ**で 済ませる（2026-08-20・絶対ルール）。
       *
       * ここは `gemini-2.5-flash` の `generateContent` に 聞いて いた。
       * それは Live とは **別勘定の 無料枠**で、学習者が 何度か 話しただけで
       * 使い切る（「すぐ limit に なる」——同日 クライアント指定）。
       * 落ちても 会話が 続く ように 元から 二層に して あった ので、
       * 層2（ことばの 照合）だけで 動かす。
       * 意味の 見かたを 戻す ときは、**Live の つなぎの 中**で もらう
       *（ミーティングの `judge-api.ts` と 同じ やり方）。
       */
      const outcome = resolveMatch({
        utterance,
        reqs,
        openIds: openRef.current,
        aiReqId: null,
      });
      if (outcome.reqId) {
        const opened = new Set([...openRef.current, outcome.reqId]);
        openRef.current = opened;
        setOpen(opened);
        setNote("talk.itemFound");
        return;
      }
      // 1語だけ当たった＝話題は合っている。「ずれている」ではなく「あと ひとこと」へ
      setNote(outcome.near ? CLOSE_NOTE : "talk.offTopic");
    },
    [scenario],
  );

  /*
   * 声で話したぶんを見る。相手が話しはじめた合図で1つに束ねてから届くので、
   * 「わたしは」の途中で判定されることはない（use-live-session の lastUtterance）。
   */
  useEffect(() => {
    const heard = live.lastUtterance;
    if (!heard || heard.id === judgedRef.current) return;
    judgedRef.current = heard.id;
    judge(heard.text);
  }, [live.lastUtterance, judge]);

  // ステージの進み具合に反映する（設計07 §3）。退出まで行ったら「おわった」。
  useEffect(() => {
    recordContentProgress(scenario.id, { status: "started" });
  }, [scenario.id]);

  const handleLeft = useCallback(() => {
    live.disconnect();
    recordContentProgress(scenario.id, { status: "completed" });
  }, [live, scenario.id]);

  const askable = scenario.interview.reqs.filter((r) => !open.has(r.id));
  // 聞き出せた項目のヒントは引っこめる（もう要らないものが残っていると、
  // 「まだ聞けていない」と勘違いする）
  const hint = askable.find((req) => req.id === hintId) ?? null;

  /** あいさつの型文（教材の言い回しから借りる）。無ければカードは goal と tip だけ。 */
  const openingLine = useMemo(() => buildOpeningLine(scenario), [scenario]);
  /**
   * 「はじめの 一言」を出すか。つながった直後で、まだ一度も話していないとき。
   * 何を言えばよいか分からないまま画面と向き合う時間を作らないため。
   */
  const showOpener =
    live.status === "live" && !openerClosed && !live.transcript.some((turn) => turn.from === "me");

  return (
    <div className={embedded ? "" : "mx-auto w-full max-w-3xl px-4 py-6"}>
      {embedded ? null : (
        <header className="mb-5 flex items-center justify-between gap-3">
          {/*
            たいわ だけの 一覧は まだ 無く、/listening が「きく」と「はなす」の
            両方の 入口を 兼ねている。だから ここでは 種別の名前を 言い切らない
            （「リスニング 一覧」と 書くと、たいわ から 戻る 先の 名前が ずれる）。
          */}
          <Link href="/listening" className="text-ink-soft hover:text-navy text-sm font-extrabold">
            ← いちらんに もどる
          </Link>
          <span className="bg-sky-soft text-navy rounded-full px-3 py-1 text-xs font-extrabold">
            {scenario.emoji} {scenario.title}
          </span>
        </header>
      )}

      <CallShell
        title={scenario.title}
        focus={scenario.mission.goal}
        participants={participants}
        activeSpeaker={live.status === "live" ? "client" : null}
        onLeft={handleLeft}
        controls={
          <div className="card-island flex flex-wrap items-center gap-2 p-3">
            {live.status === "idle" && (
              <button
                type="button"
                // 声は人物カードで決めたもの（まんが・ミーティングと同じ人の声にする）
                onClick={() => void live.connect(scenario.interview.persona, scenario.client.voice)}
                className="btn-island btn-game px-6 py-2.5 text-sm"
              >
                🎙️ 話しはじめる
              </button>
            )}
            {live.status === "connecting" && (
              <span className="text-ink-soft text-sm font-extrabold">つないでいます…</span>
            )}
            {live.status === "live" && (
              <>
                <span className="bg-leaf/15 text-leaf-deep rounded-full px-3 py-1 text-xs font-extrabold">
                  ● つながっています
                </span>
                {/*
                  マイクを 断られても つないだまま 続ける（劣化運転）。
                  ここで 何も 言わないと、声が 届いていない ことに 気づけない。
                */}
                {!live.voiceOn && (
                  <span className="text-ink-soft text-xs font-extrabold">
                    マイクは つかえません。下に 書いて 送れば、そのまま すすめます
                  </span>
                )}
                <button
                  type="button"
                  onClick={live.disconnect}
                  className="btn-island btn-game px-4 py-2 text-xs"
                  style={
                    { "--btn-face": "#ffffff", "--btn-shadow": "#cfe6f3" } as React.CSSProperties
                  }
                >
                  <span className="text-ink">いったん とめる</span>
                </button>
              </>
            )}
            {live.status === "error" && (
              <span className="text-coral-deep text-sm font-extrabold">
                つながりませんでした。下に りゆうが 出ています
              </span>
            )}
          </div>
        }
      >
        {live.status === "notReady" || live.status === "error" ? (
          <LiveReason reason={live.reason} />
        ) : (
          <>
            {/*
              はじめの 一言。つながった直後の「何を 言えば いいか わからない」を
              いちばん 短い 道で 越えさせる（設計01 P8: 次の行動を 見せる）。
              文は 教材データから 借りる——ここで 新しい 日本語を 書くと、その漢字の
              読みが 読み辞書に 無く、学習者が そこで 止まる（規律2）。
            */}
            {showOpener && (
              <section className="card-island p-4" aria-label="はじめの 一言">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-ink font-extrabold">🌱 はじめの 一言</h3>
                  <button
                    type="button"
                    onClick={() => setOpenerClosed(true)}
                    aria-label="はじめの 一言を とじる"
                    className="text-ink-soft hover:text-ink shrink-0 px-2 text-sm font-black"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-ink-soft mt-1 text-sm font-bold">
                  🎯 <RubyText text={scenario.mission.goal} index={furigana} />
                </p>
                <p className="text-ink-soft mt-1 text-sm font-bold">
                  💡 <RubyText text={scenario.client.tip} index={furigana} />
                </p>
                {openingLine && (
                  <button
                    type="button"
                    /*
                     * あいさつは「聞き出す こと」では ないので、ボードは 動かさない
                     *（判定に かけると、あいさつした だけで ヒントが 出て とまどう）。
                     */
                    onClick={() => {
                      live.send(openingLine);
                      setOpenerClosed(true);
                    }}
                    className="border-hairline bg-panel-tint text-ink mt-3 rounded-full border-2 px-4 py-2 text-sm font-extrabold"
                  >
                    <RubyText text={openingLine} index={furigana} />
                    <span className="text-sky ml-2">▶ これを 送る</span>
                  </button>
                )}
              </section>
            )}

            {/* 文字起こしは必ず見せる（AIの誤判定を目で確かめられるように） */}
            <section className="flex flex-col gap-2">
              {live.transcript.slice(-4).map((turn, i) => (
                <CaptionBar
                  key={i}
                  speaker={turn.from === "me" ? "あなた" : scenario.client.name}
                  text={turn.text}
                />
              ))}
            </section>

            {/* 文字でも聞ける（音声が使えない環境でも学習を止めない） */}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                live.send(draft);
                void judge(draft);
                setDraft("");
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="しつもんを 書いて 送る"
                aria-label="しつもんを 入力する"
                className="border-hairline bg-panel text-ink w-full rounded-[var(--radius-button)] border-2 px-4 py-2.5 font-bold"
              />
              <button type="submit" className="btn-island btn-game shrink-0 px-6 py-2.5 text-sm">
                きく
              </button>
            </form>

            {note && <FeedbackMessage messageKey={note} />}
          </>
        )}

        {/* 要件ボード（？？？フリップ） */}
        <section className="card-island p-5">
          <h3 className="text-ink font-extrabold">
            📋 聞き出すこと（{open.size} / {scenario.interview.reqs.length}）
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {scenario.interview.reqs.map((req) => {
              const isOpen = open.has(req.id);
              return (
                <motion.li
                  key={req.id}
                  layout
                  className="border-hairline rounded-[var(--radius-card)] border-2 px-3 py-2"
                  style={{ background: isOpen ? "var(--color-sky-soft)" : "var(--color-panel)" }}
                >
                  <p className="text-ink text-sm font-extrabold">
                    <span className="mr-1">{req.icon}</span>
                    <RubyText text={req.label} index={furigana} />
                  </p>
                  <p className="text-ink-soft mt-0.5 text-sm font-bold">
                    {isOpen ? <RubyText text={req.secret} index={furigana} /> : "？？？"}
                  </p>
                </motion.li>
              );
            })}
          </ul>

          {askable.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  // まだ聞けていないものから ひとつ。同じものが続かないよう、
                  // いま出しているものは候補から外す。
                  const pool = askable.filter((req) => req.id !== hintId);
                  const from = pool.length > 0 ? pool : askable;
                  setHintId(from[Math.floor(Math.random() * from.length)]!.id);
                }}
                className="btn-game px-4 py-2 text-sm [--btn-face:#ffc93c] [--btn-shadow:#f0a819]"
              >
                💡 ヒントを 1つ もらう（のこり {askable.length}）
              </button>
              {hint && (
                <p className="bg-panel-tint text-ink mt-2 rounded-2xl px-4 py-2 text-sm font-bold">
                  <span className="mr-1">{hint.icon}</span>
                  <RubyText text={hint.hint} index={furigana} />
                </p>
              )}
            </div>
          )}
        </section>
      </CallShell>
    </div>
  );
}

/** 型文を引くための引用（『』「」）。教材が見せている言い回しをそのまま借りる。 */
const QUOTED = /[『「]([^』」]{2,40})[』」]/u;

/**
 * 「はじめの 一言」の型文を教材データから作る。見つからなければ null。
 *
 * ここで新しい文を書かない。教材が『相談が あります』のように**かぎ括弧で
 * 見せている言い方**を1つ借り、あいさつに継ぐだけにする——書き下ろすと、
 * その漢字の読みが読み辞書に無く、学習者がそこで止まる（規律2）。
 * あいさつは相手の場面に合わせる（朝会なら「おはようございます。」）。
 */
export function buildOpeningLine(scenario: Scenario): string | null {
  const sources = [
    // 教訓（lesson）→ 先輩の助言（mission.chat）→ 攻略ひとこと（tip）の順に探す
    ...scenario.lesson.points,
    ...scenario.mission.chat.filter((line) => line.from === "hendy").map((line) => line.text),
    scenario.client.tip,
  ];
  const greeting = scenario.interview.persona.includes("おはよう")
    ? "おはようございます。"
    : "しつれいします。";

  for (const source of sources) {
    const phrase = QUOTED.exec(source)?.[1]?.trim();
    if (phrase) return `${greeting}${phrase.replace(/[。、]+$/u, "")}。`;
  }
  return null;
}
