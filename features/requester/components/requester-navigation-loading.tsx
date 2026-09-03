"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { RequestLoadingOverlay } from "./request-loading-overlay";

type RequesterNavigationLoadingContextValue = {
  startNavigationLoading: (message?: string) => void;
  stopNavigationLoading: () => void;
  navigate: (href: string) => void;
};

const RequesterNavigationLoadingContext = createContext<RequesterNavigationLoadingContextValue | null>(null);

export function RequesterNavigationLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/requester/requests/") && pathname !== "/requester/requests/new") {
      setMessage(null);
    }
  }, [pathname]);

  return (
    <RequesterNavigationLoadingContext.Provider
      value={{
        startNavigationLoading: (nextMessage = "Searching patent records...") => setMessage(nextMessage),
        stopNavigationLoading: () => setMessage(null),
        navigate: (href) => router.push(href),
      }}
    >
      {children}
      {message ? <RequestLoadingOverlay message={message} /> : null}
    </RequesterNavigationLoadingContext.Provider>
  );
}

export function useRequesterNavigationLoading() {
  const context = useContext(RequesterNavigationLoadingContext);
  if (!context) {
    throw new Error("useRequesterNavigationLoading must be used within RequesterNavigationLoadingProvider.");
  }
  return context;
}
