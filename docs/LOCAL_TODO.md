# ローカル作業キュー

クラウドのエージェント（サンドボックス）からは実行できない作業を、ここに積む。
ローカルで消化したら `[x]` にして push（このファイルの更新だけのコミットでOK）。

**運用ルール**
- クラウド側エージェント: ローカルでしかできない作業に気づいたら、ここに追記してpushする（チャットでの口頭依頼だけにしない）
- ローカル側: 消化したらチェックを付けてpush。成果物（画像など）は該当パスにコミットする
- 完了項目は月1で「完了ログ」へ移す

## 未対応

- [ ] **ネクマックス原画の配置**
  ```bash
  curl -L -o public/img/characters/nexmax/reference.png \
    "https://nextmake.site/wp-content/uploads/2025/08/N.D%E5%B7%A6.png"
  ```
  → commit & push（配置した瞬間、全ページのプレースホルダーが本物に切り替わる）
- [ ] **ネクマックス6バリアントの生成**（Codex / image-gen-2）
  手順: `docs/skills/codex_image_generation.md` §5。1セッションで6体まとめて生成
- [ ] **Supabase: Vercelの環境変数登録**（`docs/deploy.md` §3 の表の4変数、Production/Preview両方）
- [ ] **Supabase: Google OAuth リダイレクトURL登録**（`docs/deploy.md` §4-1。`https://*.vercel.app/auth/callback` を含む）
- [ ] **（任意・恒久策）クラウドセッションのネットワーク許可に `vercel.app` / `nextmake.site` を追加**
  → クラウド側エージェントが直接プレビュー確認・画像取得できるようになる

## 完了ログ

- [x] Vercel Hobby にリポジトリを接続（PRプレビュー自動発行を確認済み・2026-07-22）
