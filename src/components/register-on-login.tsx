"use client";

import { useEffect } from "react";
import { hasAuthCookieInBrowser, takeRegisterFlag } from "@/lib/auth-cookie";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * ログインしたら、まだ登録されていない人を登録する（2026-08-25 の指定）。
 *
 * 画面は出さない。全ページの土台（`layout.tsx`）に置くのは、ログインの戻り先が
 * `/welcome` とは限らないためである（ミドルウェアが弾いた行き先へ戻る）。
 *
 * **重さについて。** ここが読み込むのは この小さなファイルだけで、登録の中身は
 * 走らせると決まってから `import()` で取りに行く。中身は20問の台帳（`content/personality`）を
 * 抱えていて大きく、全ページの荷物に混ぜると Worker の上限（デプロイ §罠5）に効くため。
 */

/** この画面のセッションで1度走ったか。タブを閉じるまで持つ。 */
const DONE_KEY = "nexmax.registerDone.v1";

function alreadyRan(): boolean {
  try {
    return window.sessionStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false; // プライベートモード等。1回多く走っても害はない（送るものが無ければ何もしない）
  }
}

function markRan(): void {
  try {
    window.sessionStorage.setItem(DONE_KEY, "1");
  } catch {
    /* 同上 */
  }
}

export function RegisterOnLogin() {
  useEffect(() => {
    // 鍵ゼロのデモモード（Supabase 未設定）には登録先そのものが無い。
    // ここで止めれば、中身のファイルを取りに行くことすらしない。
    if (!isSupabaseConfigured) return;
    // ログインしていない人（タイトル画面をはじめて開いた人）にも同じ。
    // クッキーが無ければ未ログインは確実なので、往復ゼロで決めてよい（願い #17）。
    if (!hasAuthCookieInBrowser()) return;

    /*
     * 走らせるのは次の2つ。
     *   1. ログインの直後（`/auth/callback` が置いた印がある）
     *   2. このタブでまだ1度も走っていないとき
     * 2 を足すのは、**すでにログインしている人**にも届かせるため——8/21 に
     * 答えが消えた人のセッションは生きたままなので、次のログインを待っていると
     * 端末の20問がいつまでも登録されない。
     * どちらの道でも、送るものが無ければ問い合わせ1回で終わる。
     */
    const justLoggedIn = takeRegisterFlag();
    if (!justLoggedIn && alreadyRan()) return;
    markRan();

    void import("@/lib/register-on-login")
      .then(({ registerOnLogin }) => registerOnLogin())
      .catch(() => {
        // 登録に失敗しても学習は続けられる。ここで画面に何かを出さない。
      });
  }, []);

  return null;
}
