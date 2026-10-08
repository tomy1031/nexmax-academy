#!/usr/bin/env node
/**
 * AIチェックの 門番（src/lib/ai/claude-gate.ts）を、Supabase の 関数の 側へ 写す。
 *
 * Deno の 関数（supabase/functions/ai-check/）は `src/` を 読めない ので、写しを 置いて いる。
 * 2つが 同じ 中身かは tests/claude_gate.test.ts が 見張る。門番を 直したら これを 回す:
 *
 *   node scripts/sync_ai_check.mjs
 *
 * 関数を 出し直すのは docs/deploy.md §0.18。
 */
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../src/lib/ai/claude-gate.ts", import.meta.url));
const to = fileURLToPath(new URL("../supabase/functions/ai-check/claude-gate.ts", import.meta.url));
copyFileSync(from, to);
console.log("写しました: supabase/functions/ai-check/claude-gate.ts");
