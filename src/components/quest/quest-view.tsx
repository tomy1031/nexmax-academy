"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Quest } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { buildFuriganaIndex } from "@/lib/text/furigana";
import { recordContentProgress } from "@/lib/progress/store";
import {
  clearQuestLocal,
  loadQuestSave,
  readQuestLocal,
  saveQuestLocal,
  writeQuestSave,
} from "@/lib/quest/save";
import {
  createQuestState,
  furtherAlong,
  questReducer,
  type QuestAction,
  type QuestMember,
  type QuestState,
} from "@/lib/quest/state";
import { QuestPlay } from "./quest-play";
import { QuestResult } from "./quest-result";
import { QuestSetup } from "./quest-setup";
import { PlayerFace } from "./quest-art";
import { QuestWindow } from "./quest-window";

/**
 * ゆれ（原典の `.animate-shake`）。**globals.css には 置かない**——
 * ゲームでしか 使わない 動きなので、テーマの 共有ファイルを 太らせない。
 */
const QUEST_KEYFRAMES = `
@keyframes quest-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px) rotate(-1deg); }
  40%, 80% { transform: translateX(5px) rotate(1deg); }
}
@media (prefers-reduced-motion: reduce) {
  .quest-shell *, .quest-shell *::before, .quest-shell *::after {
    animation: none !important;
  }
}
`;

const UI_FURIGANA = buildFuriganaIndex([
  ["続", "つづ"],
  ["場面", "ばめん"],
  ["最初", "さいしょ"],
  ["遊", "あそ"],
  ["人", "にん"],
]);

/**
 * クエスト（旧 `waterfall_quest.html`）の 司令塔
 *
 * 画面は **ルーティングせず**、1つの クライアントコンポーネントの 中で
 * 判別可能ユニオンで 切り替える（`arcade-game.tsx` と 同じ 作り）。
 * ゲームの 途中で URL が 変わると、戻る ボタンで 状態が 割れる からである。
 *
 * ## 保存の 使い分け（負荷対策・願い #285）
 * - **1手ごと** … 端末（localStorage）。通信しない。閉じても 消えない
 * - **節目だけ** … Supabase の `quest_saves`。「場面クリア」「おしまい」「クリア」の 3つ
 *
 * 1回の 遊びで DB を 叩くのは 30回ほど（30場面 ＋ 終わりの 1回）。1手ごとに 書くと
 * 120回に なり、教室の 1つの IP から 一斉に 出る ことに なる。
 */
