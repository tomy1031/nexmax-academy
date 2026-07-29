# labs/vrm — 検証用アセット

## Seed-san.vrm（仮モデル）

- 出典: [vrm-c/vrm-specification samples](https://github.com/vrm-c/vrm-specification/tree/master/samples/Seed-san)
- モデル制作: VirtualCast, Inc.
- ライセンス: [VRM Public License 1.0](https://vrm.dev/licenses/1.0/)
- 用途: シーンプレイヤー（/labs/vrm-pilot）の技術検証のみ。
  **ヘンディ先輩のVRoidモデル完成後に差し替えること。**

## m1_asakai/line01〜05.wav（仮音声）

- macOS 内蔵TTS（`say -v Eddy`）で生成した**仮置き**。
- 本番は Gemini Live の **Puck**（ユーザー選定済み）で差し替える。
  `.env.local` の `GEMINI_API_KEY` に値が入り次第、下記で置き換わる:

```bash
GEMINI_API_KEY=... node ~/.claude/skills/generating-gemini-live-audio/scripts/gen_audio.mjs --manifest ./manifest.json --out public/labs/vrm/m1_asakai --force
```

manifest は `content/scenes/m1_asakai.json` から生成する（key=line01…, text=セリフから分かち書きの空白を除いたもの, voice=characters.hendy.voice）。
