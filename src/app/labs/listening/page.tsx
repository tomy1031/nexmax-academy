import type { Metadata } from "next";
import sceneJson from "@/../content/scenes/onboarding_welcome.json";
import { sceneSchema } from "@/content/schema";
import { ScenePlayer } from "@/components/scene-player";

export const metadata: Metadata = {
  title: "リスニング: ようこそ | NexmaxAcademy labs",
  description:
    "チュートリアルのナレーションを、ヘンディ先輩の声で聞くリスニング題材（字幕はあとから開ける）",
};

// スキーマが検収の契約。壊れたデータならビルド時に落とす。
const scene = sceneSchema.parse(sceneJson);

export default function ListeningPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-[#0288d1] uppercase">
          labs / 検証用（学習者には公開しない）
        </p>
        <h1 className="text-2xl font-bold text-[#1f3a56]">リスニング: ようこそ</h1>
        <p className="text-sm leading-6 text-[#5a7089]">
          チュートリアル（<code>/tutorial</code>）で実際に使っているナレーションを、
          そのままリスニングの題材にしています。まず<strong>音だけ</strong>
          で聞いて、聞きとれたら「もじを みる」で答え合わせをします。 何度でも聞けます。
        </p>
      </header>

      <ScenePlayer scene={scene} listening />

      <section className="rounded-2xl bg-[#f4fbff] px-5 py-4 text-sm leading-6 text-[#5a7089]">
        <h2 className="mb-1 font-bold text-[#1f3a56]">つかいかた</h2>
        <ol className="list-inside list-decimal">
          <li>「▶ さいせい」で 音を さいごまで きく</li>
          <li>なんの はなしだったか、じぶんの ことばで 言ってみる</li>
          <li>「もじを みる」で たしかめる（ルビつき）</li>
        </ol>
      </section>

      <footer className="text-xs leading-5 text-[#9db0c2]">
        音声: Gemini Live（{Object.values(scene.characters)[0]?.voice}）。 モデル:
        ヘンディ先輩（VRoid Studio 制作 / VRM 1.0）。 台本は{" "}
        <code>content/scenes/{scene.id}.json</code>（プレーンテキスト＋読み辞書。
        ルビは表示時にエンジンが合成する）。
      </footer>
    </main>
  );
}
