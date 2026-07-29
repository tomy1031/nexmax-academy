// パイロット用のデモセリフ（ヘンディ先輩の朝会あいさつ）。
// 本実装では src/content/schema.ts 準拠のシーンデータに置き換える。

export interface DemoLine {
  speaker: string;
  /** 表示用テキスト */
  text: string;
  /** 口パク生成用のかな表記（発音ベース） */
  kana: string;
  /** 音声ファイル（public 配下）。存在しない場合は無音でタイムライン再生する */
  audioSrc: string;
}

export const DEMO_LINE: DemoLine = {
  speaker: "ヘンディ先輩",
  text: "おはようございます。あさの ミーティングを はじめます。きょうの よていを おしえてください。",
  kana: "おはよーございます。あさの みーてぃんぐを はじめます。きょーの よていを おしえてください。",
  audioSrc: "/labs/vrm/hendy_line.wav",
};
