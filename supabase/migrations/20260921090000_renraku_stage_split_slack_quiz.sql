-- 「報連相：連絡」の DB行に、上級（Slack）の もんだいを 1本 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:renraku` が
-- スタジオで 保存ずみ だと、`contents` は DBの 中身が そのまま 出るので、
-- git で 足した 1本（`renraku_contact_slack_quiz`）が **学習者には 出ない**。
--
-- 2026-09-21 の 指定「上級は別な教材として分けてください」で、連絡文の 練習 20問を
--   - `renraku_contact_quiz`（初級：メール 10問。**IDは そのまま**）
--   - `renraku_contact_slack_quiz`（上級：Slack 10問。**新しい**）
-- の 2本に 分けた。元の 別ページ（`public/tools/hourensou/renraku_contact.html`）も
-- 初級／上級の **タブ 2つ**で 分かれて いたので、その 形に 戻した ことに なる。
--
-- ## なぜ contents を 丸ごと 書かないか
-- 前例（20260918120000・20260920120000）と 同じ。git に 無い 値を 巻き戻さない ため。
-- **初級の すぐ うしろに 1本 差し込むだけ**で、ほかの 要素と 並びには 触らない。
-- すでに 入って いれば 何も しない（`@>` の 条件で 弾く）ので、何度 流しても よい。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 本番の いまの ビルドは この 更新を 読まない（落ちない）。
-- **ただし 統合から 本番への 昇格までの あいだ**に main から 本番を 手で 出し直すと
-- （緊急の 直し）、古い コードが この 行を 読み、`renraku_contact_slack_quiz` が 無いので
-- 参照切れと して 外れる——**上級が 出ないだけ**で、初級は そのまま 出る（前回の
-- 差し替えと ちがい、いま 出て いる ものが 消える 向きでは ない）。
-- その あいだに 緊急デプロイを したら `/api/health/content` の missingContents に
-- `renraku_contact_slack_quiz` が 出て いないか 見て、出て いれば この PR ごと 昇格させる。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(item order by position)
      from (
        select item, position
        from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
        union all
        select
          jsonb_build_object(
            'ref', 'renraku_contact_slack_quiz',
            'type', 'quizset',
            'gates', false
          ),
          -- 初級の すぐ うしろ（同じ 順位に 0.5 を 足して 割り込む）
          (
            select position + 0.5
            from jsonb_array_elements(data->'contents') with ordinality as u(item, position)
            where item->>'ref' = 'renraku_contact_quiz'
            limit 1
          )
      ) as merged
    )
  ),
  updated_at = now()
where id = 'renraku'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "renraku_contact_quiz", "type": "quizset"}]'::jsonb
  and not data->'contents' @> '[{"ref": "renraku_contact_slack_quiz"}]'::jsonb;
