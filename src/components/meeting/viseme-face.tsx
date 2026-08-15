"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

/**
 * 口パクする顔 — 母音5つ＋閉じの6枚を切り替える。
 *
 * ## なぜGIFではないか
 * GIFは**決まった速さでループする**ので、実際に鳴っている音とすぐズレる。
 * 短い返事でも長い説明でも同じ速さで口が動き、無音のあいだも動き続ける。
 * 画像の切り替えなら「鳴っているあいだだけ・鳴っている強さで」動かせるので、
 * 止まれば口も閉じる。枚数も6枚で足りる（GIFのコマ数より軽い）。
 *
 * ## 口の形の決め方は2通り
 * - `analyser` がある … 音の大きさで開けるかを決める（Live音声のとき）。
 *   音素までは解析しない。**開き具合が合っていれば口パクは自然に見える**ので、
 *   形は読んでいる かな の順に送る。
 * - `analyser` が無い … `utterance` の長さぶんだけ一定の速さで送る（音声が無いときの代役）。
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

export type Viseme = "closed" | "a" | "i" | "u" | "e" | "o";
const SHAPES = ["closed", "a", "i", "u", "e", "o"] as const;
/** かなが取れないときに順に送る母音。 */
const VOWELS: Viseme[] = ["a", "i", "u", "e", "o"];

/** かな1文字 → 母音。拗音の小書きは直前ではなく自分の母音に従う。 */
function vowelOf(kana: string): Viseme | null {
  if ("あかさたなはまやらわがざだばぱゃぁ".includes(kana)) return "a";
  if ("いきしちにひみりぎじぢびぴぃ".includes(kana)) return "i";
  if ("うくすつぬふむゆるぐずづぶぷゅぅ".includes(kana)) return "u";
  if ("えけせてねへめれげぜでべぺぇ".includes(kana)) return "e";
  if ("おこそとのほもよろをごぞどぼぽょぉ".includes(kana)) return "o";
  return null; // ん・っ・ー・記号 は口を変えない
}

/** 1つの口の形を出す時間（ミリ秒）。日本語のはや口すぎない速さ。 */
const FRAME_MS = 110;
/** 長い文でも これ以上は動かし続けない。 */
const MAX_MS = 6000;

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
  /** 正方形で置きたいときの一辺。省略すると**親いっぱい**に広がる（Zoomのタイル用）。 */
  size,
  alt = "",
}: {
  dir: string;
  sources?: Partial<Record<Viseme, string>>;
  utterance: string;
  analyser?: AnalyserNode | null;
  size?: number;
  alt?: string;
}) {
  const [viseme, setViseme] = useState<Viseme>("closed");
  /**
   * 口の絵が置かれていない相手のとき（先生が新しく作ったミーティングなど）。
   * 6枚の壊れた画像を並べるより、名前の頭文字だけ出すほうが Zoomらしく見える。
   */
  const [missing, setMissing] = useState(false);
  /** 口が動いている＝いま話している。代替表示の波紋はこれに合わせる。 */
  const speaking = viseme !== "closed";

  // 描画で読むのは state だけ。下の値は タイマーの中からしか読まないので ref に置く
  const shapesRef = useRef<Viseme[]>([]);
  const endsAtRef = useRef(0);
  const frameRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // 解析器は タイマーの中からしか読まないので ref に写す（描画では触らない）
  useEffect(() => {
    analyserRef.current = analyser ?? null;
  }, [analyser]);

  // `utterance` が変わったら「いつまで動かすか」を決める。**state は触らない**
  useEffect(() => {
    const shapes = [...utterance].map(vowelOf).filter((v): v is Viseme => v !== null);
    shapesRef.current = shapes;
    frameRef.current = 0;
    endsAtRef.current =
      shapes.length === 0
        ? 0
        : Date.now() + Math.min(MAX_MS, Math.max(900, shapes.length * FRAME_MS));
  }, [utterance]);

  // タイマーは1本だけ。state を変えるのは この中（＝効果の同期実行ではない）
  useEffect(() => {
    const timer = setInterval(() => {
      const node = analyserRef.current;
      // 音が来ているときは、かなが取れなくても（漢字まじりの字幕でも）口を動かす。
      // 開き具合は下の音量で決まるので、形は5母音を順に送れば自然に見える
      const shapes = shapesRef.current.length > 0 ? shapesRef.current : node ? VOWELS : [];
      if (shapes.length === 0 || (!node && Date.now() > endsAtRef.current)) {
        setViseme("closed");
        return;
      }
      if (node) {
        const buffer = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += (v - 128) ** 2;
        // 音が止まっているあいだは閉じる（Live は文の切れ目で無音になる）
        if (Math.sqrt(sum / buffer.length) / 128 < 0.02) {
          setViseme("closed");
          return;
        }
      }
      frameRef.current = (frameRef.current + 1) % shapes.length;
      setViseme(shapes[frameRef.current]!);
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
        <QuietFace initial={alt.slice(0, 1)} speaking={speaking} />
      ) : (
        /*
          6枚すべてを重ねて置き、出すものだけ不透明にする。
          切り替えるときに読み込む作りだと、最初の1周だけ画像が間に合わず口が飛ぶ。
        */
        SHAPES.map((key) => (
          <Image
            key={key}
            src={sources?.[key] || `${dir}/${key}.webp`}
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
