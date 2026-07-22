import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginCard } from "./login-card";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard authReady={isSupabaseConfigured} />
    </Suspense>
  );
}
