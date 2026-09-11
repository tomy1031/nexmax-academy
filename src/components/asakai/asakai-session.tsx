"use client";

/**
 * 朝礼・夕礼（1週間を 5場面で 通す 報告の 練習・台帳 #366）
 *
 * ## なぜ ミーティングと 別の 画面か
 * `MeetingSession` は「アプリが 1問ずつ 聞き、学習者が 1問ずつ 答える」形で、
 * すでに **ばん・札・frontier** の 3つの 状態を 持って いる。
 * ここは **学習者が 1本の 報告を して、足りない ところだけ 聞き返される**形なので、
 * 同じ 部品に 相乗りさせると「どれが 進行を 決めて いるのか」が 読めなく なる。
 * 対話ゲーム（`TalkGameSession`）と 同じ 分かれ方で、入口で 分ける。
 *
 * ## 何を 既存から 借りるか
 * Zoom の 枠（`CallShell`）・ヒントの ポップアップ・進みぐあいの 記録。
 * 判定は `src/lib/meeting/panels.ts`（純関数）。**作り直さない**。
 *
 * ## 聞き返しは 相手に 考えさせない
 * 教材が 持つ 固定文を **アプリが 選ぶ**。Live に 質問させると、当たり判定は
 * 学習者の 発話だけを 見る ので **その 答えで カードが 開く**（2026-08-21 の 決まり）。
 *
 * ## 判定は ことばの 照合だけで 完結させる
 * `resolveFacts` は AIの 返し（`aiSaidIds`）も 受けられる が、ここでは 渡さない。
 * 5日 × 4枚の 難しさが **その日の AIの 機嫌で 変わる**のを 避ける ため
 *（設計 #366 の 6.1「何行で 開くかは アプリが 数える」）。鍵の 有無で
 * 合否が 変わらない ので、CI でも 通しで 確かめられる。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CallShell } from "@/components/call-shell";
import { HintModal } from "@/components/meeting/hint-modal";
import { RubyText } from "@/components/ruby-text";
import {
  CardBoard,
  CountBoxes,
  DayDots,
  ProgressBoxes,
  SkyStrip,
} from "@/components/asakai/asakai-parts";
import type { CardState } from "@/components/asakai/asakai-parts";
import type { Meeting } from "@/content/schema";
import { buildFuriganaIndex, mergeFuriganaEntries, type FuriganaIndex } from "@/lib/text/furigana";
import {
  applyUtterance,
  initialPanelStates,
  nextProbePanel,
  type PanelState,
  type ReportPanel,
} from "@/lib/meeting/panels";
import { recordContentProgress } from "@/lib/progress/store";
import {
  clearAsakaiResume,
  restoreAsakai,
  saveAsakaiResume,
  type DayResult,
} from "@/lib/meeting/asakai-resume";

type Asakai = NonNullable<Meeting["asakai"]>;
type Scene = Asakai["scenes"][number];
type Line = Scene["sample"];

/** 同じ カードを 聞き返すのは 2回まで。3回目は 会話が 止まる。 */
const MAX_PROBE = 2;

const DAY_NAME: Record<Scene["day"], string> = {
  mon: "月曜日",
  tue: "火曜日",
  wed: "水曜日",
  thu: "木曜日",
  fri: "金曜日",
};

const KIND_NAME: Record<Scene["kind"], string> = { asa: "朝礼", yuu: "夕礼" };

/**
 * **画面が 自分で 出す 字**の 読み（`CallShell` の `SHELL_FURIGANA` と 同じ 流儀）。
 *
 * 教材の 読み辞書だけで 描いて いた ころ、週の けっかの「合格」が
 * かんたんの 辞書に ある ["合","あ"] を 拾って **「あ格」**に なって いた
 *（2026-09-11。教材の 辞書は 教材の 文の ために 作られて いる）。
 * 画面の ことばは 教材ごとに 変わらない ので、ここで 持つ。
 */
