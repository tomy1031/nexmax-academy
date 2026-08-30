#!/usr/bin/env python3
"""スキットの セリフを 1行ずつ 音に する（当て音声）

## これは 何か
`content/skits/*.json` の 各行を 読み上げて、教材が 指して いる 置き場
（`public/audio/skits/<教材ID>/lNN.mp3`）へ 置く。置き場は 教材データ側で
決まって いる（`scripts/gen_hourensou_content.mjs` の `withSkitAudio`）ので、
この スクリプトは **ファイルを 作るだけ**で、JSON は 書き換えない。

## これは「当て音声」である
声は 1種類しか 出せない ので、役に よる 声の 違いが 無い。教材の 声の 正は
人物カード（`content/characters/<id>.json` の `voice`）で、本番の 音は
Live TTS（`scripts/make_meeting_audio.ts` と 同じ 道）で 作り直す。
絵を いったん 旧アプリの ものに した のと 同じ 立場——**先に 形を 通し、
中身は あとで 差し替える**。

差し替えても **置き場は 変わらない**ので、教材データは 触らなくてよい。

## 音が 無くても スキットは 動く
画面（`src/components/skit/skit-view.tsx`）は `audioUrl` が 取れなければ
ブラウザの 読み上げに 落ちる。だから この スクリプトを 走らせ忘れても
スピーカーの ボタンは 押せる。

使い方:
    pip install gtts
    python3 scripts/make_skit_audio.py [--force]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIT_DIR = ROOT / "content" / "skits"

FORCE = "--force" in sys.argv


def main() -> int:
    try:
        from gtts import gTTS
    except ImportError:
        print("gtts が ありません: pip install gtts", file=sys.stderr)
        return 1

    made = skipped = 0
    for path in sorted(SKIT_DIR.glob("*.json")):
        skit = json.loads(path.read_text(encoding="utf-8"))
        for line in skit["lines"]:
            url = line.get("audioUrl")
            if not url:
                continue
            out = ROOT / "public" / url.lstrip("/")
            out.parent.mkdir(parents=True, exist_ok=True)
            if out.exists() and not FORCE:
                skipped += 1
                continue
            # 分かち書きの 空白は **読みの ためでは なく 読みやすさの ため**なので、
            # 読み上げる ときは 外す（空白ごとに 切ると 不自然に 途切れる）。
            gTTS(line["text"].replace(" ", "").replace("　", ""), lang="ja").save(str(out))
            made += 1
            print(f"{url}  {out.stat().st_size // 1024}KB")

    print(f"\n作った: {made} / すでに あった: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
