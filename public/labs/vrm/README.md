# labs/vrm — 検証用アセット

## hendy.vrm（ヘンディ先輩・ユーザー制作）

- 出典: ユーザー（tomy1031）が VRoid Studio で制作した `~/Documents/Teacher1.vrm`。
- VRM 1.0 / メタデータ: name `Teacher1` / author `Tommy` / 10.3MB
- 口パクに必要な表情プリセット（`aa` `ih` `ou` `ee` `oh`）と `blink` を保持。

### ⚠ ライセンスメタデータの確認事項

エクスポート時の設定が以下になっている。教材アプリで配信するなら見直しが必要:

| 項目                  | 現在値              | 懸念                                      |
| --------------------- | ------------------- | ----------------------------------------- |
| `commercialUsage`     | `personalNonProfit` | 商用・法人研修で使うなら不整合            |
| `allowRedistribution` | `false`             | Webアプリでの配信は実質的に再配布にあたる |
| `modification`        | `prohibited`        | 表情・衣装の派生を作れない                |
| `avatarPermission`    | `onlyAuthor`        | 作者のみ利用可                            |

自作モデルなので、作者（ユーザー）が VRoid Studio で再エクスポートすれば変更できる。

## 音声（Gemini Live / 声は Puck）

| ディレクトリ                        | 台本                                     | 用途                              |
| ----------------------------------- | ---------------------------------------- | --------------------------------- |
| `m1_asakai/line01〜05.wav`          | `content/scenes/m1_asakai.json`          | 朝会の報連相シーン                |
| `onboarding_welcome/line01〜08.wav` | `content/scenes/onboarding_welcome.json` | リスニング題材（/labs/listening） |

いずれも `gemini-3.1-flash-live-preview` / 声 **Puck**（ユーザー選定）で生成済み。
台本を直したら該当行だけ作り直す:

```bash
# manifest は台本から生成する（key=line01…, text=セリフから分かち書きの空白を除いたもの, voice=characters.hendy.voice）
GEMINI_API_KEY=... node ~/.claude/skills/generating-gemini-live-audio/scripts/gen_audio.mjs \
  --manifest ./manifest.json --out public/labs/vrm/<dir> --only line03 --force
```
