"use client";

import { useEffect, useRef, useState } from "react";
import { createArcadeWorld, type ArcadeWorldHandle, type TermOutcome } from "./arcade-three";

/**
 * three.js の世界（arcade-three.ts）を React に差し込む係。
 *
 * 旧アプリは進行のたびに `spawnEnemy()` や `explode()` を直接呼んでいた。
 * ここでは「いまの状態」を props で渡し、変わったところだけを世界に伝える。
 * 絵の中身は世界側が持つので、この層は出し入れの配線だけにする。
 */
export interface ArcadeWorldProps {
  /** 旧 buildField の引数。 */
  field: string;
  /** 旧 currentSpeed() の戻り値。 */
  speed: number;
  /** 遊んでいる間だけ景色が流れる（旧 gameLoop の STATE 判定）。 */
  moving: boolean;
  /** 出題が変わるたびに変える。変わると用語を出し直す。null なら用語なし。 */
  termKey: string | null;
  termText: string;
  termReading: string;
  showFurigana: boolean;
  /** null は読みの最中（迫っている）。 */
  outcome: TermOutcome | null;
  /** 用語がぶつかった（旧 `enemyZ > 30`）。 */
  onCollide: () => void;
  /** 目の前に来ている間（旧 .shake-screen）。 */
  onNear: (near: boolean) => void;
}

export function ArcadeCanvas(props: ArcadeWorldProps) {
  const { field, speed, moving, termKey, showFurigana, outcome } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<ArcadeWorldHandle | null>(null);
  const [failed, setFailed] = useState(false);

  // いちばん新しい props を控える。世界は非同期にできあがるので、
  // できた時点の値を渡し直す必要がある（依存配列のためでもある）。
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;

    void createArcadeWorld(el, {
      onCollide: () => latest.current.onCollide(),
      onNear: (near) => latest.current.onNear(near),
    })
      .then((world) => {
        if (!world) {
          setFailed(true);
          return;
        }
        if (disposed) {
          world.dispose();
          return;
        }
        worldRef.current = world;
        const now = latest.current;
        world.setField(now.field);
        world.setSpeed(now.speed);
        world.setMoving(now.moving);
        if (now.termKey) {
          world.spawnTerm(now.termText, now.termReading, now.showFurigana);
          if (now.outcome) world.resolveTerm(now.outcome);
        }
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      worldRef.current?.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    worldRef.current?.setField(field);
  }, [field]);

  useEffect(() => {
    worldRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    worldRef.current?.setMoving(moving);
  }, [moving]);

  // どのふりがな設定で今の絵を描いたか。出し直した直後の二度描きを避けるために持つ。
  const drawnFurigana = useRef(showFurigana);

  // 出題が変わったら用語を出し直す（旧 nextQuestion の spawnEnemy）。
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const now = latest.current;
    if (!now.termKey) {
      world.clearTerm();
      return;
    }
    world.spawnTerm(now.termText, now.termReading, now.showFurigana);
    drawnFurigana.current = now.showFurigana;
  }, [termKey]);

  // ふりがなの切り替えでだけ描き直す（旧 redrawEnemy）。
  useEffect(() => {
    if (drawnFurigana.current === showFurigana) return;
    drawnFurigana.current = showFurigana;
    const now = latest.current;
    worldRef.current?.redrawTerm(now.termText, now.termReading, showFurigana);
  }, [showFurigana]);

  // 読みのフェーズが終わったら、旧アプリの間合いで撃破に移る。
  useEffect(() => {
    if (!outcome) return;
    worldRef.current?.resolveTerm(outcome);
  }, [outcome, termKey]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      // 旧 #game-canvas は z-index 1。UI（10）とビネット（4）より下に置く。
      style={{ zIndex: 1 }}
    >
      {failed && (
        // WebGL が使えない端末でも学習は続けられるようにする。旧アプリに退避路は無かった。
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, #0b1330 0%, #050a18 100%)" }}
        />
      )}
    </div>
  );
}
