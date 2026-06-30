import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import {
  getLandingPathForUser,
  getOptionalAuthenticatedUser,
} from "@/lib/auth/user-routing";

export default function Page() {
  return (
    <Suspense fallback={<LoginPageShell />}>
      <LoginPageContent />
    </Suspense>
  );
}

async function LoginPageContent() {
  const user = await getOptionalAuthenticatedUser();

  if (user) {
    const landingPath = await getLandingPathForUser(user.userId, user.supabase);
    redirect(landingPath);
  }

  return <LoginPageShell />;
}

function LoginPageShell() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
