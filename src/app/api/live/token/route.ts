import { NextResponse } from "next/server";
import { DEFAULT_LIVE_TALK_MODEL, isModelName } from "@/lib/ai/models";
import { createEphemeralToken, LiveTokenError } from "@/lib/live/token";

/**
 * Live（たいわ・音声づくり）の短命トークンを発行する。
 *
 * キーは本人のもの（BYOK）。はじめの設定ウィザードで登録され、
 * その端末に保存されている。ここでは本人のキーを受け取って
 * 30分だけ有効なトークンに交換し、**トークンだけ**を返す。
 *
 * こうする理由（AGENTS.md 規律4 / 設計03 §2）:
 *  - アプリのコードに共有のAPIキーを置かない
 *  - 長く使えるキーを Live の接続先に直接投げない（漏れたときの被害を30分に閉じる）
 *  - サーバは音声を中継しないので、実行環境を移しても長時間接続を抱えない
 *
 * ## モデルは呼ぶ側が決める（重要）
 * トークンは `liveConnectConstraints` で**1つのモデルに縛られる**。ここで
 * モデルを決め打ちすると、別のモデルでつなぐ機能は必ず弾かれる。実際そうなっていて、
 * リスニングの音声づくりは一度も動いていなかった——トークンはたいわ用モデルで発行し、
 * 接続はTTS用モデルで張っていたためである。
 */

function fail(reason: string, status: number, model: string): NextResponse {
  return NextResponse.json({ ready: false, reason, model }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let apiKey = "";
  let model: string = DEFAULT_LIVE_TALK_MODEL;
  try {
    const body = (await request.json()) as { apiKey?: unknown; model?: unknown };
    if (typeof body.apiKey === "string") apiKey = body.apiKey.trim();
    // 一覧に無い名前も通す。モデルは増えるので、こちらの一覧が古いことを理由に
    // 新しいモデルを使えなくしない（形だけ見る — isModelName）。
    if (isModelName(body.model)) model = body.model;
  } catch {
    // 本文なし。未設定として扱う
  }

  // キーが無い＝まだ設定していない。画面は「じゅんびちゅう」に落ちる
  if (!apiKey) return fail("noKey", 503, model);

  try {
    const token = await createEphemeralToken({ apiKey, model });
    return NextResponse.json({ ready: true, model, ...token });
  } catch (e) {
    const status = e instanceof LiveTokenError ? e.status : 502;
    // 失敗の中身（キーを含みうる応答本文）は返さないが、**理由の名前は返す**。
    // 「upstream」しか返さないと、キーを入れた先生には「だめだった」としか見えず、
    // キーが違うのか・モデルが無いのか・使いすぎなのかを確かめる手が無くなる。
    const reason = e instanceof LiveTokenError ? e.reason : "upstream";
    return fail(reason, status, model);
  }
}
