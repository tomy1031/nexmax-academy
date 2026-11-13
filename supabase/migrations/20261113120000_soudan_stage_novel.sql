-- 「報連相：相談」の DB行で、5番目の「いま 話しかけて いい？」（quizset soudan_kehai）を
-- 相談の 練習（meeting soudan_novel）に 差しかえる
--
-- ## なぜ 要るか
-- 2026-11-12 の 指定「いま 話しかけて いい？の代替コンテンツを 添付の 内容で 作成して」で、
-- git の `content/stages/soudan.json` の 5番目を 相談の 練習に 差しかえた（PR #720）。
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この ステージは DB行を 持つ
--（20261030120000_map_areas_route_order.sql が `id = 'soudan'` を 直して いる）ので、
-- git の `contents` を 変えただけでは 学習者に 出ない——STG で
-- `/soudan/meeting-soudan_novel` が「ページが 見つかりません」に なった（2026-11-13）。
--
-- ## 差しかえるだけ（ほかの 要素と 並びには 触らない）
-- soudan_kehai が あった 位置に soudan_novel を 置く。soudan_kehai が 無い（先生が 外した）
-- ときや、soudan_novel が もう 入って いる ときは 何も しない（2回 流しても 同じ）。
-- 元の もんだい（soudan_kehai）の DB行・git の ファイルは 消さない。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 教材の ファイル（content/meetings/soudan_novel.json）と 画面（meeting.novel）は
-- integration に もう 入って いる。いまの 本番の コードは soudan_novel を 知らないので、
-- 本番に 出るまでの あいだは 参照切れとして 外す だけ（落ちない・ほかの 教材は そのまま）。
-- ステージの ページは ビルド時に 焼き込む ので、STG・本番は 次の デプロイで 変わる。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      select jsonb_agg(
        case
          when item->>'ref' = 'soudan_kehai'
            then jsonb_build_object('ref', 'soudan_novel', 'type', 'meeting')
          else item
        end
        order by position
      )
      from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
    )
  ),
  updated_at = now()
where id = 'soudan'
  and kind = 'stage'
  and jsonb_typeof(data->'contents') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where item->>'ref' = 'soudan_kehai'
  )
  and not exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where item->>'ref' = 'soudan_novel'
  );
