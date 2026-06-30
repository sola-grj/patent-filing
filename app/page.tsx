import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getLandingPathForUser,
  getOptionalAuthenticatedUser,
} from "@/lib/auth/user-routing";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeRedirect />
    </Suspense>
  );
}

async function HomeRedirect() {
  const user = await getOptionalAuthenticatedUser();

  if (!user) {
    redirect("/auth/login");
  }

  const landingPath = await getLandingPathForUser(user.userId, user.supabase);
  redirect(landingPath);

  return null;
}
