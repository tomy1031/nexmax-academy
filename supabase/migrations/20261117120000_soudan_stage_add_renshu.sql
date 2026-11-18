-- 「報連相：相談」の DB行に、相談の 練習問題（link soudan_renshu）を 足す
--
-- ## なぜ 要るか
-- tomy さんの 依頼（2026-11-17）「報連相：相談の練習問題を作ってください。相談の5日間の手前に
-- お願いします。」。git の `content/stages/soudan.json` では 5日間（meeting soudan_novel）の
-- 1つ前に 足した。合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この ステージは
-- DB行を 持つ（20261113120000_soudan_stage_novel.sql ほか）ので、git の `contents` を
-- 変えただけでは 学習者に 出ない。
--
-- ## 足すだけ（ほかの 要素と 並びには 触らない）
-- soudan_novel の 直前に 入れる。soudan_novel が 無い（先生が 外した）ときは 末尾に 足す。
-- soudan_renshu が もう 入って いる ときは 何も しない（2回 流しても 同じ）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- 練習問題は リンク教材（静的な 1枚 `public/tools/hourensou/soudan_renshu.html`）で、
-- 教材の 形（schema.ts）は 変えて いない。本番に 出るまでの あいだは、いまの 本番の コードが
-- 教材の 台帳（git-contents.generated.ts）に soudan_renshu を 知らないので、参照切れとして
-- 外す だけ（落ちない・ほかの 教材は そのまま）。ステージの ページは ビルド時に 作る ので、
-- STG・本番は 次の デプロイで 変わる。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', (
      case
        when exists (
          select 1
          from jsonb_array_elements(data->'contents') as t(item)
          where item->>'ref' = 'soudan_novel'
        )
          then (
            select jsonb_agg(entry order by position, sub)
            from (
              select item as entry, position, 1 as sub
              from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
              union all
              select jsonb_build_object('ref', 'soudan_renshu', 'type', 'link'), position, 0 as sub
              from jsonb_array_elements(data->'contents') with ordinality as t(item, position)
              where item->>'ref' = 'soudan_novel'
            ) as merged
          )
        else (data->'contents') || jsonb_build_array(jsonb_build_object('ref', 'soudan_renshu', 'type', 'link'))
      end
    )
  ),
  updated_at = now()
where id = 'soudan'
  and kind = 'stage'
  and jsonb_typeof(data->'contents') = 'array'
  and not exists (
    select 1
    from jsonb_array_elements(data->'contents') as t(item)
    where item->>'ref' = 'soudan_renshu'
  );
