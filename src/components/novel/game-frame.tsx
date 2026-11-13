"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** 枠の 並べ方。縦長（スマホ縦）か 横長（PC・スマホ横）か。 */
export type FrameLayout = "tall" | "wide";

export interface FrameControls {
  readonly layout: FrameLayout;
  /** 全画面で 遊んで いるか。 */
  readonly full: boolean;
  readonly toggleFull: () => void;
  /** 枠が 画面に 収まる 位置まで 動かす（「はじめる」の あと）。 */
  readonly bringIntoView: () => void;
}

const FrameContext = createContext<FrameControls>({
  layout: "tall",
  full: false,
  toggleFull: () => {},
  bringIntoView: () => {},
});

/** 枠の 中の 部品が、並べ方と 全画面の 出入りを 知る。 */
export function useGameFrame(): FrameControls {
  return useContext(FrameContext);
}

/** 幅 ÷ 高さ が これより 大きいと 横長の 並べ方に する。 */
const WIDE_RATIO = 1.2;

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function fullscreenElement(): Element | null {
  const doc = document as WebkitDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/**
 * 相談の 練習の **ゲームの 枠**（要望 #731・#732）。
 *
 * 上の 帯・絵・セリフ・操作の パネル・ボタンを **ぜんぶ この 枠の 中**に 入れる
 *（以前は 絵の 枠の 下に 相談の 枠や マイクが 並んで いた）。枠の 外に 残るのは、
 * ページの 見出しと「ステージに もどる」だけ。
 *
 * ## 大きさ
 * ふだんは 幅いっぱい・高さ `min(100svh − 16px, 820px)`（最低 560px）。`dvh` では なく
 * `svh` に する——Safari の バーの 出入りで 枠が 伸び縮み しない ように。
 *
 * ## 全画面（2段がまえ）
 * 1. どの 端末でも: 枠を `fixed inset-0`・高さ `100dvh` に し、ページの スクロールを 止める。
 * 2. 使える 端末だけ: さらに **ページ全体**に `requestFullscreen()`（iPad・Android・PC は
 *    本当の 全画面）。枠では なく ページに 向けるのは、辞書の 吹き出しなど body に 出す
 *    部品が 全画面の 下に 隠れない ように（2026-11-13 の 検収）。
 *    iPhone の Safari は 要素の 全画面を 受け付けないので 1 だけ（アドレスバーは 残る）。
 * Esc や 端末の 操作で 本当の 全画面を 抜けたら、1 も 解く。枠の DOM は 作り直さない
 *（録音中に 出入りしても 止まらない）。
 *
 * 並べ方（縦長／横長）は 枠の 縦横比で 決める（画面の 幅では なく）——全画面・スマホの
 * 横向き・PC の どれでも 同じ 決まりで 切りかわる。
 */
export function GameFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<FrameLayout>("tall");
  const [full, setFull] = useState(false);
  /** 本当の 全画面に 入れた か（抜けた ことを 知る ため）。 */
  const native = useRef(false);
  /** いま 全画面に したいか（すばやく 2回 押された ときに、遅れて 入った 全画面を 抜ける）。 */
  const want = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setLayout(height > 0 && width / height > WIDE_RATIO ? "wide" : "tall");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* 本当の 全画面を 端末の 操作（Esc など）で 抜けたら、こちらも 抜ける */
  useEffect(() => {
    const onChange = () => {
      if (native.current && !fullscreenElement()) {
        native.current = false;
        setFull(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  /* 全画面の あいだは ページの スクロールを 止める（枠の 中だけ 動く） */
  useEffect(() => {
    if (!full) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [full]);

  const leaveNative = useCallback(() => {
    if (!fullscreenElement()) return;
    const doc = document as WebkitDocument;
    const leave = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    try {
      void Promise.resolve(leave?.call(doc)).catch(() => {});
    } catch {
      // 抜けられなくても 枠は 元に 戻って いる
    }
  }, []);

  const enter = useCallback(() => {
    want.current = true;
    setFull(true);
    const el = document.documentElement as WebkitElement;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (!request) return;
    try {
      void Promise.resolve(request.call(el))
        .then(() => {
          native.current = true;
          /* 入る 前に もう「やめる」が 押されて いた */
          if (!want.current) {
            native.current = false;
            leaveNative();
          }
        })
        .catch(() => {
          // 断られても 1段目（枠を 画面いっぱい）の まま 遊べる
        });
    } catch {
      // 同上
    }
  }, [leaveNative]);

  const exit = useCallback(() => {
    want.current = false;
    setFull(false);
    leaveNative();
    native.current = false;
  }, [leaveNative]);

  const bringIntoView = useCallback(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const controls = useMemo<FrameControls>(
    () => ({ layout, full, toggleFull: full ? exit : enter, bringIntoView }),
    [layout, full, exit, enter, bringIntoView],
  );

  return (
    <div
      ref={ref}
      className={
        full
          ? "fixed inset-0 z-[60] w-screen overflow-hidden"
          : /* h-[560px] は `svh` を 知らない ブラウザの 逃げ道（下の style が 捨てられた とき） */
            "relative h-[560px] w-full overflow-hidden rounded-2xl"
      }
      style={{
        background: "var(--color-ink)",
        ...(full
          ? { height: "100dvh" }
          : {
              height: "min(calc(100svh - 16px), 820px)",
              /* スマホの 横向き（高さ 390px 前後）でも 枠が 画面に 収まる ように */
              minHeight: "min(560px, 100svh)",
            }),
      }}
      data-testid="novel-frame"
      data-layout={layout}
      data-full={full ? "1" : undefined}
    >
      <div
        className="relative mx-auto h-full w-full"
        style={{
          maxWidth: full ? 1200 : undefined,
          background: "var(--color-panel-tint, #eef4fb)",
          paddingTop: full ? "env(safe-area-inset-top)" : undefined,
          paddingBottom: full ? "env(safe-area-inset-bottom)" : undefined,
        }}
      >
        <FrameContext.Provider value={controls}>{children}</FrameContext.Provider>
      </div>
    </div>
  );
}
