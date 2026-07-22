import { z } from "zod";

/**
 * 環境変数の型付きアクセサ（初期設定・v1）
 *
 * 方針:
 *  - process.env を各所で直接読まず、ここを唯一の入口にする（可読性・保守性）。
 *  - 検証は「アクセス時に遅延実行」する。未設定でもビルドは通り、実際に使う地点で落ちる。
 *  - サーバ専用の値（秘密鍵）は getServerEnv() 経由でのみ取得する。クライアントに import しない。
 *  - NEXT_PUBLIC_ の値は publicEnv でまとめる（ブラウザ露出を意図した公開値のみ）。
 */

const serverEnvSchema = z.object({
  // Gemini はサーバ側プロキシ（API Route）からのみ使用する。
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY が未設定です"),
  // フェーズ1で使用。導入までは optional にしておく。
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

/** サーバ専用。秘密鍵を含むため、クライアントコンポーネントから呼ばない。 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`サーバ環境変数の検証に失敗しました: ${missing}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** ブラウザに露出してよい公開値のみ。 */
export const publicEnv = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
