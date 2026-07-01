import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    redirect("/auth/error?error=Missing auth code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    process.env.NODE_ENV === "development"
      ? requestUrl.origin
      : forwardedHost
        ? `https://${forwardedHost}`
        : requestUrl.origin;

  redirect(`${origin}${next}`);
}
