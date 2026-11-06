-- 連絡の しかた（renraku_lecture）の DB行に、メンションの 使い分けと【依頼】【連絡】を 足す
--
-- ## なぜ 要るか
-- 合流の きまりは「同一IDなら DBが 勝つ」（設計07 §11.1）。この 教材は DB に 行が ある ので、
-- git の content/articles/renraku_lecture.json を 直すだけでは 学習者に 出ない。
--
-- ## 足す もの（tomy さんの OK・2026-11-06「はい、足して」）
--   3節 コツの 下  メンションの 使い分け（@名前・@here・@channel）
--   4節 【 】の 下 件名の【依頼】と【連絡】、1行目は メンションだけ・2行目に 件名
-- Renraku Master の 問いは @here・@channel・【依頼】【連絡】を 使うのに、講義に 説明が 無かった。
-- コツの 数（4つ）は 変えない（まんがの まとめと そろえて ある）。
-- 読み辞書（furigana）には 新しい 文の 語だけ 足す（依頼・結果・例・行目・必ず）。今 ある 読みと、ほかの 節には 触らない。
--
-- ## いま 流して 安全か
-- 使う ブロックは 今の 本番の コードが 読める もの だけ（heading・paragraph・cards・callout）。
-- 足す 場所の 前後が 今の 文の ままの 行 だけを 直す（先生が 直した 行・2回目には 何も しない）。

update studio_contents
set data = jsonb_set(
  jsonb_set(
    data,
    '{blocks}',
    jsonb_path_query_array(data->'blocks', '$[0 to 13]')
      || $j$[
  {
    "kind": "heading",
    "level": 3,
    "text": "メンション（mention）を 使い分ける"
  },
  {
    "kind": "paragraph",
    "text": "コツ ④の「@田中さん」のように、「@」を 付けて 相手を 呼ぶ ことを、メンション（mention）と 言います。メンションが ないと、通知（notification）が 届かない ことが あります。Slackでは、誰に 伝えたいかで、次の 3つを 使い分けます（choose by situation）。"
  },
  {
    "kind": "cards",
    "columns": 3,
    "items": [
      {
        "icon": "👤",
        "title": "@田中さん",
        "text": "伝える 相手が 決まって いる ときに 使います。その 人に 通知が 届きます。",
        "items": [
          "例：コードの 確認を 頼む"
        ]
      },
      {
        "icon": "🟢",
        "title": "@here",
        "text": "チームに 知らせる ときに 使います。今 オンライン（online）の 人に 通知が 届きます。オフライン（offline）の 人は、あとで 読みます。",
        "items": [
          "例：開発環境の アップデートを 知らせる"
        ]
      },
      {
        "icon": "📢",
        "title": "@channel",
        "text": "全員に 必ず 伝えたい ときに 使います。チャンネル（channel）の 全員（everyone）に 通知が 届きます。オフラインの 人にも 届きます。",
        "items": [
          "例：ミーティングの 時間の 変更を 伝える"
        ]
      }
    ]
  },
  {
    "kind": "callout",
    "tone": "care",
    "text": "@channel は、休んで いる 人にも 通知が 届きます。だから、全員の 予定や 作業が 変わる ときだけ 使いましょう。"
  }
]$j$::jsonb
      || jsonb_path_query_array(data->'blocks', '$[14 to 17]')
      || $j$[
  {
    "kind": "heading",
    "level": 3,
    "text": "件名の【依頼】と【連絡】"
  },
  {
    "kind": "paragraph",
    "text": "件名の【 】を 見ると、読む 人は 自分が 何を すれば いいかが 分かります。チームへの メッセージでは、【共有】の ほかに、【依頼】（request）と【連絡】（notice）も よく 使います。"
  },
  {
    "kind": "cards",
    "columns": 2,
    "items": [
      {
        "icon": "🙏",
        "title": "【依頼】",
        "text": "相手に 作業を して ほしい ときに 使います。読む 人は「自分の 作業が ある」と 分かります。",
        "items": [
          "例：【依頼】テストの 結果の 確認に ついて"
        ]
      },
      {
        "icon": "🔔",
        "title": "【連絡】",
        "text": "予定や 作業を 知らせる ときに 使います。読む 人は「内容を 知って おけば いい」と 分かります。",
        "items": [
          "例：【連絡】明日 10:00〜11:00、サーバーの メンテナンスを します"
        ]
      }
    ]
  },
  {
    "kind": "callout",
    "tone": "point",
    "text": "チャットでは、1行目は メンションだけに します。2行目に【 】の 件名を 書きます。メンションの 次の 行が、コツ ③の「最初の 1行」です。"
  }
]$j$::jsonb
      || jsonb_path_query_array(data->'blocks', '$[18 to last]')
  ),
  '{furigana}',
  (data->'furigana') || $j$[["依頼", "いらい"], ["結果", "けっか"], ["例", "れい"], ["行目", "ぎょうめ"], ["必ず", "かならず"]]$j$::jsonb
)
where id = 'renraku_lecture'
  and jsonb_array_length(data->'blocks') = 36
  and data->'blocks'->13->'items'->3->>'title' = $t$誰に 連絡するか 書く$t$
  and data->'blocks'->14->>'text' = $t$4. 【 】と 箇条書き（bullet points）で 見やすく する$t$
  and data->'blocks'->17->>'kind' = 'list'
  and data->'blocks'->18->>'text' = $t$5. 電話での 連絡$t$;
