import type { createClient } from "@/lib/supabase/client";

/** ブラウザ用 Supabase クライアント（未設定のときの null は 呼ぶ側で さばく）。 */
type Client = NonNullable<ReturnType<typeof createClient>>;

/**
 * ログインしている 本人の id を **外へ 出ずに** 取り出す（2026-08-26）。
 *
 * ## なぜ `getUser()` を やめるか
 *
 * `auth.getUser()` は **呼ぶたびに Supabase の 認証サーバへ 1往復する**。
 * 学習者の 道には これが 何度も あった——マップを 開くだけで 2回
 *（`map-shell` 自身と、その 中で 呼ぶ `fetchOwnProfile`）。
 *
 * 効くのは 2つの 天井:
 *
 * 1. **Cloudflare** … サーバ側で 呼ぶと Worker の 仕事が 増える
 *    （#213 で ミドルウェアを 先に 直した）。
 * 2. **Supabase の IP ごとの 上限** … 教室は ふつう 1本の 回線＝**1つの IP**から 出る。
 *    認証の 呼び出しは IP ごとに 数えられるので、人数ぶん 同じ 枠を 削り合う
 *    （docs/deploy.md §0.10）。ブラウザへ 移すだけでは この 天井は 下がらない——
 *    **呼ぶ回数そのものを 減らす**必要が ある。
 *
 * `getClaims()` は プロジェクトが 非対称鍵（ES256）で 署名して いるとき、
 * 公開鍵（JWKS）で WebCrypto 検証を **その場で** 行う。公開鍵は auth-js が
 * 10分 ためるので、外へ 出るのは 10分に 1回 だけ。対称鍵の プロジェクトでは
 * 自動で `getUser()` へ 退避するので、鍵体系が 変わっても 壊れない。
 *
 * **安全さは 落ちない**——署名を 確かめて いるので、作り替えた 偽の トークンは
 * 通らない。そして そもそも、ここで 得た id で 何が 読めるかは **RLS が 決める**
 *（ブラウザが 名乗った id を DB が 信じる わけでは ない）。
 *
 * @returns 本人の id。ログインして いなければ null。
 */
export async function readOwnId(supabase: Client): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) throw error;
  return data?.claims.sub ?? null;
}

/** 本人の id。ログインして いなければ 投げる（書き込みの 前に 使う）。 */
export async function requireOwnId(supabase: Client): Promise<string> {
  const id = await readOwnId(supabase);
  if (!id) throw new Error("Authentication is required.");
  return id;
}

/** トークンの 中み（`sub`・`email`・`user_metadata` など）。型は 本家から 引き出す。 */
export type OwnClaims = NonNullable<
  Awaited<ReturnType<Client["auth"]["getClaims"]>>["data"]
>["claims"];

/**
 * 本人の トークンの 中みを 取り出す。
 *
 * `readOwnId` と 同じで **外へ 出ない**。Google に 登録された 名前は
 * `user_metadata` に 入って いるので、なまえの 下ごしらえも これで そろう。
 *
 * @returns ログインして いなければ null。
 */
export async function readOwnClaims(supabase: Client): Promise<OwnClaims | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error) throw error;
  return data?.claims ?? null;
}
