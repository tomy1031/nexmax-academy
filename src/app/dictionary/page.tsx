import type { Metadata } from "next";
import { DictionaryPage } from "@/components/dictionary-page";

/**
 * ことばの辞書（学習者向け）
 *
 * 中身は **ことばの正**（`content/vocab`）を そのまま 畳んだもの。**別の保存先は無い**
 *（src/lib/dictionary.ts）。**単語テストに 出る 語は この 中の 一部**で、
 * テストに 出す セットは リンク（「○○の 単語テスト」）を 出すためだけに 見る
 *（2026-08-25 の指定「ポップアップ＝単語テストではない」）。
 */
export const metadata: Metadata = { title: "ことばの じしょ" };

/** 公開分のDBコンテンツは初回アクセスのとき合流する（設計07 §11.1）。 */
/*
 * **作りおきを 作り直さない**（`force-static`）。`revalidate` を 置くと、期限ぎれの
 * 作りおきを 直すために リクエストの 中で フルSSR（実測 280〜570ms）が 走り、
 * 無料枠の CPU 10ms で 落ちる。落ちても 鮮度は 更新されないので、輪が 閉じない。
 * 理由の 全文は src/app/[stage]/[content]/page.tsx と docs/deploy.md §0.13。
 */
export const dynamic = "force-static";

export default function Page() {
  /*
   * 語の 束は **ブラウザが 取りに 行く**（src/lib/dictionary-store.ts）。
   * サーバで 描いて いた ころは、この 1ページの 作りおきだけで 1.7MB あった。
   */
  return <DictionaryPage />;
}
