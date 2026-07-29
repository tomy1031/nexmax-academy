import type { Metadata } from "next";
import sceneJson from "@/../content/scenes/m1_asakai.json";
import { sceneSchema } from "@/content/schema";
import { ScenePlayer } from "@/components/scene-player";

export const metadata: Metadata = {
  title: "シーンプレイヤー検証 | NexmaxAcademy labs",
  description: "VRMキャラクターの口パクとルビ字幕でシーンデータを再生する検証ページ",
};

// スキーマが検収の契約。壊れたデータならビルド時に落とす。
const scene = sceneSchema.parse(sceneJson);

export default function VrmPilotPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-[#0288d1] uppercase">
          labs / 検証用（学習者には公開しない）
        </p>
        <h1 className="text-2xl font-bold text-[#1f3a56]">シーンプレイヤー検証</h1>
        <p className="text-sm leading-6 text-[#5a7089]">
          コンテンツデータ（<code>content/scenes/{scene.id}.json</code>
          ）だけを入力に、VRMキャラクターの口パク・ルビ字幕・音声を同期再生します。
          セリフはコードに書かれていません。キャラクターはHTML背景の上に直接描画されるため、
          背景透過処理は不要です。
        </p>
      </header>

      <ScenePlayer scene={scene} />

      <footer className="text-xs leading-5 text-[#9db0c2]">
        モデル: ヘンディ先輩（VRoid Studio 制作 / VRM 1.0）。 音声は Gemini Live（
        {Object.values(scene.characters)[0]?.voice}）で差し替え予定（現在は仮音声）。
        ライセンスメタデータの確認事項は <code>public/labs/vrm/README.md</code> を参照。
      </footer>
    </main>
  );
}
