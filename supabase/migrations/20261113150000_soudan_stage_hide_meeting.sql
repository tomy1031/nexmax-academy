-- 「報連相：相談」の DB行から、相談の ミーティング（soudan_meeting）を 外す（非表示）
--
-- ## なぜ 要るか
-- tomy さんの 指定（2026-11-13・要望 #748）「ミーティング：相談は非表示にしてください。」
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この ステージは DB行を 持つ
--（20261113120000_soudan_stage_novel.sql など）ので、git の `contents` から 外すだけでは
-- 学習者に 出つづける。
--
-- ## 外すだけ（ほかの 要素と 並びには 触らない）。無ければ 何も しない
-- ミーティングの ファイル（content/meetings/soudan_meeting.json）は 消さない。
-- 前例: 20260925120000_houkoku_stage_hide_meeting.sql と 同じ 書き方。
--
-- ## いま 流して 安全か
-- ステージから 1本 外すだけ。参照切れには ならない（いまの 本番の コードでも 読める）。
-- ステージの ページは ビルド時に 焼き込む ので、STG・本番は 次の デプロイで 変わる。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(item order by position)
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
      where item->>'ref' <> 'soudan_meeting'
    )
  ),
  updated_at = now()
where id = 'soudan'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "soudan_meeting"}]'::jsonb;
