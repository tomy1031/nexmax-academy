"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { assetUrl } from "@/lib/asset-url";
import { visemeAt, visemeTimeline, type Viseme } from "@/lib/meeting/viseme-timeline";

/**
 * 口パクする顔 — 母音5つ＋閉じの6枚を切り替える。
 *
 * ## なぜGIFではないか
 * GIFは**決まった速さでループする**ので、実際に鳴っている音とすぐズレる。
 * 短い返事でも長い説明でも同じ速さで口が動き、無音のあいだも動き続ける。
 * 画像の切り替えなら「鳴っているあいだだけ・鳴っている強さで」動かせるので、
 * 止まれば口も閉じる。枚数も6枚で足りる（GIFのコマ数より軽い）。
 *
 * ## 口の形の決め方は3通り（どれも `utterance` を 1モーラ 1コマに 並べて 使う）
 * 並べかたは `viseme-timeline.ts`。「おはよう」なら お・あ・お・う、ん・っ・、 では 閉じる。
 * - `analyser` と `progress` … 声が 何割 進んだかで、**セリフの その 位置の 音**の 形を 出す
 *   （作り置きの 声）。開けるかは 音の 大きさで 決めるので、息つぎで 閉じる。
 * - `analyser` だけ … 音の 大きさで 開けるかを 決め、形は セリフの 順に 送る（Live の 声）。
 *   音素までは解析しない。**開き具合が合っていれば口パクは自然に見える**。
 * - どちらも 無い … セリフを 頭から **1回だけ** 読んで 閉じる（音声が 無い 教材）。
 *   母音だけを くり返し 送って いた ころは、短い 返事でも 0.9秒 動き、ことばと 口が 合わなかった。
 *
 * ## 動かす時間は この部品が持つ
 * 呼ぶ側に「いま話している」フラグを持たせると、その状態を効果の中で切り替えることになり、
 * 描画が連鎖する（React Compiler が禁じる）。`utterance` が変わったら話しはじめ、
 * 長さぶん経ったら閉じる——という寿命をここに閉じ込める。
 *
 * ## 口の絵が無い相手でも 会話は 続く
 * 人物カードに口の6枚が置かれていない相手（先生がスタジオで新しく作った相手、
 * まだ絵が届いていない人）でも、壊れた画像を並べずに静かな丸を出す。
 * **顔を手描きSVGで作らない**（規律7 — キャラクターの絵は image-gen-2 が正典）。
 * 代わりに「話しているあいだ だけ ゆっくり 広がる 波紋」で、誰が話しているかを見せる。
 * あとから絵を置けば `dir` の6枚が読めるようになり、自動でフル口パクに戻る。
 */

export type { Viseme };
const SHAPES = ["closed", "a", "i", "u", "e", "o"] as const;
/** 音は 来て いるのに セリフの かなが 取れない ときに 順に 送る母音。 */
const VOWELS: Viseme[] = ["a", "i", "u", "e", "o"];

/** 1つの口の形を出す時間（ミリ秒）。日本語のはや口すぎない速さ。 */
const FRAME_MS = 110;
/** 音声が 無い とき、長い文でも これ以上は動かし続けない（6秒）。 */
const MAX_FRAMES = Math.floor(6000 / FRAME_MS);

/**
 * 絵の URL に 版番号を 付ける（`assetUrl`）。
 * 付けないと、口の 絵を 作り直しても 学習者の ブラウザに 古い 絵が 残る（`/img/*` は 長く 保存される）。
 */
const versioned = (src: string) => assetUrl(src) ?? src;

