---
name: nexmax-release
description: このアプリのデプロイ・リリース作業のときに必ず発火。「STGに上げて」「ステージングに反映」「本番に出して」「確認URLを更新」「デプロイして」「閉じて」「マージして」と言われたときに使う。クライアント方式（ユーザーはPR・マージをしない）で main統合 → STG → 生存確認 → URL+手順つき報告まで進める。
---

手順の正は `docs/deploy.md` §0 と AGENTS.md「統合とデプロイ」。**作業前に両方を Read すること。**

骨子（詳細は上記2文書）:

1. **作業中の確認** → `npm run cf:branch`（自分専用URL。stagingに上げない）
2. **ユーザー確認・リリース** → 先に `origin/main` を取り込む → AI が PR 作成 → main へ統合 →
   `npm run cf:staging`（HEAD が origin/main と同一のときだけ通る。ガードを外さない）
3. **本番** → ユーザーの OK が出てから main で `npm run cf:deploy`
4. 反映後は**主要ページの生存確認**をし、「URL＋操作＋見るポイント」形式で報告する
   （変えていない画面が変わっていないことも確認 = 引き算検証）
