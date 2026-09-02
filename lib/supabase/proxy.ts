import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const ERP_CUSTOMER_SYNC_PATH = "/api/cron/sync-erp-clients";
const REQUESTER_NOTIFICATION_SYNC_PATH = "/api/cron/reconcile-requester-notifications";

export async function updateSession(request: NextRequest) {
  const startedAt = performance.now();
  let supabaseResponse = NextResponse.next({
    request,
  });

  // This server-to-server route authenticates with CRON_SECRET in its own
  // handler. Requiring a Portal session here would redirect Vercel Cron to the
  // login page before the Bearer secret can be checked.
  if (
    request.nextUrl.pathname === ERP_CUSTOMER_SYNC_PATH
    || request.nextUrl.pathname === REQUESTER_NOTIFICATION_SYNC_PATH
  ) {
    return withProxyTiming(supabaseResponse, startedAt);
  }

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return withProxyTiming(supabaseResponse, startedAt);
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return withProxyTiming(NextResponse.redirect(url), startedAt);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return withProxyTiming(supabaseResponse, startedAt);
}

function withProxyTiming(response: NextResponse, startedAt: number) {
  const duration = Math.round((performance.now() - startedAt) * 100) / 100;
  response.headers.set("Server-Timing", `proxy;dur=${duration}`);
  return response;
}
