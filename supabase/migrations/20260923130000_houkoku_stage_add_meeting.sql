-- 「報連相：報告」の DB行の さいごに、報告の ミーティング（houkoku_meeting）を 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` の DB行には
-- 前から `houkoku_meeting` が 無く（20260915120000 の「のこる 宿題」）、学習者に 届く
-- ステージの さいごが バグ報告ゲームに なって いた。git の `contents` と ステージの 説明
--（「さいごは ヘンディ先輩を 上司の 役に して、自分の ことばで 報告します」）に そろえる。
-- （2026-09-23 の 指定「A」＝DB にも ミーティングを さいごに 足す）
--
-- ## 足すだけ（ほかの 要素と 並びには 触らない）。すでに あれば 何も しない
--
-- ## いま 流して 安全か
-- `houkoku_meeting` は いまの 本番の コードにも ある 教材（git の contents に 入って いる）。
-- 参照切れには ならない。ステージの ページは ビルド時に 焼き込む ので、出し直しで 効く。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents',
    (data->'contents') || '[{"ref": "houkoku_meeting", "type": "meeting"}]'::jsonb
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and not (data->'contents' @> '[{"ref": "houkoku_meeting"}]'::jsonb);
