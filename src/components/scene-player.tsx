"use client";

// シーンプレイヤー（学習エンジン本体）
//
// コンテンツスキーマ準拠のシーンデータ（kind: "scene"）を受け取り、
// VRMキャラクターの口パク・字幕（ルビ合成）・音声を同期再生する。
// 教材追加＝データ追加。ここにセリフを書かない。
//
// three-vrm は WebGL2 で動く（WebGPU不要）。キャラクターはHTML背景の上に
// 直接描画されるため、立ち絵のような背景透過処理は要らない。

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { Scene as SceneContent } from "@/content/schema";
import { RubyText } from "@/components/ruby-text";
import { ALL_VISEMES, buildMoraTimeline, timelineDuration, type MoraEvent } from "@/lib/lipsync";

interface PlaybackState {
  events: MoraEvent[];
  /** clock.elapsedTime 基準の再生開始時刻（音声なしのときのみ使う） */
  startedAt: number;
  audio: HTMLAudioElement | null;
}

/** background 識別子 → 背景クラス。データ側は識別子だけを持つ。 */
const BACKGROUNDS: Record<string, string> = {
  office_morning: "bg-gradient-to-b from-[#d8f0fc] via-[#f4fbff] to-[#fff7e8]",
};
const DEFAULT_BACKGROUND = "bg-gradient-to-b from-[#eef6fb] to-[#f7fbff]";

interface ScenePlayerProps {
  scene: SceneContent;
  /** ルビ表示（学習レベルで切り替える）。 */
  showRuby?: boolean;
}

