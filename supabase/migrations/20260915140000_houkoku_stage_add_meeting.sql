-- 「報連相：報告」の DB行に、ミーティング「報告の 練習」を 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` は
-- スタジオで 保存ずみ（2026-09-14 05:02 UTC）で、`contents` が 8本の ままである。
-- `content/stages/houkoku.json` の 9本目（`houkoku_meeting` / meeting）が DB行に 隠され、
-- **学習者には STG でも 本番でも ミーティングが 出ない**
-- （/api/health/content の houkoku に `hiddenContents: ["meeting:houkoku_meeting"]`）。
-- 20260915120000 の「のこる 宿題」に 書いた ものを ここで 片づける。
--
-- ## なぜ 行ごと 消さないか
-- 前例（20260908061500 / 20260908104500 / 20260915120000）と 同じ 判断。スタジオで
-- 保存された 行で、git に 無い 値を 持って いる かも しれない。だから `contents` の
-- 1キーだけ `||` で 差し替える（`wordStageIds` `area` `description` `furigana` には 触らない。
-- `wordStageIds` は 20260915120000 で 直した ばかり）。
--
-- 中身は `content/stages/houkoku.json` から そのまま 写した（DBの 8本と 同じ 並び・
-- `houkoku_search` の `gates: true` も そのまま＋新しい 1本）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- `houkoku_meeting` は すでに git に あり、本番・STG の ビルドにも 載って いる。
-- 古い ビルドは この 更新を 読まず、次の デプロイで 9本目が 出る。
--
-- ## 流す 前に 確かめた こと（2026-09-15・同じ 式を select で 当てた）
-- 8本 → 9本、先頭 8本は DB の いまと 同一、`contents` 以外の キーは 変化なし。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents', jsonb_build_array(
      jsonb_build_object('ref', 'houkoku_lecture', 'type', 'article'),
      jsonb_build_object('ref', 'houkoku_answer', 'type', 'quizset'),
      jsonb_build_object('ref', 'houkoku_skit', 'type', 'skit'),
      jsonb_build_object('ref', 'houkoku_kotsu', 'type', 'article'),
      jsonb_build_object('ref', 'houkoku_listening', 'type', 'listening'),
      jsonb_build_object('ref', 'houkoku_quiz', 'type', 'quizset'),
      jsonb_build_object('ref', 'houkoku_search', 'type', 'link', 'gates', true),
      jsonb_build_object('ref', 'houkoku_hierarchy', 'type', 'article'),
      jsonb_build_object('ref', 'houkoku_meeting', 'type', 'meeting')
    )
  ),
  updated_at = now()
where id = 'houkoku' and kind = 'stage';
