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
  // Gemini は単一の共有サーバーキーを持たない（BYOK方式）。
  // 生徒・教師が各自登録したAPIキーをDBから読み、サーバプロキシが本人のキーとしてのみ使用する
  // （docs/design/03_リニューアル設計方針.md §2）。ここには環境変数として置かない。
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

/**
 * Supabase の公開設定がそろっているか。
 * 未設定でもアプリは起動し、ログインは「準備中（デモモード）」として振る舞う。
 */
export const isSupabaseConfigured = Boolean(
  publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/**
 * ISR の 作りおきを 作り直す ときの 合言葉（Next の previewModeId）。
 *
 * OpenNext が 実行時に `NEXT_PREVIEW_MODE_ID` へ 入れる（アダプタの config が
 * prerender-manifest から 読む）。**秘密鍵では なく、内部リクエストの 見分け**に
 * 使う。門番（`src/middleware.ts`）が 作り直しの HEAD を ログイン画面へ
 * 返さない ように するため——弾くと ページが 永久に 古いまま になる。
 *
 * 読めない 環境も ある（束ね方に よっては 中まで 届かない）ので、
 * **null を 返せる**ようにして ある。呼ぶ側は 無い ときの 道を 用意する。
 */
export function getIsrRevalidateToken(): string | null {
  const value = process.env.NEXT_PREVIEW_MODE_ID;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Supabase クライアント生成に使う公開設定（未設定なら null）。 */
export function getSupabasePublicConfig(): { url: string; anonKey: string } | null {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }
  return {
    url: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/**
 * ビルド時に next.config.ts が焼き込むビルド情報（/api/version が返す）。
 * 秘密ではない（public リポジトリのコミットSHAとビルド時刻）。
 */
export const buildInfo = {
  sha: process.env.BUILD_GIT_SHA || null,
  builtAt: process.env.BUILD_TIME || null,
};
