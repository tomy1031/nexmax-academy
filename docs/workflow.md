# 開発ワークフロー — ローカル主体＋クラウド併用

## 基本方針

- **通常の作業全般 → ローカル**（リポジトリ内で `claude` / `codex` を起動して作業）
- **PCが開けないとき → クラウド**（スマホの Claude アプリ / claude.ai からセッションを作成して依頼）

どちらのエージェントも同じ知識層（`CLAUDE.md` → `AGENTS.md`・`docs/design/`）と同じ品質ゲート（pre-commit・CI）で動く。共有状態は **GitHubリポジトリだけ**。

## 衝突を防ぐ唯一のルール：1ブランチ＝1作業主体

1. クラウドへの依頼は必ず**新しいブランチ＋PR**で行わせる（同時にローカルで触らない）
2. ローカルで作業中のブランチをクラウドに触らせない
3. **離席前に push**（WIPでよい）。クラウドから見えるのは push 済みの状態だけ
4. 作業させるほどではないアイデア・気づきは Issue に書く（後でローカルで拾うか、クラウドに「Issue #N をやって」と依頼）

## 出先ループ（PCなしで完結する）

```
スマホでクラウドセッションに依頼
  → PRが立つ（CI自動実行）
  → Vercelプレビューをスマホで確認
  → 直したい点はPRコメントに書く（クラウドセッションに自動で届く）
  → OKになったらGitHubアプリでマージ
```

## ローカル初回セットアップ

```bash
git clone https://github.com/tomy1031/nexmax-academy.git
cd nexmax-academy
npm install          # husky pre-commit も自動セットアップされる
cp .env.example .env.local   # 実値を投入（docs/deploy.md 参照）
npm run dev
```

## 関連

- ローカルでしかできない作業の受け渡し: `docs/LOCAL_TODO.md`
- 検証環境（Vercel）と Supabase 共有の運用: `docs/deploy.md`
