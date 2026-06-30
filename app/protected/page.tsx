import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  getLandingPathForUser,
  requireAuthenticatedUser,
} from "@/lib/auth/user-routing";

export default function ProtectedPage() {
  return (
    <Suspense fallback={null}>
      <ProtectedRedirect />
    </Suspense>
  );
}

async function ProtectedRedirect() {
  const user = await requireAuthenticatedUser();
  const landingPath = await getLandingPathForUser(user.userId, user.supabase);

  redirect(landingPath);

  return null;
}
