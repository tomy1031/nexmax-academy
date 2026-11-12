"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Meeting, Novel, NovelFailureType, NovelScene } from "@/content/schema";
import { DictionaryText } from "@/components/dictionary-text";
import { RubyText } from "@/components/ruby-text";
import { dropJudgeSession } from "@/components/meeting/judge-api";
import { useLiveVoice } from "@/components/meeting/use-live-voice";
import { getGeminiKey, saveGeminiKey } from "@/lib/profile";
import { assetUrl } from "@/lib/asset-url";
import { readContentProgress, recordContentProgress } from "@/lib/progress/store";
import {
  addFailure,
  allConsults,
  emptySave,
  FAILURE_LABELS,
  isInteractive,
  logUpTo,
  mostCommonFailure,
  noticeBefore,
  normalizeSave,
  saveKey,
  STEP_BAR,
  viewAt,
  type NovelFace,
  type NovelSave,
  type NovelSettings,
} from "@/lib/novel/state";
import {
  annotateRuby,
  buildFuriganaIndex,
  mergeFuriganaEntries,
  type FuriganaIndex,
} from "@/lib/text/furigana";
import { ConsultPanel } from "./consult-panel";
import { DevScreen } from "./dev-screen";
import { ChoosePanel, NoticePanel, SelfFixPanel } from "./novel-panels";
import { playNovelSe } from "./novel-sound";
import { NOVEL_UI_FURIGANA } from "./ui-furigana";

/**
 * 相談の 練習（サウンドノベル版・仕様書 v4）。
 *
 * 一本道の セリフ送り。毎日「目的 → 気づき → 相談 → 結果」を 同じ 順に くり返す。
 * プログラムは 教材の「場面の 列」を 先頭から 再生する だけで、背景・立ち絵・開発中の
 * 画面は その日の 最初から 計算し直す（`viewAt`）——どこへ 戻っても 表示が ずれない。
 *
 * 操作: クリック・タップ・Enter・Space で つぎへ（文字を 出して いる 途中なら 全文を 出す）。
 * 「もどる」と ← で 1つ 戻る。ログから 行を 選んでも 戻れる。自動送りと スキップは 付けない
 *（読む 時間を 学生が 決める）。
 */

type Scene = NovelScene;

const TYPE_MS = 32;

function readSave(id: string, novel: Novel): NovelSave {
  try {
    const raw = window.localStorage.getItem(saveKey(id));
    return normalizeSave(raw ? JSON.parse(raw) : null, novel);
  } catch {
    return emptySave();
  }
}

function writeSave(id: string, save: NovelSave): void {
  try {
    window.localStorage.setItem(saveKey(id), JSON.stringify(save));
  } catch {
    // 保存できない 端末（プライベート ブラウズ など）では 黙る。学習は 止めない
  }
}

export function NovelSession({ meeting }: { meeting: Meeting }) {
  const novel = meeting.novel;
  if (!novel) return null;
  return <NovelPlayer meeting={meeting} novel={novel} />;
}