const UI_FURIGANA: readonly (readonly [string, string])[] = [
  ["合格", "ごうかく"],
  ["不合格", "ふごうかく"],
  ["以上", "いじょう"],
  ["曜日", "ようび"],
  ["聞き返し", "ききかえし"],
  ["開いた", "ひらいた"],
  ["開きます", "ひらきます"],
  ["開かなかった", "ひらかなかった"],
  ["言えた", "いえた"],
  ["報告", "ほうこく"],
  ["担当", "たんとう"],
  ["今週", "こんしゅう"],
  ["目標", "もくひょう"],
  ["番", "ばん"],
  ["書いて", "かいて"],
  ["見る", "みる"],
  ["増えます", "ふえます"],
  ["数", "かず"],
  ["回", "かい"],
  ["日", "にち"],
];

interface ChatLine {
  readonly who: string;
  readonly speakerId: string;
  readonly text: string;
  readonly self?: boolean;
}

export function AsakaiSession({ meeting }: { meeting: Meeting }) {
  const asakai = meeting.asakai;
  /* 教材の 読みが 先（後勝ち）。画面の ことばは そこに 無い ものだけ 拾う。 */
  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(UI_FURIGANA, meeting.furigana)),
    [meeting.furigana],
  );
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of asakai?.people ?? []) map.set(person.id, person.name);
    return map;
  }, [asakai]);

  /**
   * しおり。**日の はじめに 戻す**（場面の 途中には 戻さない）。
   *
   * 5日で 30分を 超える ので、1回の 授業で 終わらない ことが ふつうに ある。
   * ここを 読まないと、水曜まで 進んだ 人が 開き直すたびに 月曜へ 落ちる
   *（`MeetingSession` で 2026-08-28 に 実発生した のと 同じ 形）。
   * `useState` の 初期化関数で 1回だけ 読む——描くたびに 端末を 触らない。
   */
  const start = useState(() => restoreAsakai(meeting.id, asakai?.scenes.length ?? 0))[0];

  const [sceneAt, setSceneAt] = useState(start.sceneAt);
  const [states, setStates] = useState<readonly PanelState[]>(() =>
    initialPanelStates(toPanels(asakai?.scenes[start.sceneAt])),
  );
  /** カードごとに 何回 聞き返したか（2回で 打ち切る）。 */
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [askedId, setAskedId] = useState<string | null>(null);
  const [probes, setProbes] = useState(0);
  const [answer, setAnswer] = useState("");
  const [lines, setLines] = useState<readonly ChatLine[]>([]);
  const [hint, setHint] = useState(false);
  /** `"talk"` 報告中 ／ `"gap"` 時間カード ／ `"done"` 週の けっか。 */
  const [phase, setPhase] = useState<"talk" | "gap" | "done">("talk");
  const [results, setResults] = useState<readonly DayResult[]>(start.results);

  const scene = asakai?.scenes[sceneAt];
  const panels = useMemo(() => toPanels(scene), [scene]);

  const say = useCallback(
    (line: Line) =>
      setLines((prev) => [
        ...prev,
        { who: nameOf.get(line.speakerId) ?? "", speakerId: line.speakerId, text: line.text },
      ]),
    [nameOf],
  );

  /** 場面の はじめ（司会の 開き → 見本 → あなたの 番）を チャットに 積む。 */
  const openScene = useCallback(
    (at: number) => {
      const next = asakai?.scenes[at];
      if (!next) return;
      const rows = [...next.opening, next.sample, next.prompt].map((line) => ({
        who: nameOf.get(line.speakerId) ?? "",
        speakerId: line.speakerId,
        text: line.text,
      }));
      setLines(rows);
    },
    [asakai, nameOf],
  );

  /** 報告が 終わった ときの ひとかたまり（受け止め → 采配 → メンバー → 閉じ）。 */
  const finishScene = useCallback(
    (final: readonly PanelState[], usedProbes: number) => {
      if (!scene || !asakai) return;
      const komari = final.find((s) => s.id === "komari");
      const komariPanel = panels.find((p) => p.id === "komari");
      const isHard = asakai.level === "hard";
      const scored = final.filter((s) => s.id !== "komari");
      const scoredPanels = panels.filter((p) => p.id !== "komari");

      const row: DayResult = {
        day: DAY_NAME[scene.day],
        kind: scene.kind,
        cards: final.filter((s) => s.full).length,
        cardTotal: panels.length,
        units: isHard
          ? scored.reduce((sum, s) => sum + s.said.length, 0)
          : final.filter((s) => s.full).length,
        unitTotal: isHard
          ? scoredPanels.reduce((sum, p) => sum + p.facts.length, 0)
          : panels.length,
        komariOpen: komari?.open ?? false,
        komariBoxes: komari?.said.length ?? 0,
        komariTotal: komariPanel?.facts.length ?? 0,
        probes: usedProbes,
        chips: panels.map((panel) => ({
          label: panel.label,
          open: final.find((s) => s.id === panel.id)?.full ?? false,
        })),
      };
      setResults((prev) => {
        const done = [...prev, row];
        saveAsakaiResume(meeting.id, done);
        return done;
      });

      /*
       * **開かなかった カードが ある 日に「ぜんぶ 聞けました」と 言わない**（規律1）。
       *
       * 教材の `ack` は「4枚 そろった とき」の 受け止めで、司会が れいを 見せて
       * 先へ 進めた 日にも そのまま 出て いた——**言えて いないのに 分かった ことに
       * なる**。そろわなかった 日は、開いた 札と 開かなかった 札を そのまま 読み上げる。
       * 名指しの 材料は カードの 札（教材の ことば）だけで、新しい 呼び名を 作らない。
       */
      const openLabels = panels
        .filter((panel) => final.find((s) => s.id === panel.id)?.full)
        .map((panel) => panel.label);
      const shutLabels = panels
        .filter((panel) => !final.find((s) => s.id === panel.id)?.full)
        .map((panel) => panel.label);
      const ack: Line =
        shutLabels.length === 0
          ? scene.ack
          : {
              speakerId: asakai.chairId,
              text:
                (openLabels.length > 0
                  ? `はい。${openLabels.join("・")}は 聞けました。`
                  : "はい。") +
                `${shutLabels.join("・")}は 言えて いません。あしたは そこも お願いします。`,
            };

      /* 采配は「お願いまで 言えたか」で 分ける。言えて いない ときは
         司会が **言い方を 見せてから** 自分で 段取りする（0点で 終わらせない）。 */
      const tail: Line[] = [ack];
      if (scene.arrange) tail.push(komari?.full ? scene.arrange.done : scene.arrange.missing);
      tail.push(...scene.members, ...scene.closing);
      setLines((prev) => [
        ...prev,
        ...tail.map((line) => ({
          who: nameOf.get(line.speakerId) ?? "",
          speakerId: line.speakerId,
          text: line.text,
        })),
      ]);
      setAskedId(null);
    },
    [scene, asakai, panels, nameOf, meeting.id],
  );

  const send = useCallback(() => {
    const text = answer.trim();
    if (!text || !scene) return;
    setAnswer("");
    setLines((prev) => [...prev, { who: "あなた", speakerId: "self", text, self: true }]);

    const step = applyUtterance({ utterance: text, panels, states });
    const target = nextProbePanel(panels, step.states);
    if (!target) {
      setStates(step.states);
      finishScene(step.states, probes);
      return;
    }

    const count = (attempts[target.id] ?? 0) + 1;
    const data = scene.panels.find((p) => p.id === target.id);
    if (!data) {
      setStates(step.states);
      return;
    }

    /* 2回 聞いても 開かない カードは、司会が れいを 見せて 先へ 進める。 */
    if (count > MAX_PROBE) {
      say({ ...data.example, text: `こう 言うと 開きます。${data.example.text}` });
      const passed = step.states.map((s) => (s.id === target.id ? { ...s, gaveUp: true } : s));
      setStates(passed);
      const after = nextProbePanel(panels, passed);
      if (!after) {
        setAttempts({ ...attempts, [target.id]: count });
        finishScene(passed, probes);
        return;
      }
      const afterCount = (attempts[after.id] ?? 0) + 1;
      const afterData = scene.panels.find((p) => p.id === after.id);
      const followup = afterData?.followups[Math.min(afterCount, 2) - 1];
      if (followup) say(followup);
      setAttempts({ ...attempts, [target.id]: count, [after.id]: afterCount });
      setAskedId(after.id);
      setProbes((n) => n + 1);
      return;
    }

    const followup = data.followups[Math.min(count, data.followups.length) - 1];
    if (followup) say(followup);
    setStates(step.states);
    setAttempts({ ...attempts, [target.id]: count });
    setAskedId(target.id);
    setProbes((n) => n + 1);
  }, [answer, scene, panels, states, attempts, probes, say, finishScene]);

  /** 時間カードへ。金曜だけは そのまま 週の けっかへ。 */
  const toGap = useCallback(() => {
    if (!asakai) return;
    if (sceneAt + 1 >= asakai.scenes.length) {
      setPhase("done");
      return;
    }
    setPhase("gap");
  }, [asakai, sceneAt, meeting.id]);

  /**
   * 週の けっかを 読み終えた とき。
   *
   * **「おわった」を ここで 書く**（`toGap` では 書かない）。先に 書くと
   * ステージの「クリア」の 板が けっかの 上に かぶさり、合格か 不合格かが
   * 読めなく なる（規律1。2026-09-11 に 390px の 通しで 実発生）。
   * `MeetingSession` が 修了証を 閉じた ときに 書くのと 同じ 順番。
   */
  const closeResult = useCallback(() => {
    recordContentProgress(meeting.id, { status: "completed" });
    /* 話しきった 人が もう一度 開いたら 月曜から。しおりは ここで 消す。 */
    clearAsakaiResume(meeting.id);
  }, [meeting.id]);

  const goNext = useCallback(() => {
    if (!asakai) return;
    const at = sceneAt + 1;
    setSceneAt(at);
    setStates(initialPanelStates(toPanels(asakai.scenes[at])));
    setAttempts({});
    setAskedId(null);
    setProbes(0);
    setPhase("talk");
    openScene(at);
  }, [asakai, sceneAt, openScene]);

  if (!asakai || !scene) return null;

  const last = lines[lines.length - 1];
  /** 相手の さいごの ことば（自分の 発話は とばす）。 */
  const lastSaid = [...lines].reverse().find((line) => !line.self);
  const sceneOver = nextProbePanel(panels, states) === null;
  const cards = panels.map((panel) => {
    const state = states.find((s) => s.id === panel.id);
    return {
      id: panel.id,
      label: panel.label,
      state: faceOf(state, askedId === panel.id),
      boxes: panel.facts.some((fact) => fact.box)
        ? panel.facts
            .filter((fact) => fact.box)
            .map((fact) => ({
              label: fact.box ?? "",
              state: (state?.said.includes(fact.id) ? "open" : "closed") as CardState,
            }))
        : undefined,
    };
  });

  return (
    <CallShell
      title={meeting.title}
      focus={meeting.focus}
      furigana={meeting.furigana ?? []}
      purpose="speak"
      tone="light"
      activeSpeaker={last && !last.self ? last.speakerId : undefined}
      participants={asakai.people
        .filter((person) => !person.fridayOnly || scene.day === "fri")
        .map((person) => ({
          id: person.id,
          name: person.name,
          role: person.duty,
          accent: person.accent,
        }))}
      onJoined={() => openScene(0)}
      side={<Chat lines={lines} index={index} />}
      speak={
        phase === "done" ? (
          <WeekResult asakai={asakai} rows={results} index={index} onClose={closeResult} />
        ) : phase === "gap" ? (
          <TimeCard
            result={results[results.length - 1]}
            lead={scene.lead}
            nextDay={DAY_NAME[asakai.scenes[sceneAt + 1]?.day ?? "fri"]}
            at={sceneAt + 1}
            total={asakai.scenes.length}
            index={index}
            onNext={goNext}
          />
        ) : (
          <div className="flex flex-col">
            <CardBoard cards={cards} index={index} />

            <div className="card-island mt-2 space-y-3 p-3">
              <div className="flex items-center gap-2">
                <SkyStrip kind={scene.kind} />
                <DayDots at={sceneAt} />
              </div>
              <p className="text-navy text-sm font-black">
                <RubyText text={scene.title} index={index} show />
              </p>

              <div className="border-hairline rounded-xl border bg-white/70 p-2 text-sm">
                <Tag text="担当" index={index} />
                <RubyText text={scene.card.duty} index={index} show />
                <p className="mt-1 font-bold">
                  <Tag text="今週の ゴール" index={index} />
                  <RubyText text={scene.card.goal} index={index} show />
                </p>
                {scene.card.deadline ? (
                  <p className="mt-1 font-bold">
                    <Tag text="いつまでに" index={index} />
                    <RubyText text={scene.card.deadline} index={index} show />
                  </p>
                ) : null}
              </div>

              <ProgressBoxes items={scene.card.progress} index={index} />

              {scene.card.rows?.length ? (
                <dl className="space-y-2 text-sm">
                  {scene.card.rows.map((row) => (
                    <div key={row.key}>
                      <dt className="text-blue-deep font-black">
                        <RubyText text={row.label} index={index} show />
                      </dt>
                      <dd className="m-0 font-bold">
                        <RubyText text={row.text} index={index} show />
                        {row.count ? (
                          <CountBoxes
                            total={row.count.total}
                            done={row.count.done}
                            now={row.count.now}
                          />
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {scene.card.memo?.length ? (
                <div>
                  <p className="text-ink-soft text-[11px] font-black">
                    <RubyText text="きょうの メモ" index={index} show />
                  </p>
                  <ul className="mt-1 list-none space-y-1 border-l-[3px] border-[#8a5a3e] pl-2">
                    {scene.card.memo.map((row, at) => (
                      <li
                        key={`${row.head}-${at}`}
                        /*
                         * `aside`（報告に 要らない 行）でも **見た目を 変えない**。
                         * 灰色に して いた ころ、どれを 落とすかを 画面が 先に
                         * 答えて いた——えらぶ 練習に ならない（2026-09-11）。
                         */
                        className="grid grid-cols-[3.6rem_minmax(0,1fr)] gap-2 text-[13px] leading-snug font-bold"
                      >
                        <span className="text-[#8a5a3e] tabular-nums">
                          <RubyText text={row.head} index={index} show />
                        </span>
                        <span>
                          <RubyText text={row.text} index={index} show />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {scene.card.pin ? (
                    <p className="mt-2 rounded-md border border-[#d8c77a] bg-[#fdf6c8] px-3 py-2 text-sm font-bold">
                      📌 <RubyText text={scene.card.pin} index={index} show />
                    </p>
                  ) : null}
                </div>
              ) : null}

              {scene.card.todo?.length ? (
                <div className="bg-panel-tint rounded-xl px-3 py-2 text-sm">
                  <p className="text-ink-soft text-[11px] font-black">
                    <RubyText text="やること" index={index} show />
                  </p>
                  {scene.card.todo.map((row, at) => (
                    <p key={at} className="font-bold">
                      <RubyText text={row} index={index} show />
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="border-hairline sticky bottom-0 z-20 mt-2 border-t bg-white/95 px-2 py-2 backdrop-blur">
              {sceneOver ? (
                <button
                  type="button"
                  onClick={toGap}
                  className="btn-island btn-game w-full px-6 py-3"
                >
                  <RubyText
                    text={
                      sceneAt + 1 >= asakai.scenes.length
                        ? "今週の けっかを 見る ▶"
                        : "きょうの けっかを 見る ▶"
                    }
                    index={index}
                    show
                  />
                </button>
              ) : (
                <div className="space-y-2">
                  {/*
                   * **いま 言われた 1行**を 入力欄の すぐ上に 置く（2026-09-11）。
                   *
                   * 会話の 記録（`side`）は 390px では カメラの 列の さらに 下に 積まれる。
                   * カードが ❓ に 変わっても、**何を 聞かれたかは 画面 1つぶん 下**に あった。
                   * 打つ 手の すぐ上に 相手の ことばを 置く（`MeetingSession` と 同じ 形）。
                   */}
                  {lastSaid ? (
                    <p className="bg-panel-tint rounded-xl px-3 py-2 text-sm font-bold">
                      <span className="text-ink-soft mr-1 text-[11px] font-black">
                        <RubyText text={lastSaid.who} index={index} show />
                      </span>
                      <RubyText text={lastSaid.text} index={index} show />
                    </p>
                  ) : null}
                  <label
                    className="text-ink-soft block text-[11px] font-black"
                    htmlFor="asakai-answer"
                  >
                    <RubyText text="あなたの 番です。報告を 書いて ください。" index={index} show />
                  </label>
                  <textarea
                    id="asakai-answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    rows={3}
                    className="border-hairline w-full rounded-xl border p-2 text-sm font-bold"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={send}
                      disabled={!answer.trim()}
                      className="btn-island btn-game flex-1 px-4 py-2 disabled:opacity-45"
                    >
                      <RubyText text="報告する" index={index} show />
                    </button>
                    <button
                      type="button"
                      onClick={() => setHint(true)}
                      className="btn-island px-4 py-2 text-sm font-black"
                    >
                      💡 <RubyText text="ヒント" index={index} show />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {hint ? (
              <HintModal
                lines={scene.hintLines}
                hasBlank={scene.hintLines.some((line) => line.includes("◯"))}
                furigana={index}
                onClose={() => setHint(false)}
              />
            ) : null}
          </div>
        )
      }
    />
  );
}

function Tag({ text, index }: { text: string; index: FuriganaIndex }) {
  return (
    <span className="bg-navy mr-1 rounded-full px-2 py-0.5 text-[11px] font-black text-white [&_rt]:text-white">
      <RubyText text={text} index={index} show />
    </span>
  );
}

/**
 * 時間カード（1日の 終わり）。
 *
 * **⭕❌ の 並びだけを 出さない**——何の ⭕ なのかが 読めない ので、
 * カードの 札を そのまま 添える（fable の 棚卸し §5）。
 * 聞き返しの 数は ここには 出さない（週の けっかの 表に まとめる）。
 */
function TimeCard({
  result,
  lead,
  nextDay,
  at,
  total,
  index,
  onNext,
}: {
  result: DayResult | undefined;
  lead?: string;
  nextDay: string;
  at: number;
  total: number;
  index: FuriganaIndex;
  onNext: () => void;
}) {
  return (
    <div className="card-island space-y-3 p-4" role="status">
      {result ? (
        <>
          <p className="text-navy text-base font-black">
            <RubyText
              text={`${result.day}の ${KIND_NAME[result.kind]} おわり`}
              index={index}
              show
            />
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {result.chips.map((chip) => (
              <li
                key={chip.label}
                className={`rounded-full border px-2 py-1 text-[11px] font-black ${
                  chip.open ? "border-leaf bg-leaf-soft text-navy" : "border-coral bg-coral-soft"
                }`}
              >
                <RubyText text={chip.label} index={index} show /> {chip.open ? "⭕" : "❌"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {lead ? (
        <div className="bg-panel-tint rounded-xl px-3 py-2">
          <p className="text-ink-soft text-[11px] font-black">
            <RubyText text="この あと あった こと" index={index} show />
          </p>
          <p className="mt-0.5 text-sm font-bold">
            <RubyText text={lead} index={index} show />
          </p>
        </div>
      ) : null}
      <button type="button" onClick={onNext} className="btn-island btn-game w-full px-6 py-3">
        <span className="block break-keep">
          <RubyText text={`${nextDay}から つづけます`} index={index} show />
        </span>
        <span className="block text-xs tabular-nums">
          {at + 1}日目 / {total}日
        </span>
      </button>
    </div>
  );
}

/**
 * 週の けっか。**合否を 字で はっきり 出す**（規律1）。ねぎらいの ことばは 置かない。
 *
 * 数える 単位は レベルで ちがう——かんたんは **開いた カード**（20枚）、
 * むずかしいは **言えた こと**（30こ）と **こまりごとで 言えた こと**（15こ）。
 * どちらも「数字と きょうで 稼いで こまりごとを 5日 落とす」を 合格に しない ため、
 * 2本の 線を 両方 越えた ときだけ 合格に する。
 *
 * ## 表の 列は **合否と 同じ ものさし**に する
 * 上の 行が「言えた こと 23 / 30」で、下の 表が「開いた カード 3 / 4」だと、
 * **どちらが 合格に 効くのかが 画面から 読めない**（数の 単位が 2つ 並ぶ）。
 * だから 表の 列見出しも `unitName` と そろえ、中身も その日の `units` を 出す。
 */
function WeekResult({
  asakai,
  rows,
  index,
  onClose,
}: {
  asakai: Asakai;
  rows: readonly DayResult[];
  index: FuriganaIndex;
  onClose: () => void;
}) {
  const [closed, setClosed] = useState(false);
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const unitTotal = rows.reduce((sum, row) => sum + row.unitTotal, 0);
  const komariDays = rows.filter((row) => row.komariOpen).length;
  const komariBoxes = rows.reduce((sum, row) => sum + row.komariBoxes, 0);
  const komariTotal = rows.reduce((sum, row) => sum + row.komariTotal, 0);

  const needUnits = asakai.pass.units;
  const needDays = asakai.pass.komariDays;
  const needBoxes = asakai.pass.komariBoxes;
  const unitName = asakai.level === "hard" ? "言えた こと" : "開いた カード";
  const secondOk =
    needBoxes !== undefined
      ? komariBoxes >= needBoxes
      : needDays !== undefined
        ? komariDays >= needDays
        : true;
  const pass = units >= needUnits && secondOk;

  return (
    <div className="card-island space-y-3 p-4" role="status">
      <p className={`text-2xl font-black ${pass ? "text-leaf-deep" : "text-coral-deep"}`}>
        <RubyText text={pass ? "合格" : "不合格"} index={index} show />
      </p>

      <p className="text-sm font-bold">
        <RubyText text={unitName} index={index} show />{" "}
        <span className="tabular-nums">
          {units} / {unitTotal}
        </span>{" "}
        — <span className="tabular-nums">{needUnits}</span>{" "}
        <RubyText text="以上で 合格" index={index} show />
      </p>
      {needBoxes !== undefined ? (
        <p className="text-sm font-bold">
          <RubyText text="こまりごとで 言えた こと" index={index} show />{" "}
          <span className="tabular-nums">
            {komariBoxes} / {komariTotal}
          </span>{" "}
          — <span className="tabular-nums">{needBoxes}</span>{" "}
          <RubyText text="以上で 合格" index={index} show />
        </p>
      ) : needDays !== undefined ? (
        <p className="text-sm font-bold">
          <RubyText text="こまりごとを 言えた 日" index={index} show />{" "}
          <span className="tabular-nums">
            {komariDays} / {rows.length}
          </span>{" "}
          — <span className="tabular-nums">{needDays}</span>
          <RubyText text="日 以上で 合格" index={index} show />
        </p>
      ) : null}

      <table className="w-full text-left text-[13px] font-bold">
        <thead>
          <tr className="text-ink-soft text-[11px]">
            <th scope="col" className="py-1">
              <RubyText text="曜日" index={index} show />
            </th>
            <th scope="col" className="py-1">
              <RubyText text={unitName} index={index} show />
            </th>
            <th scope="col" className="py-1">
              <RubyText text="聞き返し" index={index} show />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day} className="border-hairline border-t">
              <td className="py-1">
                <RubyText text={row.day} index={index} show />
              </td>
              <td className="py-1 tabular-nums">
                {row.units} / {row.unitTotal}
              </td>
              <td className="py-1 tabular-nums">{row.probes}回</td>
            </tr>
          ))}
        </tbody>
      </table>

      {pass ? null : (
        <p className="text-sm font-bold">
          <RubyText text="もう いちど はじめから 話すと、数は 数え直します。" index={index} show />
        </p>
      )}

      {/* **これを 押すまで「おわった」を 書かない**（上のコメント）。 */}
      <button
        type="button"
        disabled={closed}
        onClick={() => {
          setClosed(true);
          onClose();
        }}
        className="btn-island btn-game w-full px-6 py-3 disabled:opacity-45"
      >
        <RubyText text={closed ? "読みました" : "けっかを 読みました ▶"} index={index} show />
      </button>
    </div>
  );
}

function Chat({ lines, index }: { lines: readonly ChatLine[]; index: FuriganaIndex }) {
  const box = useRef<HTMLDivElement>(null);
  /* 行が 増えたら いちばん下へ。受け止め・采配・閉じの ことばが 箱の 中に 隠れる。 */
  useEffect(() => {
    const node = box.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [lines]);
  return (
    <div ref={box} className="card-island h-[46vh] overflow-y-auto p-3 text-sm sm:h-[62vh]">
      {lines.map((line, at) => (
        <p key={at} className={`mb-2 font-bold ${line.self ? "text-blue-deep" : ""}`}>
          {/* 名前も 教材の 字（富田・奥田）。ルビを 通さないと 裸の 漢字に なる。 */}
          <span className="text-ink-soft mr-1 text-[11px] font-black">
            <RubyText text={line.who} index={index} show />
          </span>
          <RubyText text={line.text} index={index} show />
        </p>
      ))}
    </div>
  );
}

/** 教材の パネルを 判定の 形へ。`fact` は 画面に 出さない（AIに 渡す 材料）。 */
function toPanels(scene: Scene | undefined): ReportPanel[] {
  if (!scene) return [];
  return scene.panels.map((panel) => ({
    id: panel.id,
    label: panel.label,
    openAt: panel.openAt,
    rule: panel.rule,
    facts: panel.facts.map((fact) => ({
      id: fact.id,
      box: fact.box,
      keywords: fact.keywords,
      minHits: fact.minHits,
      allOf: fact.allOf,
    })),
  }));
}

/**
 * カードの 顔。**⭕ は「ぜんぶ 言えた」（`full`）とき だけ**（2026-09-11）。
 *
 * `open`（1つでも 言えた）を ⭕ に して いた ころ、こまりごとの 3つの 箱の
 * うち 1つしか 言えて いない のに 板は「4 / 4」で、司会は 聞き返しつづけて
 * いた——**画面の 数と 会話が 別の ことを 言って いた**。
 */
function faceOf(state: PanelState | undefined, asked: boolean): CardState {
  if (!state) return "closed";
  if (state.gaveUp) return "missed";
  if (state.full) return "open";
  if (state.open || asked) return "asked";
  return "closed";
}
