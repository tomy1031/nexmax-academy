"use client";

import { motion } from "motion/react";

/**
 * 舞台の上に重ねるDOMの演出。旧 wordtest の index.html / styles.css から移した。
 *
 *   ScorePop      … 旧 .score-pop（「+150」「OK!」が浮いて消える）
 *   DamageFlash   … 旧 #damage-flash（ライフが減った瞬間の全画面フラッシュ）
 *   ApproachClock … 旧 #mcq-clock（時計が近づいてくる。1.0→3.2倍、終盤は赤く）
 *   McqTerm       … 旧 #mcq-term（4択の間、用語をふりがな付きで出しておく）
 *
 * 3Dの中で起きること（出現の輪・撃破の粒・衝撃波・閃光）は three.js 側にある
 * （arcade-three.ts の spawnFxRing / explode）。ここには置かない。
 */

/** 加点ポップ。れんしゅうは「+150」、テストは「OK!」（旧 .pop-label）。 */
export function ScorePop({
  label,
  id,
  quiet = false,
}: {
  label: string;
  id: string | number;
  quiet?: boolean;
}) {
  return (
    <motion.span
      key={id}
      aria-hidden
      className={`pointer-events-none absolute top-[42%] left-1/2 -translate-x-1/2 font-black ${
        quiet ? "text-[26px]" : "text-[40px]"
      }`}
      style={{
        color: quiet ? "#4ee1ff" : "#ffd54a",
        textShadow: quiet
          ? "0 0 16px rgba(78,225,255,.9), 0 2px 0 rgba(0,0,0,.7)"
          : "0 0 18px rgba(255,176,32,.9), 0 2px 0 rgba(0,0,0,.7)",
      }}
      initial={{ y: 0, opacity: 0, scale: 0.4 }}
      animate={{ y: [0, -30, -160], opacity: [0, 1, 0], scale: [0.4, 1.15, 1] }}
      transition={{ duration: 0.9, times: [0, 0.18, 1], ease: [0.2, 0.8, 0.3, 1] }}
    >
      {label}
    </motion.span>
  );
}

/**
 * 外した／時間切れの 瞬間の 全画面フラッシュ（旧 #damage-flash / 340ms）。
 *
 * 前は **れんしゅうモードだけ**に 出して いた（ライフが 減る ときだけ）。
 * テストと もんだいだけでは 外しても 画面が まったく 変わらず、
 * 学習者には「合って いた」ように 見えて いた（2026-08-26 の 指摘）。
 * いまは どの モードでも 出す。
 */
export function DamageFlash({
  id,
  tone = "miss",
}: {
  id: string | number;
  tone?: "miss" | "timeup";
}) {
  return (
    <motion.div
      key={id}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          tone === "timeup"
            ? "radial-gradient(90% 90% at 50% 50%, rgba(255, 168, 0, 0.5), rgba(180, 90, 0, 0.85))"
            : "radial-gradient(90% 90% at 50% 50%, rgba(255, 40, 70, 0.55), rgba(160, 0, 30, 0.9))",
      }}
      initial={{ opacity: 0.8 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.34, ease: "easeOut" }}
    />
  );
}

/**
 * ⭕／❌ の 大きな しるし（2026-08-26 追加）。
 *
 * 「正解と 間違いの 表示の ちがいが わかりにくい」への 答え。
 * **記号と ことばの 両方**で 出す——色だけに たよらない
 *（提出の 画面で 先に 決めた 作法。`tests/e2e/teishutsu.spec.ts`）。
 * 文言は 規律1（責めない）を 守り、しるしだけで 合否を はっきりさせる。
 */
export function Verdict({ id, kind }: { id: string | number; kind: "hit" | "miss" | "timeup" }) {
  /*
   * 字は **最短**（2026-08-27 の 指定「シンプルに正解不正解わかればいい。
   * 変にポジティブにするルール…ここに適用しても無意味」）。
   * 遊んで いる 最中に 2行の 励ましを 読ませない。分かれば よいのは ⭕か ❌か だけ。
   */
  const face =
    kind === "hit"
      ? { mark: "⭕", label: "せいかい", color: "#1c7f3e", glow: "rgba(58,164,88,.95)" }
      : kind === "timeup"
        ? { mark: "⏰", label: "時間切れ", color: "#8a5200", glow: "rgba(240,168,25,.95)" }
        : { mark: "❌", label: "ちがう", color: "#a3182f", glow: "rgba(242,101,74,.95)" };

  return (
    <motion.div
      key={id}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-[30%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1"
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.15, 1.05, 1.05] }}
      transition={{ duration: 1.1, times: [0, 0.14, 0.7, 1], ease: "easeOut" }}
    >
      <span aria-hidden className="text-[86px] leading-none sm:text-[110px]">
        {face.mark}
      </span>
      <span
        className="rounded-full border-4 border-white px-4 py-1 text-xl font-black sm:text-2xl"
        style={{
          background: "rgba(255,250,240,.96)",
          color: face.color,
          boxShadow: `0 0 26px ${face.glow}`,
        }}
      >
        {face.label}
      </span>
    </motion.div>
  );
}

