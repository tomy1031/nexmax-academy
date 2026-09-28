-- 「報連相：報告」の DB行の おわりに、報告の リスニング 5場面（リスニング＋もんだい）を 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。`stage:houkoku` は
-- スタジオで 保存ずみで、git の `contents` に 足した 10本が DB行には 無い。
-- 直さなければ **学習者には この 10本が 出ない**。
-- （2026-09-28 の 指定「リスニング問題.md を 見て リスニング教材を 作成」・置き場所は
--  「報連相：報告 の 最後に 足す」）
--
-- ## なぜ contents を 丸ごと 書かないか
-- 前例（20260923120000）と 同じく、git に 無い 値を 巻き戻さない ため。
-- **いまの ならびの おわり（`houkoku_bug_quiz` の あと）に 10本 足す だけ**。
--
-- ## 2回 流しても 同じ（はじめの 1本か おわりの 1本が 入って いれば 何も しない）
--
-- ## いま 流して 安全か（移行SQLの 決まり: いま動いているコードを壊さない）
-- ステージの ページは ビルド時に git と DB を 合流させて 焼き込む。いまの 本番の コードは
-- この 10本を 知らないので、参照切れとして 外すだけ（落ちない）。統合から 本番への
-- 昇格までの あいだに 緊急デプロイを しても、10本が 出ない だけで ほかの 教材は そのまま。

update studio_contents
set
  data = data || jsonb_build_object(
    'contents',
    (data->'contents') || '[
      {"ref": "houkoku_kanryou_listening", "type": "listening"},
      {"ref": "houkoku_kanryou_quiz", "type": "quizset"},
      {"ref": "houkoku_okure_listening", "type": "listening"},
      {"ref": "houkoku_okure_quiz", "type": "quizset"},
      {"ref": "houkoku_shougai_listening", "type": "listening"},
      {"ref": "houkoku_shougai_quiz", "type": "quizset"},
      {"ref": "houkoku_chousa_listening", "type": "listening"},
      {"ref": "houkoku_chousa_quiz", "type": "quizset"},
      {"ref": "houkoku_chourei_listening", "type": "listening"},
      {"ref": "houkoku_chourei_quiz", "type": "quizset"}
    ]'::jsonb
  ),
  updated_at = now()
where id = 'houkoku'
  and kind = 'stage'
  and jsonb_typeof(data->'contents') = 'array'
  and not (data->'contents' @> '[{"ref": "houkoku_kanryou_listening"}]'::jsonb)
  and not (data->'contents' @> '[{"ref": "houkoku_chourei_quiz"}]'::jsonb);
