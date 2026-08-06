#!/usr/bin/env python3
"""共有ファイルの単独スレッド編集を止める PreToolUse フック（Write|Edit 用）。

複数セッション並行開発で「ついで変更」が別スレッドの成果を壊す事故が続いたため、
共有パスへの編集はユーザーの明示許可を必須にする（AGENTS.md 多スレッド運用ルール）。
機械的な検問であり、承認済みの変更を禁じるものではない。

承認を得た変更を通すとき（作業が終わったらマーカーを消す）:
    touch .claude/allow-shared
"""
import json
import os
import sys

PROTECTED = [
    "AGENTS.md",
    "CLAUDE.md",
    "docs/design/",
    "src/content/schema.ts",
    "src/app/globals.css",
    "public/img/characters/",
    "package.json",
    ".github/",
    ".claude/settings.json",
]

project = os.environ.get("CLAUDE_PROJECT_DIR", ".")
if os.path.exists(os.path.join(project, ".claude", "allow-shared")):
    sys.exit(0)

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

path = (data.get("tool_input") or {}).get("file_path") or ""
for pat in PROTECTED:
    if pat in path:
        sys.stderr.write(
            f"🛑 保護パス: {path}\n"
            f"共有ファイル（{pat}）はスレッド単独で変更しない決まりです"
            "（AGENTS.md 多スレッド運用ルール）。\n"
            "ユーザーに変更内容を1行で伝えて承認を得るか、専用タスクとして台帳に積んでください。\n"
            "承認済みなら `touch .claude/allow-shared` で解除し、作業後に消してください。"
        )
        sys.exit(2)
sys.exit(0)
