# nextmake_kenshu — Japanese IT Pathway 新アプリ

カンボジアのIT専攻学生（日本語学習歴1年・N5〜N3挑戦）が、日本のIT企業で働くための知識と日本語を、リアルな現場の追体験で学ぶeラーニングアプリ。

旧アプリ [tomy1031/nextmake_onbording](https://github.com/tomy1031/nextmake_onbording) のリニューアル版。設計思想・カリキュラム・移行計画は `docs/design/` を参照。

## 技術スタック

- Next.js (App Router) + TypeScript + Tailwind CSS
- コンテンツは zod スキーマ準拠の JSON（`content/`）。学習エンジンとコンテンツを分離する（`docs/design/03` §1）
- DB/認証・Gemini プロキシはフェーズ1で導入予定

## 開発

```bash
npm install
npm run dev                  # 開発サーバ http://localhost:3000
npm run lint                 # ESLint
npm run typecheck            # tsc --noEmit
npm run lint:content         # コンテンツ検収（スキーマ＋禁止語＋秘匿漏れ）
npm run measure:readability  # 文長・漢字密度レポート
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/design/01_理解設計ガイド.md` | 教材設計の13原則・アンチパターン・制作レシピ（教材を書く前に必読） |
| `docs/design/02_拡張カリキュラム設計書.md` | 「ネクストメイク1年目」12モジュールのカリキュラム計画 |
| `docs/design/03_リニューアル設計方針.md` | アーキテクチャ・DB要件・検収パイプライン・移行手順 |
| `docs/design/review_rubric.md` | 検収ルーブリック（証拠必須） |
| `AGENTS.md` | AIエージェント向けの規律（CLAUDE.md / .gemini からも参照される単一ソース） |
