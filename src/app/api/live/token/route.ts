import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEphemeralToken, LiveTokenError } from "@/lib/live/token";

/**
 * Live対話の短命トークンを発行する。
 *
 * ここが「APIキーがサーバから出ない」唯一の境界。ブラウザは本人のキーを
 * 一度も受け取らず、30分だけ有効なトークンで Live につなぐ。
 *
 * キーの保管はフェーズ1のDB作業（設計03 §3.2 のテーブル群）。
 * まだ用意できていない環境では 503 を返し、画面は「じゅんびちゅう」に落ちる。
 */

/** 使うモデル。トークンはこのモデルにだけ有効になる。 */
const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

type NotReady = { ready: false; reason: "auth" | "notConfigured" | "noKey" };

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return notReady("notConfigured");
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return notReady("auth");

  // 本人が設定画面から登録したキーを読む。RLSで本人の行しか見えない前提。
  const { data: row, error } = await supabase
    .from("user_api_keys")
    .select("gemini_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  // テーブル未作成・未登録のどちらも「まだ使えない」として同じ扱いにする
  const apiKey = typeof row?.gemini_api_key === "string" ? row.gemini_api_key : null;
  if (error || !apiKey) return notReady("noKey");

  try {
    const token = await createEphemeralToken({ apiKey, model: LIVE_MODEL });
    return NextResponse.json({ ready: true, model: LIVE_MODEL, ...token });
  } catch (e) {
    const status = e instanceof LiveTokenError ? e.status : 502;
    // 失敗の中身（キーを含みうる応答本文）はクライアントに返さない
    return NextResponse.json({ ready: false, reason: "upstream" }, { status });
  }
}

function notReady(reason: NotReady["reason"]): NextResponse {
  return NextResponse.json({ ready: false, reason } satisfies NotReady, { status: 503 });
}
