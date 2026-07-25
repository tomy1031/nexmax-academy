import { WelcomeWizard } from "@/components/welcome-wizard";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function WelcomePage() {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  return <WelcomeWizard authReady={isSupabaseConfigured} loggedIn={Boolean(user)} />;
}
