import type { Metadata } from "next";
import VrmPilot from "./VrmPilot";

export const metadata: Metadata = {
  title: "VRM口パクパイロット | NexmaxAcademy labs",
  description:
    "three-vrmによるブラウザ内キャラクター描画と、かなタイムライン駆動の口パク検証（ヘンディ先輩の朝会）",
};

export default function VrmPilotPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wide text-[#0288d1] uppercase">
          labs / 検証用（学習者には公開しない）
        </p>
        <h1 className="text-2xl font-bold text-[#1f3a56]">
          VRM口パクパイロット — ヘンディ先輩の朝会
        </h1>
        <p className="text-sm leading-6 text-[#5a7089]">
          VRoid製VRMモデルをthree-vrm（WebGL2）でブラウザ描画し、かな文字列から
          生成した口パクタイムラインで「あ・い・う・え・お」表情を駆動する検証ページです。
          キャラクターはHTML背景の上に直接合成されるため、背景透過処理は不要です。
          現在は仮モデル（Seed-san）で、ヘンディ先輩のVRoidモデル完成後に差し替えます。
        </p>
      </header>
      <VrmPilot />
      <footer className="text-xs leading-5 text-[#9db0c2]">
        仮モデル: Seed-san（VirtualCast, Inc. /{" "}
        <a
          className="underline"
          href="https://vrm.dev/licenses/1.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          VRM Public License 1.0
        </a>
        、vrm-c/vrm-specification サンプルより検証目的で使用）。
        音声はmacOS内蔵TTSの仮置き。本番はGemini Live / VOICEVOXに差し替える。
      </footer>
    </main>
  );
}
