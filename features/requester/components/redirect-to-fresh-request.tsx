"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { RequestLoadingOverlay } from "./request-loading-overlay";

export function RedirectToFreshRequest({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return <RequestLoadingOverlay message="Searching patent records..." />;
}
