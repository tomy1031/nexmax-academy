import { NextResponse } from "next/server";
import { createEphemeralToken, LiveTokenError } from "@/lib/live/token";

/**
 * Live対話の短命トークンを発行する。
 *
 * キーは学習者本人のもの（BYOK）。はじめの設定ウィザードで登録され、
 * その端末に保存されている。ここでは本人のキーを受け取って
 * 30分だけ有効なトークンに交換し、**トークンだけ**を返す。
 *
 * こうする理由（AGENTS.md 規律4 / 設計03 §2）:
 *  - アプリのコードに共有のAPIキーを置かない
 *  - 長く使えるキーを Live の接続先に直接投げない（漏れたときの被害を30分に閉じる）
 *  - サーバは音声を中継しないので、実行環境を移しても長時間接続を抱えない
 */

/** 使うモデル。トークンはこのモデルにだけ有効になる。 */
const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

export async function POST(request: Request): Promise<NextResponse> {
  let apiKey = "";
  try {
    const body = (await request.json()) as { apiKey?: unknown };
    if (typeof body.apiKey === "string") apiKey = body.apiKey.trim();
  } catch {
    // 本文なし。未設定として扱う
  }

  // キーが無い＝まだ設定していない。画面は「じゅんびちゅう」に落ちる
  if (!apiKey) {
    return NextResponse.json({ ready: false, reason: "noKey" }, { status: 503 });
  }

  try {
    const token = await createEphemeralToken({ apiKey, model: LIVE_MODEL });
    return NextResponse.json({ ready: true, model: LIVE_MODEL, ...token });
  } catch (e) {
    const status = e instanceof LiveTokenError ? e.status : 502;
    // 失敗の中身（キーを含みうる応答本文）はクライアントに返さない
    return NextResponse.json({ ready: false, reason: "upstream" }, { status });
  }
}