function NovelPlayer({ meeting, novel }: { meeting: Meeting; novel: Novel }) {
  const [save, setSave] = useState<NovelSave>(() => emptySave());
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<"title" | "play">("title");
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const local = readSave(meeting.id, novel);
      /*
       * **ログアウトで 消えても 日は 戻せる**（2026-11-12 の 検収）。共用の PC では
       * ログアウトの たびに `nexmax.` の 保存が 消える。進んだ 日は 学習の 記録
       *（`recordContentProgress` の しおり）にも 残して あるので、そこから 戻す。
       */
      const mark = readContentProgress(meeting.id)?.position;
      const lastDay = novel.days.length - 1;
      const markDay = Math.min(lastDay, Math.max(0, Math.floor(mark?.maxDay ?? 0)));
      setSave(
        markDay > local.maxDay
          ? {
              ...local,
              maxDay: markDay,
              day: Math.min(lastDay, Math.floor(mark?.day ?? markDay)),
              index: 0,
            }
          : local,
      );
      setHasKey(Boolean(getGeminiKey()));
      setLoaded(true);
    });
  }, [meeting.id, novel]);

  useEffect(() => {
    if (loaded) writeSave(meeting.id, save);
  }, [loaded, meeting.id, save]);

  /* 画面を 離れる とき、判定の つなぎを 閉じる（モジュールに 1本 張りっぱなしの ため）。 */
  useEffect(() => () => dropJudgeSession(), []);

  const index = useMemo(
    () => buildFuriganaIndex(mergeFuriganaEntries(NOVEL_UI_FURIGANA, meeting.furigana ?? [])),
    [meeting.furigana],
  );
  const show = save.settings.furigana;

  if (!loaded) {
    return <div className="h-64" aria-busy />;
  }

  if (screen === "title") {
    return (
      <TitleScreen
        meeting={meeting}
        novel={novel}
        save={save}
        index={index}
        show={show}
        hasKey={hasKey}
        onKeySaved={() => setHasKey(true)}
        onStart={(day, fromSave) => {
          setSave((now) => ({
            ...now,
            day,
            index: fromSave && now.day === day ? now.index : 0,
            maxDay: Math.max(now.maxDay, day),
          }));
          recordContentProgress(meeting.id, {
            status: "started",
            position: { day, maxDay: Math.max(save.maxDay, day) },
          });
          setScreen("play");
        }}
      />
    );
  }

  return (
    <Player
      meeting={meeting}
      novel={novel}
      save={save}
      setSave={setSave}
      index={index}
      hasKey={hasKey}
      onTitle={() => setScreen("title")}
    />
  );
}

/* ------------------------------------------------------------------ *
 * タイトル画面（日を えらぶ・つづきから・APIキー）
 * ------------------------------------------------------------------ */

