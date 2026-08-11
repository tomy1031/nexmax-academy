"use client";

import { clearNexmaxCache } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";

/** ログアウトして最初の画面（タイトル＝ログイン）へ戻す。 */
export async function signOut() {
  const supabase = createClient();
  try {
    if (supabase) await supabase.auth.signOut();
  } finally {
    clearNexmaxCache();
    window.location.replace("/");
  }
}
