import { permanentRedirect } from "next/navigation";

/**
 * 古いチュートリアルのURL。
 *
 * 中身は導入ステージ「はじまり」へ移した——手紙のまんが（ヘンディさんからの手紙）と
 * 読み物「この ちずの あるきかた」がそれである。同じ説明を2か所に置くと、
 * かたほうだけ古くなる（この6ステップは、どの画面からもリンクされていなかった）。
 *
 * ルートは消さずに送る（AGENTS.md「古いURLは消さず、本来のURLへリダイレクトする」）。
 * ブックマークや授業の資料に貼られたURLを死なせないため。
 */
export default function TutorialPage() {
  permanentRedirect("/hajimari");
}
