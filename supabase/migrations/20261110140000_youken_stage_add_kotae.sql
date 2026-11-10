-- 「要件定義」の DB行に、ページ「先生の こたえと くらべよう」（youken_kotae）を 足す
--
-- ## なぜ 要るか
-- 旧アプリの ワンページ要件定義は「10. 解答」（模範の 要件定義書・ページ構成・デザインの 決まり）を
-- 作り終えた あとに 見せて いた。移植で その中身が 前の ページ（要件定義書・デザイン）に 出て、
-- 学生が 自分で 書く・えらぶ 前に 答えが 見えて いた（2026-11-10 の 指定
--「STEP11要件定義の内容がもとのnextmake-onboardingの内容と異なります」）。
-- 答えを 新しい ページ youken_kotae に 移し、デザインの ページの あと・完成例の 前に 置く。
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この ステージは DB行を 持つ ので、
-- git の `contents` に 足すだけでは 学習者に 出ない。
--
-- ## 足すだけ（ほかの 要素と 並びには 触らない）
-- 完成例（youken_recruit_sample）の 前に 入れる。完成例が 無ければ おわりに 足す。
-- すでに 入って いれば 何も しない（2回 流しても 同じ）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 教材の ファイルは git に ある。ステージの ページは ビルド時に 焼き込む ので、本番は
-- 次の デプロイまで 変わらない。いまの コードが 知らない ID には ならない（同じ PR で 足す）。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      with items as (
        select item, position
        from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
      ),
      anchor as (
        select coalesce(
          (select min(position) from items where item->>'ref' = 'youken_recruit_sample'),
          (select max(position) + 1 from items)
        ) as at
      ),
      merged as (
        select item, position * 2 as sort_key from items
        union all
        select jsonb_build_object('ref', 'youken_kotae', 'type', 'article'), (select at from anchor) * 2 - 1
      )
      select jsonb_agg(item order by sort_key) from merged
    )
  ),
  updated_at = now()
where id = 'youken'
  and kind = 'stage'
  and jsonb_typeof(data->'contents') = 'array'
  and jsonb_array_length(data->'contents') > 0
  and not exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where item->>'ref' = 'youken_kotae'
  );
