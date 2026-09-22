-- 「報連相：連絡」の DB行で、連絡文の 練習を 別ページ（link）から もんだい（quizset）へ 差し替える
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:renraku` が
-- スタジオで 保存ずみ だと、`contents` の さいごが まだ
-- `{"ref": "renraku_contact", "type": "link"}` の ままで、git の 差し替えが 効かない。
-- 2026-09-20 に 連絡文の 練習を 別ページ（静的HTML を 全画面で 開く リンク教材）から
-- いつもの もんだい（全問1ページ・`content/quizsets/renraku_contact_quiz.json`）へ
-- 差し替えたので、DB行を 直さなければ **学習者には 古い 別ページが 出つづける**。
-- （指定:「別ページで 開くのでは なく、問題コンポーネントとして AI問題を チェックできるように」
--   「AIが 評価する ボタンは 各問題に 設置」——元の link は 消さず、ステージから 外すだけ）
--
-- ## なぜ 行ごと 消さないか・なぜ contents を 丸ごと 書かないか
-- 前例（20260918120000）と 同じく、git に 無い 値を 巻き戻さない ため。
-- **その 1本 だけ**を 同じ 位置で 差し替え、ほかの 要素と 並びには 触らない。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 本番の いまの ビルドは この 更新を 読まない（落ちない）。
-- **ただし 統合から 本番への 昇格までの あいだ**に main から 本番を 手で 出し直すと
-- （緊急の 直し）、古い コードが この 行を 読み、`renraku_contact_quiz` が 無いので
-- 参照切れと して 外れる——**本番の 連絡ステージから 連絡文の 練習が 黙って 消える**。
-- その あいだに 緊急デプロイを したら、`/api/health/content` の missingContents に
-- `renraku_contact_quiz` が 出て いないか 見て、出て いれば この PR ごと 昇格させる
-- （ふだんは 授業前の 自動デプロイで 両方 そろって 出る）。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(
        case
          when item->>'ref' = 'renraku_contact' and item->>'type' = 'link'
            then item || jsonb_build_object('ref', 'renraku_contact_quiz', 'type', 'quizset')
          else item
        end
        order by position
      )
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
    )
  ),
  updated_at = now()
where id = 'renraku'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "renraku_contact", "type": "link"}]'::jsonb;