export function ScenePlayer({ scene, showRuby = true }: ScenePlayerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<PlaybackState | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const vrmRef = useRef<VRM | null>(null);

  const [status, setStatus] = useState("よみこみ中…");
  const [ready, setReady] = useState(false);
  const [lineIndex, setLineIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [missingAudio, setMissingAudio] = useState(false);

  // シーン内で最初にモデルを持つ人物を主役として描画する（現状は1体構成）
  const modelUrl = Object.values(scene.characters).find((c) => c.model)?.model;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !modelUrl) return;

    const three = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 20);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, Math.PI * 0.45);
    light.position.set(1, 1, 1).normalize();
    three.add(light);
    three.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.35));

    const clock = new THREE.Clock();
    clockRef.current = clock;

    let nextBlinkAt = 2;
    let blinkStartedAt = -1;
    const BLINK_SEC = 0.15;

    const visemeWeights: Record<string, number> = {};
    for (const v of ALL_VISEMES) visemeWeights[v] = 0;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let disposed = false;

    loader
      .loadAsync(modelUrl, (progress) => {
        if (progress.total > 0) {
          setStatus(`よみこみ中… ${Math.round((progress.loaded / progress.total) * 100)}%`);
        }
      })
      .then((gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        vrmRef.current = vrm;

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm); // VRM0.x のみ向きを補正（VRM1では何もしない）
        three.add(vrm.scene);

        // Tポーズ回避
        const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (leftArm) leftArm.rotation.z = -1.15;
        if (rightArm) rightArm.rotation.z = 1.15;

        // バストアップの構図。頭頂が切れないよう、頭のてっぺんを基準に引きを決める
        const head = vrm.humanoid.getNormalizedBoneNode("head");
        const headPos = new THREE.Vector3();
        if (head) head.getWorldPosition(headPos);
        const headY = headPos.y || 1.3;
        const eyeY = headY + 0.1; // 頭ボーンは頭の付け根なので少し上を見る
        camera.position.set(0, eyeY, 1.6);
        camera.lookAt(0, eyeY - 0.15, 0);

        setReady(true);
        setStatus("じゅんび できました");
      })
      .catch((err: unknown) => {
        setStatus(`モデルを よみこめませんでした: ${String(err)}`);
      });

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      const t = clock.elapsedTime;
      const vrm = vrmRef.current;

      if (vrm) {
        const em = vrm.expressionManager;

        if (em) {
          if (blinkStartedAt < 0 && t >= nextBlinkAt) {
            blinkStartedAt = t;
            nextBlinkAt = t + 2.2 + Math.random() * 2.8;
          }
          if (blinkStartedAt >= 0) {
            const p = (t - blinkStartedAt) / BLINK_SEC;
            if (p >= 1) {
              em.setValue("blink", 0);
              blinkStartedAt = -1;
            } else {
              em.setValue("blink", Math.sin(p * Math.PI));
            }
          }
        }

        // 呼吸・体の揺らぎ
        const chest = vrm.humanoid.getNormalizedBoneNode("chest");
        if (chest) chest.rotation.x = Math.sin(t * 1.1) * 0.012;
        const head = vrm.humanoid.getNormalizedBoneNode("head");
        if (head) {
          head.rotation.y = Math.sin(t * 0.55) * 0.035;
          head.rotation.x = Math.sin(t * 0.85) * 0.012;
        }

        // 口パク（描画は見た目だけを担当する。行送りは音声イベント／タイマーが駆動する）
        const playback = playbackRef.current;
        let activeViseme: string | null = null;
        if (playback) {
          const pos = playback.audio ? playback.audio.currentTime : t - playback.startedAt;
          const event = playback.events.find((e) => pos >= e.start && pos < e.end);
          if (event) activeViseme = event.viseme;
        }
        if (em) {
          for (const v of ALL_VISEMES) {
            const target = v === activeViseme ? 0.85 : 0;
            const current = visemeWeights[v] ?? 0;
            const next = current + (target - current) * Math.min(1, delta * 22);
            visemeWeights[v] = next;
            em.setValue(v, next);
          }
        }

        vrm.update(delta);
      }

      renderer.render(three, camera);
    });

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(mount);

    return () => {
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      if (vrmRef.current) {
        three.remove(vrmRef.current.scene);
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current = null;
      }
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [modelUrl]);

  // 現在の行を再生し、終わったら次の行へ進む（行送りは lineIndex の更新で駆動する）
  useEffect(() => {
    if (!playing || lineIndex < 0) return;
    const clock = clockRef.current;
    if (!clock) return;

    const line = scene.lines[lineIndex];
    if (!line) return;

    let cancelled = false;
    let timer: number | undefined;
    let audioEl: HTMLAudioElement | null = null;

    /** 行間の余韻をおいて次の行へ。最終行なら停止する。 */
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (lineIndex + 1 < scene.lines.length) {
          setLineIndex(lineIndex + 1);
        } else {
          setPlaying(false);
          setLineIndex(-1);
        }
      }, 350);
    };

    const start = async () => {
      let audio: HTMLAudioElement | null = null;
      if (line.audio) {
        const el = new Audio(line.audio);
        try {
          await new Promise<void>((resolve, reject) => {
            el.addEventListener("loadedmetadata", () => resolve(), { once: true });
            el.addEventListener("error", () => reject(new Error("no audio")), { once: true });
          });
          audio = el;
        } catch {
          setMissingAudio(true); // 音声未生成でも字幕と口パクは動かす
        }
      }
      if (cancelled) return;

      audioEl = audio;
      const events = buildMoraTimeline(line.kana, audio?.duration);
      playbackRef.current = { events, startedAt: clock.elapsedTime, audio };

      if (audio) {
        // 音声の終了イベントで行送りする（タブが非表示でも進む）
        audio.addEventListener("ended", scheduleNext, { once: true });
        await audio.play();
      } else {
        // 音声がない行はタイムラインの長さぶん待って行送りする
        timer = window.setTimeout(scheduleNext, timelineDuration(events) * 1000);
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (audioEl) {
        audioEl.removeEventListener("ended", scheduleNext);
        audioEl.pause();
      }
      playbackRef.current = null;
    };
  }, [playing, lineIndex, scene.lines]);

  const handlePlay = useCallback(() => {
    if (playing) return;
    setMissingAudio(false);
    setLineIndex(0);
    setPlaying(true);
  }, [playing]);

  const currentLine = lineIndex >= 0 ? scene.lines[lineIndex] : undefined;
  const speaker = currentLine ? scene.characters[currentLine.speaker] : undefined;
  const background = (scene.background && BACKGROUNDS[scene.background]) || DEFAULT_BACKGROUND;

  return (
    <div className="flex flex-col gap-4">
      <div className={`relative h-[480px] w-full overflow-hidden rounded-3xl ${background}`}>
        <div className="absolute top-4 left-4 rounded-2xl bg-white/85 px-4 py-2 text-sm text-[#1f3a56] shadow">
          <RubyText text={scene.title} furigana={scene.furigana} showRuby={showRuby} />
        </div>

        <div ref={mountRef} className="absolute inset-0" />

        {currentLine && (
          <div className="absolute bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-2xl bg-white/90 px-5 py-3 text-[#1f3a56] shadow-lg">
            <span className="mr-3 text-xs font-bold text-[#0288d1]">{speaker?.name}</span>
            <RubyText
              text={currentLine.text}
              furigana={scene.furigana}
              showRuby={showRuby}
              className="leading-loose"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handlePlay}
          disabled={!ready || playing}
          className="rounded-full bg-[#004f8d] px-6 py-2 font-medium text-white shadow-[0_4px_0_#003c6b] transition-transform hover:scale-[1.02] active:translate-y-1 active:shadow-none disabled:opacity-40"
        >
          {playing ? "さいせい中…" : "▶ さいせい"}
        </button>
        <span className="text-sm text-[#5a7089]">
          {playing ? `${lineIndex + 1} / ${scene.lines.length}` : status}
          {missingAudio && "（音声ファイルなし: 字幕と口パクのみ）"}
        </span>
      </div>
    </div>
  );
}
