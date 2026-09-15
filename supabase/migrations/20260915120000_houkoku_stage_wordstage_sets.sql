-- 「報連相：報告」の DB行に、単語テストの 上級セットを 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` は
-- スタジオで 保存ずみ（2026-09-14 05:02 UTC）で、`wordStageIds` が
-- `["hourensou_houkoku"]` の ままである。2026-09-15 に 単語テストを
-- 初級（hourensou_houkoku・50語）と 上級（hourensou_houkoku_jokyu・42語）に 分けたので、
-- DB行を 直さなければ **学習者には 初級しか 出ない**（2026-08-26 の kaisha と 同じ型）。
--
-- ## なぜ 行ごと 消さないか
-- 前日に 保存された 行で、git に 無い 値を 持って いる かも しれない。前例
-- （20260908061500 / 20260908104500）と 同じく、要る キー 1つだけ `||` で 差し替える
-- （`contents` `area` `description` `furigana` には 触らない）。
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む（force-static）。
-- 本番の 古い ビルドは この 更新を 読まない。次の デプロイで 新しい git
-- （上級セットを 含む）と いっしょに 読まれる。
--
-- ## のこる 宿題
-- この 行は `contents` が 8本で、git の 9本目（`houkoku_meeting`）を 隠して いる
-- （/api/health/content の hiddenContents）。今回の 変更の 外なので 触って いない。

update studio_contents
set
  data = data || jsonb_build_object(
    'wordStageIds', jsonb_build_array('hourensou_houkoku', 'hourensou_houkoku_jokyu')
  )
where id = 'houkoku' and kind = 'stage';
