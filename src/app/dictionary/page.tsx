import type { Metadata } from "next";
import { DictionaryPage } from "@/components/dictionary-page";
import { listWordStages } from "@/lib/content";
import { buildDictionary } from "@/lib/dictionary";

/**
 * ことばの辞書（学習者向け）
 *
 * 中身は単語ステージを ことば ごとに畳んだもの。**別の保存先は無い**
 *（src/lib/dictionary.ts）。だから「単語ゲームに出てくる ことば」と
 * 「辞書に載っている ことば」が食い違うことがない。
 */
export const metadata: Metadata = { title: "ことばの じしょ" };

/** 公開分のDBコンテンツを合流させるため ISR（設計07 §11.1）。 */
export const revalidate = 60;

export default async function Page() {
  return <DictionaryPage entries={buildDictionary(await listWordStages())} />;
}