export function VisemeFace({
  /** 口の画像が入っているフォルダ（`/img/characters/hendy/mouth`）。 */
  dir,
  /**
   * 人物カードで決めた口の絵（形 → URL）。決めていない形は `dir` を見る。
   * 先生がスタジオで差し替えられるようにするための入口で、
   * 置き場所の決まり（フォルダ名）に縛られない。
   */
  sources,
  /** いま読み上げている文（かな）。変わるたびに話しはじめる。空なら閉じたまま。 */
  utterance,
  /** Live音声の解析器。あれば音の大きさで開けるかを決める。 */
  analyser,
  /**
   * 鳴っている声の進み（0〜1）を返す関数。`analyser` と一緒に渡すと、
   * 口の形を `utterance` の**いま声が出ている位置**に合わせる。読めないときは null を返す。
   */
  progress,
  /** 正方形で置きたいときの一辺。省略すると**親いっぱい**に広がる（Zoomのタイル用）。 */
  size,
  alt = "",
  /**
   * 絵が 無い ときに 丸の 中に 出す 1文字。
   *
   * 名前の 頭を そのまま 出すと、**漢字の 名前**（富田さん）では 読めない 字が
   * 1つ 置かれる（規律2）。丸の 中に ルビは 入らない ので、呼ぶ側が **読みの
   * 1文字目**を 渡す。省くと これまでどおり 名前の 頭を 出す。
   */
  initial,
}: {
  dir: string;
  sources?: Partial<Record<Viseme, string>>;
  utterance: string;
  analyser?: AnalyserNode | null;
  progress?: () => number | null;
  size?: number;
  alt?: string;
  initial?: string;
}) {
  const [viseme, setViseme] = useState<Viseme>("closed");
  /**
   * 口の絵が置かれていない相手のとき（先生が新しく作ったミーティングなど）。
   * 6枚の壊れた画像を並べるより、名前の頭文字だけ出すほうが Zoomらしく見える。
   */
  const [missing, setMissing] = useState(false);
  /**
   * いま話している。代替表示の波紋はこれに合わせる。
   * 口の形からは決めない——ん・っ・、 で 110ms だけ閉じるたびに 波紋が止まってしまう。
   */
  const [speaking, setSpeaking] = useState(false);

  // 描画で読むのは state だけ。下の値は タイマーの中からしか読まないので ref に置く
  const frameRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const progressRef = useRef<(() => number | null) | null>(null);
  /** `utterance` を 1モーラ 1コマに 並べたもの。 */
  const timelineRef = useRef<Viseme[]>([]);

  // 解析器は タイマーの中からしか読まないので ref に写す（描画では触らない）
  useEffect(() => {
    analyserRef.current = analyser ?? null;
  }, [analyser]);

  useEffect(() => {
    progressRef.current = progress ?? null;
  }, [progress]);

  // `utterance` が変わったら 頭から 読みなおす。**state は触らない**
  useEffect(() => {
    timelineRef.current = visemeTimeline(utterance);
    frameRef.current = 0;
  }, [utterance]);

  // タイマーは1本だけ。state を変えるのは この中（＝効果の同期実行ではない）
  useEffect(() => {
    const show = (shape: Viseme, talking: boolean) => {
      setViseme(shape);
      setSpeaking(talking);
    };
    const timer = setInterval(() => {
      const node = analyserRef.current;
      const timeline = timelineRef.current;
      if (node) {
        const buffer = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += (v - 128) ** 2;
        // 音が止まっているあいだは閉じる（Live は文の切れ目で無音になる）
        if (Math.sqrt(sum / buffer.length) / 128 < 0.02) {
          show("closed", false);
          return;
        }
        // 声の進みが読めるなら、セリフのその位置の音の形を出す
        const atLine = visemeAt(timeline, progressRef.current?.() ?? null);
        if (atLine) {
          show(atLine, true);
          return;
        }
        // 進みが読めない（Live の声）。音が来ているときは、かなが取れなくても
        // （漢字まじりの字幕でも）口を動かす。開き具合は音量で決まるので 順に送れば自然に見える
        const shapes = timeline.length > 0 ? timeline : VOWELS;
        frameRef.current = (frameRef.current + 1) % shapes.length;
        show(shapes[frameRef.current]!, true);
        return;
      }
      // 音が無い … セリフを 頭から 1回だけ 読み、読み終えたら 閉じる
      const frame = frameRef.current;
      if (frame >= Math.min(timeline.length, MAX_FRAMES)) {
        show("closed", false);
        return;
      }
      frameRef.current = frame + 1;
      show(timeline[frame]!, true);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={
        size === undefined
          ? "absolute inset-0 overflow-hidden"
          : "border-hairline relative overflow-hidden rounded-[var(--radius-card)] border-2 bg-white"
      }
      style={size === undefined ? undefined : { width: size, height: size }}
    >
      {missing ? (
        <QuietFace initial={initial ?? alt.slice(0, 1)} speaking={speaking} />
      ) : (
        /*
          6枚すべてを重ねて置き、出すものだけ不透明にする。
          切り替えるときに読み込む作りだと、最初の1周だけ画像が間に合わず口が飛ぶ。
        */
        SHAPES.map((key) => (
          <Image
            key={key}
            src={versioned(sources?.[key] || `${dir}/${key}.webp`)}
            alt={key === "closed" ? alt : ""}
            fill
            sizes={size === undefined ? "50vw" : `${size}px`}
            priority={key === "closed"}
            unoptimized
            // 閉じた口だけ見張れば足りる（同じフォルダの6枚は まとめて 有る／無い）
            onError={key === "closed" ? () => setMissing(true) : undefined}
            className="object-cover"
            style={{ opacity: viseme === key ? 1 : 0 }}
          />
        ))
      )}
    </div>
  );
}

/**
 * 口の絵が まだ 無い相手の 代役。
 *
 * 頭文字（無ければ 丸アイコン）の 丸を1つ置き、話しているあいだだけ 波紋を 広げる。
 * 顔つきを 描かないのは、**そのキャラの 顔は 生成した 絵だけが 正典**だから（規律7）。
 * ここで似顔絵を作ると、あとで本物の絵が来たときに別人が2人いることになる。
 */
function QuietFace({ initial, speaking }: { initial: string; speaking: boolean }) {
  return (
    <span className="relative grid h-full w-full place-items-center">
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: "46%",
          aspectRatio: "1 / 1",
          border: "2px solid rgba(255,255,255,0.55)",
        }}
        animate={speaking ? { scale: [1, 1.5], opacity: [0.5, 0] } : { scale: 1, opacity: 0 }}
        transition={
          speaking ? { duration: 1.4, repeat: Infinity, ease: "easeOut" } : { duration: 0.3 }
        }
      />
      <motion.span
        className="grid place-items-center rounded-full text-2xl font-extrabold text-white"
        style={{ width: "46%", aspectRatio: "1 / 1", background: "rgba(255,255,255,0.16)" }}
        animate={{ boxShadow: speaking ? "0 0 22px rgba(255,255,255,0.45)" : "0 0 0 transparent" }}
        transition={{ duration: 0.35 }}
      >
        {initial === "" ? "🧑‍💼" : initial}
      </motion.span>
    </span>
  );
}
