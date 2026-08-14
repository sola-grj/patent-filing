import { Suspense } from "react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import {
  getLandingPathForUser,
  getOptionalAuthenticatedUser,
} from "@/lib/auth/user-routing";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registration?: string }>;
}) {
  return (
    <Suspense fallback={<LoginPageShell />}>
      <LoginPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginPageContent({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registration?: string }>;
}) {
  const { next, registration } = await searchParams;
  const nextPath = safeNextPath(next);
  const user = await getOptionalAuthenticatedUser();

  if (user) {
    const landingPath = await getLandingPathForUser(user.userId, user.supabase);
    redirect(nextPath ?? landingPath);
  }

  return (
    <LoginPageShell
      nextPath={nextPath ?? "/"}
      notice={
        registration === "disabled"
          ? "Registration is invitation only."
          : undefined
      }
    />
  );
}

function LoginPageShell({
  nextPath = "/",
  notice,
}: {
  nextPath?: string;
  notice?: string;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm nextPath={nextPath} notice={notice} />
      </div>
    </div>
  );
}

function safeNextPath(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}