/**
 * 4択の残り時間を「近づいてくる時計」で見せる（旧 #mcq-clock）。
 * 拡大率・不透明度・赤くなる境目（65%）は原典のまま。
 */
export function ApproachClock({ remaining }: { remaining: number }) {
  const ratio = Math.min(1, Math.max(0, 1 - remaining));

  return (
    <span
      aria-hidden
      /*
       * **字の 後ろから どかす**（2026-08-27 の 指定）。
       * 前は 用語と 同じ 位置（top 40%）で、3.2倍まで ふくらむ 時計が
       * ちょうど 字の 裏に 来て いた。ふりがなの ような 細い 字は それだけで 読めなく なる。
       * 時計は 上に 置いて、近づく 手ごたえだけ 残す。
       */
      className="pointer-events-none absolute top-[16%] left-1/2 text-[76px] leading-none"
      style={{
        transform: `translate(-50%, -50%) scale(${(1 + ratio * 1.6).toFixed(2)})`,
        opacity: (0.2 + ratio * 0.45).toFixed(2),
        filter:
          ratio > 0.65 ? "drop-shadow(0 0 22px #ff2200)" : "drop-shadow(0 0 12px rgba(0,0,0,0.6))",
        transition: "opacity .1s linear",
      }}
    >
      ⏰
    </span>
  );
}

/**
 * 4択の間に出しておく用語（旧 #mcq-term）。
 * 旧アプリは「問題だけ」モード専用だったが、迫る演出が終わったあとも
 * 学習者が言葉を見られるように、どのモードでも出す。
 */
export function McqTerm({ term, reading }: { term: string; reading: string }) {
  /*
   * **読みの ときと 同じ 顔に する**（2026-08-27 の 指定
   * 「4択問題の迫り来る文字がよみにくい。読みの時と同じで良い」
   * 「4択は特にふりがなが読みにくい」）。
   *
   * 迫って くる 用語（3Dの スプライト）は 白い 字に **黒い 太い ふち**、
   * ふりがなは **黄色**。こちらは 水色の 細い 字を そのまま 置いて いたので、
   * 明るい 空の 前では 輪郭が 消えて いた。同じ 作りに そろえる。
   *
   * **長い ひとことでも 画面に 収める**（2026-08-25・願い #203 で センテンスが 入った）。
   * 前は 1行 固定（`whitespace-nowrap`）で、「これからの 計画を 教えて ください」は
   * 両はしが 画面の 外に 出て いた（390px の 実機で 実際に 切れた）。
   */
  const size =
    term.length <= 8
      ? "text-[38px] sm:text-[56px]"
      : term.length <= 14
        ? "text-[28px] sm:text-[42px]"
        : "text-[22px] sm:text-[34px]";
  return (
    <span
      className={`pointer-events-none absolute top-[42%] left-1/2 max-w-[92vw] -translate-x-1/2 -translate-y-1/2 text-center leading-tight font-black text-white ${size}`}
      style={{
        WebkitTextStroke: "7px rgba(0,0,0,.92)",
        paintOrder: "stroke fill",
        textShadow: "0 0 22px rgba(0,0,0,.75)",
      }}
    >
      {/* ふりがなは 太く・黒ふち つきの 黄色（迫る 用語と 同じ 色） */}
      <style>{`
        .mcq-term rt{
          font-size:.5em;font-weight:900;color:#ffd54a;
          -webkit-text-stroke:4px rgba(0,0,0,.92);paint-order:stroke fill;
          text-shadow:0 0 14px rgba(0,0,0,.8);
        }
      `}</style>
      <ruby className="mcq-term">
        {term}
        <rt>{reading}</rt>
      </ruby>
    </span>
  );
}
