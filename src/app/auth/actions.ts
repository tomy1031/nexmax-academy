"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** ログアウトしてログインページへ戻す。 */
export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
