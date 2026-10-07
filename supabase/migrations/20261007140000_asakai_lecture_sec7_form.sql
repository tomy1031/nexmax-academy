-- 朝礼の 講義（asakai_lecture）の DB行の 7節「あなたも 朝礼を やって みよう」を、いただいた 絵 2枚と 書きこみフォームに 置きかえる
--
-- ## なぜ 要るか
-- 2026-10-07 の 指定で、7節の 練習を「絵で 見て、フォームに 書いて、下で 読み返す」形に した
--（絵 2枚は ユーザーから いただいた もの。STEP 1／STEP 2 の 絵と「商品一覧画面の（例）」の 絵）。
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）ので、git の
-- content/articles/asakai_lecture.json を 直すだけでは 学習者に 古い 7節が 出つづける。
--
-- ## 外す もの（7節の 3段落め から 最後まで）
--   サービス 3つの 箇条書き（配車機能・商品一覧画面・決済画面）
--   絵 sec7_apps.webp（3つの アプリの 画面）
--   見出し「朝礼の 4つを 考えましょう」と カード 4枚（①〜④の 型と 例）
-- 役目は こう 引き継ぐ（規律10）:
--   サービスを えらぶ・4つの 型 → STEP の 絵（sec7_steps.webp）
--   書いた 例 → 例の 絵（sec7_example.webp）
--   書いて みる・「問題は ありません。」の 言い方 → フォーム（form ブロック。④の「ない」ときの 選択）
--
-- ## 足す もの（3ブロック）
--   絵「STEP 1 仕事の 状況を 考える。STEP 2 朝礼の 4つの 内容に 分けて 話す」
--   絵「商品一覧画面の 例」
--   書きこみフォーム「あなたの 朝礼を 書いて みよう」（① きのう したこと ／ ② 機能の 進捗 ／
--   ③ きょう すること ／ ④ 問題）
-- 読み辞書（furigana）には、新しい 文の うち DB行に 読みが 無い 語だけ 足す（いまは「分け」1語。
-- 無いと「分けて」の 分が 裸の 漢字に なる）。今 ある 読みと 並びには 触らない。
-- 1〜6節と 7節の 見出し・はじめの 1文（「以下の サービスの どれかの チームに…」）にも 触らない。
--
-- ## いま 流して 安全か
-- **form ブロックを 読める コードが 本番に 出てから 流す。** 読めない コードは この 行を
-- スキーマで 弾き（src/lib/content-db.ts の safeParse）、git の 古い 写しへ 戻る——
-- 先生の 直し（1〜6節）ごと 消えて 見える。だから form ブロックを 足す PR を 先に マージする。
-- 7節の 見出しが 無い 行・すでに form ブロックが ある 行には 何も しない（2回 流しても 同じ）。

update studio_contents
set
  data = data || jsonb_build_object(
    'blocks', (
      select jsonb_agg(block order by position)
      from jsonb_array_elements(data->'blocks') with ordinality as t(block, position)
      where position <= (
        select h.position + 1
        from jsonb_array_elements(data->'blocks') with ordinality as h(block, position)
        where h.block->>'kind' = 'heading'
          and h.block->>'text' = '7．あなたも 朝礼を やって みよう'
        order by h.position
        limit 1
      )
    ) || '[
      {
        "kind": "image",
        "size": "wide",
        "src": "/img/articles/asakai_lecture/sec7_steps.webp",
        "refs": [],
        "status": "done",
        "caption": "STEP 1 仕事の 状況を 考える。STEP 2 朝礼の 4つの 内容に 分けて 話す"
      },
      {
        "kind": "image",
        "size": "wide",
        "src": "/img/articles/asakai_lecture/sec7_example.webp",
        "refs": [],
        "status": "done",
        "caption": "商品一覧画面の 例"
      },
      {
        "kind": "form",
        "title": "あなたの 朝礼を 書いて みよう",
        "historyTitle": "あなたが 書いた 朝礼",
        "fields": [
          {
            "id": "kinou",
            "label": "①",
            "title": "きのう したこと",
            "template": "きのうは、＿＿＿＿＿＿＿＿しました。"
          },
          {
            "id": "shinchoku",
            "label": "②",
            "title": "機能の 進捗",
            "template": "＿＿＿＿機能の 進捗は、＿＿％です。"
          },
          {
            "id": "kyou",
            "label": "③",
            "title": "きょう すること",
            "template": "きょうは、＿＿＿＿＿＿＿＿します。"
          },
          {
            "id": "mondai",
            "label": "④",
            "title": "問題",
            "template": "＿＿＿＿で 問題が あります。今、＿＿＿＿して います。",
            "none": "問題は ありません。"
          }
        ]
      }
    ]'::jsonb,
    'furigana', coalesce(data->'furigana', '[]'::jsonb) || (
      select coalesce(jsonb_agg(entry order by n), '[]'::jsonb)
      from jsonb_array_elements('[["分け", "わけ"]]'::jsonb) with ordinality as a(entry, n)
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(data->'furigana', '[]'::jsonb)) as have(e)
        where have.e->>0 = entry->>0
      )
    )
  ),
  updated_at = now()
where id = 'asakai_lecture'
  and kind = 'article'
  and data->'blocks' @> '[{"kind": "heading", "text": "7．あなたも 朝礼を やって みよう"}]'::jsonb
  and not data->'blocks' @> '[{"kind": "form"}]'::jsonb;
