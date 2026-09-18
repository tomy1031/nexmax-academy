-- 「報連相：報告」の DB行で、調査（リサーチ）を 別ページ（link）から もんだい（quizset）へ 差し替える
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` は
-- スタジオで 保存ずみで、`contents` の 7本目が まだ
-- `{"ref": "houkoku_search", "type": "link", "gates": true}` の ままである。
-- 2026-09-18 に 調査を 別ページ（静的HTML＋postMessage）から いつもの もんだい
-- （全問1ページ・まとめて 出す。`content/quizsets/houkoku_search_quiz.json`）へ
-- 差し替えたので、DB行を 直さなければ **学習者には 古い 別ページが 出つづける**。
-- （指定:「別ウィンドウで表示する形式をやめて、いつものクイズ形式に」
--   「元のものはいったん残して非表示に」——元の link は 消さず、ステージから 外すだけ）
--
-- ## なぜ 行ごと 消さないか・なぜ contents を 丸ごと 書かないか
-- 前例（20260908061500 / 20260915120000）と 同じく、git に 無い 値を 巻き戻さない ため。
-- さらに この 行の `contents` は git より 1本 少ない（9本目の `houkoku_meeting` が 無い。
-- 20260915120000 の「のこる 宿題」）。丸ごと 書くと その 判断まで 勝手に 変える ので、
-- **調査の 1つ だけ**を 同じ 位置で 差し替え、ほかの 要素と 並びには 触らない。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 本番の いまの ビルドは この 更新を 読まない（落ちない）。
-- **ただし 統合から 本番への 昇格までの あいだ**に main から 本番を 手で 出し直すと
-- （緊急の 直し）、古い コードが この 行を 読み、`houkoku_search_quiz` が 無いので
-- 参照切れと して 外れる——**本番の 報告ステージから 調査が 黙って 消え、答え合わせへ
-- 素通りできる**。その あいだに 緊急デプロイを したら、`/api/health/content` の
-- missingContents に `houkoku_search_quiz` が 出て いないか 見て、出て いれば
-- この PR ごと 昇格させる（ふつうは 授業前の 自動デプロイで 両方 そろって 出る）。
--
-- ## のこる 宿題（この SQL では 直さない）
-- `houkoku_meeting` が この 行に 無い 件は そのまま（今回の 変更の 外）。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(
        case
          when item->>'ref' = 'houkoku_search' and item->>'type' = 'link'
            then item || jsonb_build_object('ref', 'houkoku_search_quiz', 'type', 'quizset')
          else item
        end
        order by position
      )
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
    )
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "houkoku_search", "type": "link"}]'::jsonb;