function TitleScreen({
  meeting,
  novel,
  save,
  index,
  show,
  hasKey,
  onKeySaved,
  onStart,
}: {
  meeting: Meeting;
  novel: Novel;
  save: NovelSave;
  index: FuriganaIndex;
  show: boolean;
  hasKey: boolean;
  onKeySaved: () => void;
  onStart: (day: number, fromSave: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const begun = save.index > 0 || save.day > 0 || save.cleared.length > 0;
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      data-testid="novel-title"
      data-furigana={show ? "on" : "off"}
    >
      <Image
        src={assetUrl(novel.backgrounds.morning ?? Object.values(novel.backgrounds)[0]) ?? ""}
        alt=""
        fill
        sizes="100vw"
        className="object-cover opacity-40"
        aria-hidden
      />
      <div className="relative space-y-4 p-4 sm:p-6">
        <div className="card-island space-y-2 p-4">
          <h2 className="text-navy text-xl font-black">
            <RubyText text={meeting.title} index={index} show={show} />
          </h2>
          <p className="text-ink-soft text-sm font-bold">
            <RubyText text={meeting.description} index={index} show={show} />
          </p>
          <ol className="grid grid-cols-4 gap-1 text-center text-xs font-black">
            {STEP_BAR.map((step, i) => (
              <li key={step.step} className="text-navy bg-panel-tint rounded-lg px-1 py-1.5">
                {i > 0 ? "→ " : ""}
                <RubyText text={step.label} index={index} show={show} />
              </li>
            ))}
          </ol>
          <p className="text-navy text-sm font-bold">
            💡 <RubyText text={meeting.focus} index={index} show={show} />
          </p>
        </div>

        {!hasKey ? (
          <div className="card-island space-y-2 p-4" data-testid="novel-key">
            <p className="text-navy text-sm font-black">
              🔑{" "}
              <RubyText
                text="相談は Gemini（AI）が 聞いて 見ます。Geminiの APIキーを 入れて ください。キーが ない ときは、お手本を 読んで 進みます。"
                index={index}
                show={show}
              />
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                className="border-hairline min-w-0 flex-1 rounded-xl border-2 bg-white px-3 py-2 text-sm"
                aria-label="Gemini の APIキー"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={!key.trim()}
                onClick={() => {
                  saveGeminiKey(key.trim());
                  onKeySaved();
                }}
                className="btn-island btn-game px-4 py-2 disabled:opacity-40"
              >
                <RubyText text="保存" index={index} show={show} />
              </button>
            </div>
            <p className="text-ink-soft text-xs font-bold">
              <Link href="/map/settings" prefetch={false} className="text-navy underline">
                <RubyText text="設定の ページ" index={index} show={show} />
              </Link>
              <RubyText text="でも 入れられます。" index={index} show={show} />
            </p>
          </div>
        ) : null}

        <div className="card-island space-y-3 p-4">
          {begun ? (
            <button
              type="button"
              onClick={() => onStart(save.day, true)}
              className="btn-island btn-game w-full px-6 py-3 disabled:opacity-40"
              data-testid="novel-continue"
            >
              <RubyText
                text={`つづきから（${novel.days[save.day]?.label ?? ""}）`}
                index={index}
                show={show}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStart(0, false)}
              className="btn-island btn-game w-full px-6 py-3 disabled:opacity-40"
              data-testid="novel-start"
            >
              はじめる
            </button>
          )}
          <div>
            <p className="text-ink-soft mb-1 text-xs font-black">
              <RubyText text="日を えらぶ" index={index} show={show} />
            </p>
            <p className="text-ink-soft mb-1 text-[11px] font-bold">
              <RubyText text="前の 日を 終えると、次の 日が 開きます。" index={index} show={show} />
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {novel.days.map((day, i) => (
                <button
                  key={day.id}
                  type="button"
                  disabled={i > save.maxDay}
                  onClick={() => onStart(i, false)}
                  className="border-hairline bg-panel text-navy rounded-xl border-2 px-1 py-2 text-xs font-black disabled:opacity-40"
                  data-day={day.id}
                >
                  <RubyText text={day.label} index={index} show={show} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * セリフを 送る 画面
 * ------------------------------------------------------------------ */

function speakerLabel(novel: Novel, scene: Extract<Scene, { type: "line" }>): string {
  if (scene.speaker === "narration") return "";
  if (scene.speaker === "me") return "あなた";
  if (scene.speaker === "thought") return "あなた（心の 声）";
  const person = novel.cast.find((one) => one.id === scene.speaker);
  if (!person) return "";
  return scene.via === "message" ? `${person.name}さん（メッセージ）` : `${person.name}さん`;
}

function Player({
  meeting,
  novel,
  save,
  setSave,
  index,
  hasKey,
  onTitle,
}: {
  meeting: Meeting;
  novel: Novel;
  save: NovelSave;
  setSave: React.Dispatch<React.SetStateAction<NovelSave>>;
  index: FuriganaIndex;
  hasKey: boolean;
  onTitle: () => void;
}) {
  const voice = useLiveVoice({ listenOnly: true, muted: true });
  /** 相談の 判定を 待って いる あいだ（もどる・ログ・日を えらぶ を 止める）。 */
  const [judging, setJudging] = useState(false);
  const onBusy = useCallback((busy: boolean) => setJudging(busy), []);
  const day = novel.days[save.day] ?? novel.days[0];
  const scene = day?.scenes[save.index];
  const show = save.settings.furigana;
  const translation = save.settings.translation;
  const view = viewAt(novel, save.day, save.index);
  const [faceOverride, setFaceOverride] = useState<NovelFace | null>(null);
  const [typedAll, setTypedAll] = useState(true);
  const [reach, setReach] = useState(save.index);
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shown, setShown] = useState<{ day: number; index: number }>({
    day: save.day,
    index: save.index,
  });

  /* 場面が 変わった ときの 後始末（顔の 差しかえを 戻す・届いた 所を 覚える） */
  if (shown.day !== save.day || shown.index !== save.index) {
    setShown({ day: save.day, index: save.index });
    setFaceOverride(null);
    setTypedAll(true);
    setReach((now) => (shown.day !== save.day ? save.index : Math.max(now, save.index)));
  }

  /* 効果音（場面に 書いて ある もの）。戻って 来た ときも 鳴らす（同じ 場面を 読み直す）。 */
  useEffect(() => {
    if (scene?.type === "line" && scene.se) playNovelSe(scene.se, save.settings.volume);
    // 場面が 変わった ときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.day, save.index]);

  const cleared = useCallback((id: string) => save.cleared.includes(id), [save.cleared]);
  const markCleared = useCallback(
    (id: string) =>
      setSave((now) =>
        now.cleared.includes(id) ? now : { ...now, cleared: [...now.cleared, id] },
      ),
    [setSave],
  );

  const goTo = useCallback(
    (nextIndex: number) => setSave((now) => ({ ...now, index: nextIndex })),
    [setSave],
  );

  const lastIndex = (day?.scenes.length ?? 1) - 1;
  const atDayEnd = save.index >= lastIndex;
  const isLastDay = save.day >= novel.days.length - 1;

  /* つぎへ（手で 覚えさせない——React Compiler に まかせる） */
  const next = () => {
    if (!scene) return;
    if (!typedAll) {
      setTypedAll(true);
      return;
    }
    if (isInteractive(scene) && !cleared(scene.id)) return;
    if (scene.type === "ending") return;
    if (!atDayEnd) {
      goTo(save.index + 1);
      return;
    }
    if (!isLastDay) {
      setSave((now) => ({
        ...now,
        day: now.day + 1,
        index: 0,
        maxDay: Math.max(now.maxDay, now.day + 1),
      }));
    }
  };

  const back = () => {
    if (save.index > 0) goTo(save.index - 1);
  };

  /* キー操作（Enter・Space で つぎへ、← で もどる）。入力欄と ボタンの 上では 何も しない。 */
  const keys = useRef({ next, back, judging });
  useEffect(() => {
    keys.current = { next, back, judging };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [contenteditable='true']")) return;
      if (logOpen || settingsOpen || keys.current.judging) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        keys.current.back();
      } else if (event.key === "Enter" || event.key === " ") {
        if (scene && !isInteractive(scene)) {
          event.preventDefault();
          keys.current.next();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, logOpen, settingsOpen]);

  /* 進んだ 日を 学習の 記録にも 残す（ログアウトで ブラウザの 保存が 消えても 日は 戻せる） */
  useEffect(() => {
    recordContentProgress(meeting.id, {
      status: "started",
      position: { day: save.day, maxDay: save.maxDay },
    });
  }, [meeting.id, save.day, save.maxDay]);

  /* 5日 ぜんぶ 終えた */
  useEffect(() => {
    if (scene?.type !== "ending" || save.finished) return;
    recordContentProgress(meeting.id, { status: "completed" });
    void Promise.resolve().then(() => setSave((now) => ({ ...now, finished: true })));
  }, [scene?.type, save.finished, meeting.id, setSave]);

  if (!day || !scene) return null;

  const figurePerson = view.figure ? novel.cast.find((one) => one.id === view.figure) : null;
  const face = faceOverride ?? view.face;
  const figureSrc = figurePerson?.figures?.[face] ?? null;
  const readable =
    scene.type === "line" ||
    scene.type === "goal" ||
    scene.type === "point" ||
    scene.type === "screen";
  const setSettings = (patch: Partial<NovelSettings>) =>
    setSave((now) => ({ ...now, settings: { ...now.settings, ...patch } }));

  return (
    <div
      className="space-y-2"
      data-testid="novel-player"
      data-scene={scene.id}
      data-furigana={show ? "on" : "off"}
    >
      {/* ステップバーと 日 */}
      <div className="flex items-center gap-2">
        <span
          className="text-on-accent shrink-0 rounded-full px-3 py-1 text-xs font-black"
          style={{ background: "var(--color-navy)" }}
          data-testid="novel-day"
        >
          <RubyText text={day.label} index={index} show={show} />
        </span>
        <ol className="grid flex-1 grid-cols-4 gap-1" aria-label="今日の ステップ">
          {STEP_BAR.map((step, i) => {
            const on = view.step === step.step;
            return (
              <li
                key={step.step}
                aria-current={on ? "step" : undefined}
                className="rounded-lg px-1 py-1 text-center text-[11px] font-black sm:text-xs"
                style={{
                  background: on ? "var(--color-coral)" : "var(--color-panel-tint)",
                  color: on ? "var(--color-on-accent)" : "var(--color-navy)",
                }}
              >
                {i > 0 ? "→ " : ""}
                <RubyText text={step.label} index={index} show={show} />
              </li>
            );
          })}
        </ol>
      </div>

      {/* 今日の 目的カード（goal を 通ったら その日 ずっと 見える） */}
      {view.goal ? (
        <p
          className="rounded-xl border-2 px-3 py-1.5 text-xs font-black sm:text-sm"
          style={{ borderColor: "var(--color-sky)", background: "var(--color-sky-soft)" }}
          data-testid="novel-goal"
        >
          🎯 <RubyText text={view.goal} index={index} show={show} />
        </p>
      ) : null}
      {day.words.length > 0 ? (
        <p
          className="text-navy flex flex-wrap items-center gap-1.5 text-xs font-bold"
          data-testid="novel-words"
        >
          <span className="font-black">
            📘 <RubyText text="今日の ことば" index={index} show={show} />
          </span>
          {day.words.map((word) => (
            <span key={word} className="rounded-full bg-white px-2 py-0.5">
              <DictionaryText text={word} index={index} show={show} />
            </span>
          ))}
        </p>
      ) : null}

      {/* 舞台（背景・立ち絵・開発中の 画面・セリフ枠） */}
      <div
        className={`relative w-full overflow-hidden rounded-2xl ${
          readable ? "aspect-[4/3] sm:aspect-[16/9]" : "aspect-[16/9] sm:aspect-[21/9]"
        }`}
        style={{ background: "var(--color-ink)" }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a, input")) return;
          if (readable) next();
        }}
        data-testid="novel-stage"
      >
        {view.bg ? (
          <Image
            src={assetUrl(view.bg) ?? view.bg}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            aria-hidden
          />
        ) : null}

        <AnimatePresence mode="wait">
          {figureSrc ? (
            <motion.div
              key={figureSrc}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute right-0 bottom-0 h-[78%] w-[62%] sm:h-[92%] sm:w-[44%]"
            >
              <Image
                src={assetUrl(figureSrc) ?? figureSrc}
                alt={figurePerson ? `${figurePerson.name}さん` : ""}
                fill
                sizes="50vw"
                className="object-contain object-bottom"
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* 開発中の 画面（小さい 窓・常に 見える） */}
        <div className="absolute top-2 left-2 max-h-[48%] w-[42%] max-w-[230px] overflow-hidden sm:w-[30%]">
          <p
            className="mb-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-black text-white"
            style={{ background: "rgba(15, 35, 70, 0.75)" }}
          >
            💻 <RubyText text="開発中の 画面" index={index} show={show} />
          </p>
          <DevScreen screen={view.screen} index={index} show={show} testId="novel-devscreen" />
        </div>

        {view.dark ? <div className="absolute inset-0 bg-black/60" aria-hidden /> : null}

        {readable ? (
          <MessageWindow
            novel={novel}
            scene={scene}
            index={index}
            show={show}
            translation={translation}
            typedAll={typedAll}
            onTyped={setTypedAll}
            onNext={next}
            dayEnd={atDayEnd && !isLastDay}
          />
        ) : null}
      </div>

      {/* 操作が 要る 場面 */}
      {scene.type === "notice" ? (
        <NoticePanel
          key={scene.id}
          scene={scene}
          index={index}
          show={show}
          translation={translation}
          cleared={cleared(scene.id)}
          onWrong={() => playNovelSe("retry", save.settings.volume)}
          onSolved={() => {
            playNovelSe("notice", save.settings.volume);
            markCleared(scene.id);
          }}
          onNext={() => goTo(save.index + 1)}
        />
      ) : null}
      {scene.type === "choose_person" ? (
        <ChoosePanel
          key={scene.id}
          scene={scene}
          cast={novel.cast}
          index={index}
          show={show}
          translation={translation}
          cleared={cleared(scene.id)}
          onWrong={() => playNovelSe("retry", save.settings.volume)}
          onSolved={() => {
            markCleared(scene.id);
            goTo(save.index + 1);
          }}
        />
      ) : null}
      {scene.type === "self_fix" ? (
        <SelfFixPanel
          key={scene.id}
          scene={scene}
          index={index}
          show={show}
          translation={translation}
          cleared={cleared(scene.id)}
          onFixed={() => {
            playNovelSe("notice", save.settings.volume);
            markCleared(scene.id);
          }}
          onNext={() => goTo(save.index + 1)}
        />
      ) : null}
      {scene.type === "consult" ? (
        <ConsultPanel
          key={scene.id}
          scene={scene}
          novel={novel}
          notice={noticeBefore(day, save.index)}
          partnerName={novel.cast.find((one) => one.id === scene.to)?.name ?? ""}
          fails={save.attempts[scene.id]?.fails ?? 0}
          cleared={cleared(scene.id)}
          stars={save.stars[scene.id] ?? 0}
          hasKey={hasKey}
          index={index}
          show={show}
          translation={translation}
          volume={save.settings.volume}
          voice={voice}
          onFace={setFaceOverride}
          onBusy={onBusy}
          onFail={(type: NovelFailureType) =>
            setSave((now) => ({ ...now, attempts: addFailure(now.attempts, scene.id, type) }))
          }
          onPassed={(stars) =>
            setSave((now) => ({
              ...now,
              stars: { ...now.stars, [scene.id]: Math.max(now.stars[scene.id] ?? 0, stars) },
              cleared: now.cleared.includes(scene.id) ? now.cleared : [...now.cleared, scene.id],
            }))
          }
          onNext={() => goTo(save.index + 1)}
        />
      ) : null}
      {scene.type === "screen" ? (
        <div className="grid gap-2 sm:grid-cols-2" data-testid="novel-screen-change">
          <div>
            <p className="text-ink-soft mb-1 text-xs font-black">
              <RubyText text="前" index={index} show={show} />
            </p>
            <DevScreen screen={scene.before} index={index} show={show} size="large" />
          </div>
          <div>
            <p className="text-coral-deep mb-1 text-xs font-black">
              <RubyText text="後" index={index} show={show} /> ✨
            </p>
            <DevScreen screen={scene.after} index={index} show={show} size="large" />
          </div>
        </div>
      ) : null}
      {scene.type === "ending" ? (
        <Ending
          novel={novel}
          save={save}
          text={scene.text}
          index={index}
          show={show}
          onTitle={onTitle}
        />
      ) : null}

      {/* ボタン（もどる・ログ・ふりがな・訳・設定） */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton onClick={back} disabled={save.index === 0 || judging} testId="novel-back">
          ◀ もどる
        </ToolButton>
        <ToolButton onClick={() => setLogOpen(true)} disabled={judging} testId="novel-log-button">
          🗒 ログ
        </ToolButton>
        <ToolButton
          onClick={() => setSettings({ furigana: !show })}
          pressed={show}
          testId="novel-furigana"
        >
          ふりがな
        </ToolButton>
        <ToolButton
          onClick={() => setSettings({ translation: !translation })}
          pressed={translation}
          testId="novel-translation"
        >
          <RubyText text="訳" index={index} show={show} /> EN
        </ToolButton>
        <ToolButton onClick={() => setSettingsOpen(true)} testId="novel-settings">
          ⚙ <RubyText text="設定" index={index} show={show} />
        </ToolButton>
        <ToolButton onClick={onTitle} disabled={judging} testId="novel-to-title">
          <RubyText text="日を えらぶ" index={index} show={show} />
        </ToolButton>
      </div>

      {logOpen ? (
        <LogModal
          novel={novel}
          day={day}
          upTo={Math.max(reach, save.index)}
          index={index}
          show={show}
          translation={translation}
          onPick={(at) => {
            goTo(at);
            setLogOpen(false);
          }}
          onClose={() => setLogOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsModal
          settings={save.settings}
          index={index}
          show={show}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ToolButton({
  onClick,
  disabled,
  pressed,
  testId,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-testid={testId}
      className="rounded-full border-2 px-3 py-1.5 text-xs font-black disabled:opacity-40"
      style={{
        borderColor: pressed ? "var(--color-navy)" : "var(--color-hairline)",
        background: pressed ? "var(--color-sky-soft)" : "var(--color-panel)",
        color: "var(--color-navy)",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * セリフ枠（1文字ずつ 出す）
 * ------------------------------------------------------------------ */

function MessageWindow({
  novel,
  scene,
  index,
  show,
  translation,
  typedAll,
  onTyped,
  onNext,
  dayEnd,
}: {
  novel: Novel;
  scene: Extract<Scene, { type: "line" | "goal" | "point" | "screen" }>;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  typedAll: boolean;
  onTyped: (done: boolean) => void;
  onNext: () => void;
  dayEnd: boolean;
}) {
  const label =
    scene.type === "line"
      ? speakerLabel(novel, scene)
      : scene.type === "goal"
        ? "今日の 目的"
        : scene.type === "point"
          ? "今日の ポイント"
          : "開発中の 画面";
  const message = scene.type === "line" && scene.via === "message";
  const thought = scene.type === "line" && scene.speaker === "thought";
  const big = scene.type === "point" || scene.type === "goal";
  return (
    <div className="absolute inset-x-2 bottom-2 sm:inset-x-4 sm:bottom-3">
      <div
        className="rounded-2xl border-2 px-3 py-2 shadow-lg sm:px-4 sm:py-3"
        style={{
          borderColor: big
            ? "var(--color-sun)"
            : message
              ? "var(--color-leaf)"
              : "var(--color-hairline)",
          background: thought ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.96)",
        }}
        data-testid="novel-message"
        data-scene={scene.id}
      >
        {label ? (
          <p className="text-coral-deep mb-0.5 text-xs font-black">
            {message ? "💬 " : big ? "⭐ " : ""}
            <RubyText text={label} index={index} show={show} />
          </p>
        ) : null}
        <p
          className={`text-navy leading-relaxed font-bold ${big ? "text-base sm:text-lg" : "text-sm sm:text-base"} ${thought ? "italic" : ""}`}
        >
          <TypedLine
            key={scene.id}
            text={scene.text}
            index={index}
            show={show}
            done={typedAll}
            onDone={onTyped}
          />
        </p>
        {translation && scene.en ? (
          <p className="text-ink-soft mt-0.5 text-xs font-medium sm:text-sm">{scene.en}</p>
        ) : null}
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={onNext}
            className="text-navy rounded-full px-2 text-xs font-black"
            data-testid="novel-next"
            aria-label="つぎへ"
          >
            {dayEnd ? (
              <RubyText text="次の 日へ ▶" index={index} show={show} />
            ) : typedAll ? (
              "▼"
            ) : (
              "…"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 1文字ずつ 出す。ルビの ことばは **ことばの 頭に 来たら まとめて 出す**（ルビの 途中で
 * 切ると、読みが 半分だけ 見える）。出し終わったら 辞書の 下線つきで 描き直す。
 */
function TypedLine({
  text,
  index,
  show,
  done,
  onDone,
}: {
  text: string;
  index: FuriganaIndex;
  show: boolean;
  done: boolean;
  onDone: (done: boolean) => void;
}) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      onDone(false);
    }
  }, [onDone]);
  useEffect(() => {
    if (done) return;
    if (count >= text.length) {
      onDone(true);
      return;
    }
    const timer = window.setTimeout(() => setCount((n) => n + 1), TYPE_MS);
    return () => window.clearTimeout(timer);
  }, [count, done, text.length, onDone]);

  if (done) return <DictionaryText text={text} index={index} show={show} />;

  const segments = annotateRuby(text, index);
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [i, segment] of segments.entries()) {
    if (at >= count) break;
    if (segment.reading) {
      parts.push(
        show ? (
          <ruby key={i}>
            {segment.text}
            <rt>{segment.reading}</rt>
          </ruby>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      );
    } else {
      parts.push(<span key={i}>{segment.text.slice(0, Math.max(0, count - at))}</span>);
    }
    at += segment.text.length;
  }
  return <span aria-label={text}>{parts}</span>;
}

/* ------------------------------------------------------------------ *
 * ログ・設定・おわりの まとめ
 * ------------------------------------------------------------------ */

function LogModal({
  novel,
  day,
  upTo,
  index,
  show,
  translation,
  onPick,
  onClose,
}: {
  novel: Novel;
  day: Novel["days"][number];
  upTo: number;
  index: FuriganaIndex;
  show: boolean;
  translation: boolean;
  onPick: (at: number) => void;
  onClose: () => void;
}) {
  const rows = logUpTo(day, upTo);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      onClick={onClose}
      data-testid="novel-log"
    >
      <div
        className="card-island max-h-[80vh] w-full max-w-lg space-y-2 overflow-y-auto p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-navy font-black">
            🗒 <RubyText text={`${day.label}の ログ`} index={index} show={show} />
          </p>
          <button type="button" onClick={onClose} className="text-navy text-sm font-black">
            ✕
          </button>
        </div>
        <p className="text-ink-soft text-xs font-bold">
          <RubyText text="行を 押すと、その 行に もどります。" index={index} show={show} />
        </p>
        <ul className="space-y-1">
          {rows.map(({ index: at, scene }) => {
            const who = scene.type === "line" ? speakerLabel(novel, scene) : "";
            return (
              <li key={scene.id}>
                <button
                  type="button"
                  onClick={() => onPick(at)}
                  className="hover:bg-panel-tint w-full rounded-lg px-2 py-1 text-left text-sm"
                >
                  {who ? (
                    <span className="text-coral-deep mr-1 text-xs font-black">
                      <RubyText text={who} index={index} show={show} />
                    </span>
                  ) : null}
                  <span className="text-navy font-bold">
                    <RubyText text={scene.text} index={index} show={show} />
                  </span>
                  {translation && scene.en ? (
                    <span className="text-ink-soft block text-xs">{scene.en}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function SettingsModal({
  settings,
  index,
  show,
  onChange,
  onClose,
}: {
  settings: NovelSettings;
  index: FuriganaIndex;
  show: boolean;
  onChange: (patch: Partial<NovelSettings>) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3"
      onClick={onClose}
      data-testid="novel-settings-modal"
    >
      <div
        className="card-island w-full max-w-sm space-y-3 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-navy font-black">
          ⚙ <RubyText text="設定" index={index} show={show} />
        </p>
        <label className="text-navy block text-sm font-bold">
          🔔 <RubyText text="音の 大きさ" index={index} show={show} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.volume}
            onChange={(event) => onChange({ volume: Number(event.target.value) })}
            className="mt-1 block w-full"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onChange({});
            playNovelSe("pass", settings.volume);
          }}
          className="border-hairline bg-panel text-navy rounded-xl border-2 px-3 py-1.5 text-xs font-black"
        >
          <RubyText text="音を ためす" index={index} show={show} />
        </button>
        <button type="button" onClick={onClose} className="btn-island btn-game w-full px-4 py-2.5">
          とじる
        </button>
      </div>
    </div>
  );
}

function Ending({
  novel,
  save,
  text,
  index,
  show,
  onTitle,
}: {
  novel: Novel;
  save: NovelSave;
  text: string;
  index: FuriganaIndex;
  show: boolean;
  onTitle: () => void;
}) {
  const consults = allConsults(novel);
  const worst = mostCommonFailure(save.attempts);
  const label = (id: string) => {
    for (const day of novel.days) {
      const scene = day.scenes.find((one) => one.id === id);
      if (scene?.type === "consult") {
        const person = novel.cast.find((one) => one.id === scene.to);
        return `${day.label}：${person?.name ?? ""}さん`;
      }
    }
    return id;
  };
  return (
    <div className="card-island space-y-3 p-4" data-testid="novel-ending">
      <p className="text-navy text-lg font-black">
        🎉 <RubyText text="5日間の まとめ" index={index} show={show} />
      </p>
      {text ? (
        <p className="text-navy text-sm font-bold">
          <RubyText text={text} index={index} show={show} />
        </p>
      ) : null}
      <ul className="space-y-1">
        {consults.map((consult) => {
          const stars = save.stars[consult.id] ?? 0;
          return (
            <li key={consult.id} className="flex items-center justify-between text-sm font-bold">
              <span className="text-navy">
                <RubyText text={label(consult.id)} index={index} show={show} />
              </span>
              <span aria-label={`星 ${stars}つ`}>
                {"★".repeat(stars)}
                <span className="text-ink-faint">{"★".repeat(Math.max(0, 3 - stars))}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p
        className="text-navy rounded-xl px-3 py-2 text-sm font-bold"
        style={{ background: "var(--color-cream)" }}
      >
        {worst ? (
          <RubyText
            text={`やり直しの 理由で いちばん 多かったのは「${FAILURE_LABELS[worst]}」でした。つぎは「${novel.reactions[worst]?.hint ?? ""}」`}
            index={index}
            show={show}
          />
        ) : (
          <RubyText text="やり直しは ありませんでした。" index={index} show={show} />
        )}
      </p>
      <button type="button" onClick={onTitle} className="btn-island btn-game w-full px-4 py-2.5">
        <RubyText text="日を えらぶ" index={index} show={show} />
      </button>
    </div>
  );
}
