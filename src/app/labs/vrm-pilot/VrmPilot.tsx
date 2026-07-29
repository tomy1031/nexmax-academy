"use client";

// VRM口パクパイロット: three-vrm でVRMモデルをブラウザ描画し、
// かなタイムライン（lipsync.ts）駆動で「あいうえお」表情を切り替える検証ページ。
// WebGL2で動作（WebGPU不要）。音声ファイルがあれば同期再生、なければ無音再生。

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { ALL_VISEMES, buildMoraTimeline, timelineDuration, type MoraEvent } from "./lipsync";
import { DEMO_LINE } from "./scenario";

const MODEL_URL = "/labs/vrm/Seed-san.vrm";

interface PlaybackState {
  events: MoraEvent[];
  /** clock.elapsedTime 基準の再生開始時刻 */
  startedAt: number;
  /** 同期対象の音声（ない場合は null = クロック駆動） */
  audio: HTMLAudioElement | null;
}

export default function VrmPilot() {
  const mountRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<PlaybackState | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const vrmRef = useRef<VRM | null>(null);

  const [status, setStatus] = useState("モデルを読み込み中…");
  const [expressions, setExpressions] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 20);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, Math.PI * 0.45);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.35));

    const clock = new THREE.Clock();
    clockRef.current = clock;

    // まばたきスケジューラ
    let nextBlinkAt = 2;
    let blinkStartedAt = -1;
    const BLINK_SEC = 0.15;

    // 口形状ウェイトの現在値（フレーム間で滑らかに追従させる）
    const visemeWeights: Record<string, number> = {};
    for (const v of ALL_VISEMES) visemeWeights[v] = 0;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let disposed = false;

    loader
      .loadAsync(MODEL_URL, (progress) => {
        if (progress.total > 0) {
          const pct = Math.round((progress.loaded / progress.total) * 100);
          setStatus(`モデルを読み込み中… ${pct}%`);
        }
      })
      .then((gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        vrmRef.current = vrm;

        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm); // VRM0.x の場合のみ向きを補正（VRM1では何もしない）
        scene.add(vrm.scene);

        // Tポーズ回避: 腕を下ろした立ち姿にする
        const leftArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const rightArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (leftArm) leftArm.rotation.z = -1.15;
        if (rightArm) rightArm.rotation.z = 1.15;

        // バストアップの構図: 頭部の高さに合わせてカメラを置く
        const head = vrm.humanoid.getNormalizedBoneNode("head");
        const headPos = new THREE.Vector3();
        if (head) head.getWorldPosition(headPos);
        const headY = headPos.y || 1.3;
        camera.position.set(0, headY, 1.25);
        camera.lookAt(0, headY - 0.1, 0);

        const names = vrm.expressionManager?.expressions.map((e) => e.expressionName) ?? [];
        setExpressions(names);
        setStatus("準備完了");
      })
      .catch((err: unknown) => {
        setStatus(`モデルの読み込みに失敗しました: ${String(err)}`);
      });

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      const t = clock.elapsedTime;
      const vrm = vrmRef.current;

      if (vrm) {
        const em = vrm.expressionManager;

        // まばたき
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

        // 口パク: 再生位置から現在のモーラを求め、目標ウェイトへ滑らかに追従
        const playback = playbackRef.current;
        let activeViseme: string | null = null;
        if (playback) {
          const pos = playback.audio ? playback.audio.currentTime : t - playback.startedAt;
          const ended = playback.audio?.ended || pos >= timelineDuration(playback.events) - 0.02;
          if (ended) {
            playbackRef.current = null;
            setPlaying(false);
          } else {
            const event = playback.events.find((e) => pos >= e.start && pos < e.end);
            if (event) activeViseme = event.viseme;
          }
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

      renderer.render(scene, camera);
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
        scene.remove(vrmRef.current.scene);
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current = null;
      }
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const handlePlay = useCallback(async () => {
    const clock = clockRef.current;
    if (!clock || playing) return;

    const audio = new Audio(DEMO_LINE.audioSrc);
    try {
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve(), {
          once: true,
        });
        audio.addEventListener("error", () => reject(new Error("no audio")), {
          once: true,
        });
      });
      const events = buildMoraTimeline(DEMO_LINE.kana, audio.duration);
      playbackRef.current = { events, startedAt: clock.elapsedTime, audio };
      setAudioAvailable(true);
      setPlaying(true);
      await audio.play();
    } catch {
      // 音声ファイルがない場合は無音でタイムラインのみ再生
      const events = buildMoraTimeline(DEMO_LINE.kana);
      playbackRef.current = {
        events,
        startedAt: clock.elapsedTime,
        audio: null,
      };
      setAudioAvailable(false);
      setPlaying(true);
    }
  }, [playing]);

  return (
    <div className="flex flex-col gap-4">
      {/* HTMLの背景の上にキャラクターを直接合成できる（背景透過処理が不要）ことを示すため、
          空グラデ背景の上にcanvasを重ねている */}
      <div className="relative h-[480px] w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#d8f0fc] via-[#f4fbff] to-[#fff7e8]">
        <div className="absolute top-4 left-4 rounded-2xl bg-white/85 px-4 py-2 text-sm text-[#1f3a56] shadow">
          あさの ミーティング
        </div>
        <div ref={mountRef} className="absolute inset-0" />
        <div className="absolute bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-2xl bg-white/90 px-5 py-3 text-[#1f3a56] shadow-lg">
          <span className="mr-3 text-xs font-bold text-[#0288d1]">{DEMO_LINE.speaker}</span>
          {DEMO_LINE.text}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handlePlay}
          disabled={playing || expressions.length === 0}
          className="rounded-full bg-[#004f8d] px-6 py-2 font-medium text-white shadow-[0_4px_0_#003c6b] transition-transform hover:scale-[1.02] active:translate-y-1 active:shadow-none disabled:opacity-40"
        >
          {playing ? "はなしています…" : "▶ はなす"}
        </button>
        <span className="text-sm text-[#5a7089]">
          {status}
          {audioAvailable === false && "（音声ファイルなし: 口パクのみ）"}
        </span>
      </div>

      <details className="text-xs text-[#9db0c2]">
        <summary>検出された表情プリセット（{expressions.length}件）</summary>
        <p className="mt-1 break-all">{expressions.join(", ") || "なし"}</p>
      </details>
    </div>
  );
}
