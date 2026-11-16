# kotoba-town（声の 作り置き）

tomy1031/lab の VR 日本語練習アプリ **Kotoba Town** の 声を、この リポジトリの Gemini の 鍵
（Environment「Preview」）で 作る ための 置き場です。**このブランチ専用**で、main / integration には 入れません。

- `manifest.json` … 読む 文の 一覧（lab の `kotoba-town/tools/voice_manifest.mjs` が 作る）
- `run.json` … ワークフローの つまみ（変えて push すると 走る）
- `selfcheck.json` … 判定（Gemini Live の judge_reply）を 本物の API で 確かめる 例
- `js/talk/` … lab の アプリと 同じ Live の コード（self-check が 使う）
- `out/` … 出来た 声（mp3）と 記録。lab 側は `tools/import_voices.mjs` で 取り込む

ワークフロー: `.github/workflows/kotoba-voices.yml`
