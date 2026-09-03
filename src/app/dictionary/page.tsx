import type { Metadata } from "next";
import { DictionaryPage } from "@/components/dictionary-page";
import { listVocabBooks, listWordStages } from "@/lib/content";
import { buildDictionary } from "@/lib/dictionary";

/**
 * ことばの辞書（学習者向け）
 *
 * 中身は **ことばの正**（`content/vocab`）を そのまま 畳んだもの。**別の保存先は無い**
 *（src/lib/dictionary.ts）。**単語テストに 出る 語は この 中の 一部**で、
 * テストに 出す セットは リンク（「○○の 単語テスト」）を 出すためだけに 見る
 *（2026-08-25 の指定「ポップアップ＝単語テストではない」）。
 */
export const metadata: Metadata = { title: "ことばの じしょ" };

/** 公開分のDBコンテンツを合流させるため ISR（設計07 §11.1）。 */
/*
 * 7日。無料枠の CPU 10ms では 作り直しの フルSSR（280〜570ms）が 落ち、
 * 鮮度が 更新されないまま 毎リクエスト 繰り返す ため（2026-09-02 に 授業中の
 * 本番で 発生）。理由の 全文は src/app/[stage]/[content]/page.tsx と
 * docs/deploy.md §0.13。有料プランに したら 300 へ 戻してよい。
 */
export const revalidate = 604800;

export default async function Page() {
  const [books, stages] = await Promise.all([listVocabBooks(), listWordStages()]);
  return <DictionaryPage entries={buildDictionary(books, stages)} />;
}
