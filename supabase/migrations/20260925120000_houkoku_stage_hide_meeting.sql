-- 「報連相：報告」の DB行から、報告の ミーティング（houkoku_meeting）を 外す（非表示）
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。20260923130000 で DB行の
-- さいごに 足した ので、git の `contents` から 外すだけでは 学習者に 出つづける。
-- （2026-09-25 の 指定「ミーティング：報告の 練習 は 非表示に」）
--
-- ## 外すだけ（ほかの 要素と 並びには 触らない）。無ければ 何も しない
-- ミーティングの ファイル（content/meetings/houkoku_meeting.json）は 消さない。
--
-- ## いま 流して 安全か
-- ステージから 1本 外すだけ。参照切れには ならない（いまの 本番の コードでも 読める）。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(item order by position)
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
      where item->>'ref' <> 'houkoku_meeting'
    )
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and data->'contents' @> '[{"ref": "houkoku_meeting"}]'::jsonb;