export function QuestView({ quest, embedded }: { quest: Quest; embedded?: boolean }) {
  const furigana = useMemo(() => buildFuriganaIndex(quest.furigana ?? []), [quest.furigana]);
  const [furiganaOn, setFuriganaOn] = useState(true);

  const [state, setState] = useState<QuestState | null>(null);
  /** セーブを 探して いる あいだ（えらぶ 画面の ボタンを 止める）。 */
  const [busy, setBusy] = useState(false);
  /** つづきが 見つかった ときの 分かれ道。 */
  const [resume, setResume] = useState<{
    members: readonly QuestMember[];
    saved: QuestState;
  } | null>(null);

  /*
   * 進行は ref にも 持つ。**保存は 状態更新関数の 中で しない**——React は
   * 更新関数を 2度 呼ぶ ことが あり、そこに 通信を 置くと 書き込みが 倍に なる。
   */
  const stateRef = useRef<QuestState | null>(null);
  const membersRef = useRef<readonly string[]>([]);
  const rowIdRef = useRef<string | null>(null);

  const begin = useCallback(
    (next: QuestState, memberIds: readonly string[], rowId: string | null) => {
      stateRef.current = next;
      membersRef.current = memberIds;
      rowIdRef.current = rowId;
      setState(next);
      setResume(null);
      recordContentProgress(quest.id, { status: "started" });
      saveQuestLocal(next, memberIds);
    },
    [quest.id],
  );

  /** えらび終わった。つづきが あれば 分かれ道を 出し、無ければ そのまま 始める。 */
  const onStart = useCallback(
    (members: readonly QuestMember[]) => {
      const memberIds = members.map((member) => member.id);
      setBusy(true);
      void (async () => {
        const remote = await loadQuestSave(quest, memberIds);
        // 端末は 1手ごと・DB は 節目だけ なので、**進んで いる ほう**を 取る
        const saved = furtherAlong(remote?.state ?? null, readQuestLocal(quest, memberIds));
        rowIdRef.current = remote?.rowId ?? null;
        setBusy(false);
        if (saved && saved.status.kind === "playing") {
          membersRef.current = memberIds;
          setResume({ members, saved });
          return;
        }
        begin(createQuestState(quest, members), memberIds, remote?.rowId ?? null);
      })();
    },
    [begin, quest],
  );

  /** 節目だけ DB へ 送る。学習者の 画面は 待たない（送りっぱなし）。 */
  const persist = useCallback((next: QuestState) => {
    void (async () => {
      const rowId = await writeQuestSave({
        state: next,
        memberIds: membersRef.current,
        rowId: rowIdRef.current,
      });
      if (rowId) rowIdRef.current = rowId;
    })();
  }, []);

  const dispatch = useCallback(
    (action: QuestAction) => {
      const current = stateRef.current;
      if (!current) return;
      const next = questReducer(quest, current, action);
      if (next === current) return;

      stateRef.current = next;
      setState(next);

      // 1手ごとに 端末へ（通信しない）
      saveQuestLocal(next, membersRef.current);

      /*
       * 節目＝**場面が 1つ 進んだ**か、**遊びが 終わった**か。
       * `clearedPhases` は `advance` の ときにしか 増えない ので、
       * 1つの 場面で 何回 外しても DB への 書き込みは 増えない。
       */
      const milestone =
        next.clearedPhases > current.clearedPhases ||
        (current.status.kind === "playing" && next.status.kind !== "playing");
      if (!milestone) return;

      if (next.status.kind === "cleared") {
        recordContentProgress(quest.id, { status: "completed" });
      }
      persist(next);
    },
    [persist, quest],
  );

  const restart = useCallback(() => {
    clearQuestLocal(quest.id, membersRef.current);
    stateRef.current = null;
    setState(null);
    setResume(null);
  }, [quest.id]);

  const body = (() => {
    if (resume) {
      return (
        <ResumeChoice
          resume={resume}
          onResume={() => begin(resume.saved, membersRef.current, rowIdRef.current)}
          onFresh={() => {
            clearQuestLocal(quest.id, membersRef.current);
            begin(createQuestState(quest, resume.members), membersRef.current, rowIdRef.current);
          }}
        />
      );
    }
    if (!state) return <QuestSetup title={quest.title} onStart={onStart} busy={busy} />;
    if (state.status.kind !== "playing" && state.event === null) {
      return <QuestResult quest={quest} state={state} onRestart={restart} />;
    }
    return (
      <QuestPlay
        quest={quest}
        state={state}
        dispatch={dispatch}
        furigana={furigana}
        furiganaOn={furiganaOn}
        onToggleFurigana={() => setFuriganaOn((on) => !on)}
      />
    );
  })();

  /*
   * ## ゲームの 場を 黒で 囲う
   * 2026-09-01 の 指定「ゲーム風UIが 売り」。ステージの 中に 埋めこんでも、
   * ここから 内側は **黒地・等幅の ゲーム画面**に する。`-mx-*` で 親の
   * 余白を 打ち消し、画面の はしまで 黒を 伸ばす——枠の 外に サイトの 白が
   * 残ると「ページの 中の 部品」に 見えて、遊びの 場に 入った 感じが 出ない。
   *
   * **数字は 親（`content-frame.tsx` の `px-3 sm:px-5`）と そろえる。**
   * 多く 引くと その ぶん 横に あふれ、390px で 横スクロールが 出る。
   */
  return (
    <div
      data-quest="shell"
      className={`quest-shell bg-black font-mono text-slate-100 ${
        embedded ? "-mx-3 sm:-mx-5" : "min-h-[100dvh]"
      }`}
    >
      <style>{QUEST_KEYFRAMES}</style>
      {body}
    </div>
  );
}

/**
 * つづきが 見つかった ときの 分かれ道。
 * **同じ 組なら 同じ セーブに 戻る**（`quest_saves` は 組で 1行）。
 */
function ResumeChoice({
  resume,
  onResume,
  onFresh,
}: {
  resume: { members: readonly QuestMember[]; saved: QuestState };
  onResume: () => void;
  onFresh: () => void;
}) {
  return (
    <div className="flex items-center justify-center px-2 py-6">
      <QuestWindow title="CONTINUE" className="w-full max-w-md">
        <h2 className="mt-2 text-xl font-bold tracking-widest text-yellow-300">
          <RubyText text="つづきが ありました" index={UI_FURIGANA} />
        </h2>
        <p className="mt-2 text-sm font-bold text-white">
          <RubyText
            text={`場面 ${resume.saved.clearedPhases + 1} から つづけられます。`}
            index={UI_FURIGANA}
          />
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {resume.saved.players.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-2 rounded border border-slate-600 bg-black px-2 py-1"
            >
              <PlayerFace player={player} size={24} />
              <span className="text-xs font-bold text-white">{player.name}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            data-quest="resume"
            onClick={onResume}
            className="w-full rounded border-2 border-white bg-blue-800 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            <RubyText text="つづきから" index={UI_FURIGANA} />
          </button>
          <button
            type="button"
            data-quest="fresh"
            onClick={onFresh}
            className="w-full rounded border-2 border-white bg-slate-800 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-700"
          >
            <RubyText text="最初から" index={UI_FURIGANA} />
          </button>
        </div>
      </QuestWindow>
    </div>
  );
}
