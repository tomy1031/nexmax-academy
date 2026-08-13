import { NextResponse } from "next/server";
import { buildInfo } from "@/lib/env";

/**
 * デプロイ状態の可視化: ビルド時に焼き込んだコミットSHAを返す。
 * `npm run handoff` が本番/STG のこのエンドポイントを見て
 * 「本番 = main か」を機械的に答えるために使う（願い #5）。
 * リポジトリは public なので SHA の露出に問題はない。
 */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(buildInfo);
}
