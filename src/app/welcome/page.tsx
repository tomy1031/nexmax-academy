import { redirect } from "next/navigation";
import { WelcomeWizard } from "@/components/welcome-wizard";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function WelcomePage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) redirect("/map");
  }

  return (
    <WelcomeWizard
      authReady={isSupabaseConfigured}
      loggedIn={Boolean(user)}
      email={user?.email ?? null}
    />
  );
}
