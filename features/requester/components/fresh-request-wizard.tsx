"use client";

import { useSearchParams } from "next/navigation";

import { NewRequestWizard } from "./new-request-wizard";

export function FreshRequestWizard() {
  const searchParams = useSearchParams();
  const fresh = searchParams.get("fresh");
  const wizardKey = fresh ? `fresh-${fresh}` : "default";

  return <NewRequestWizard key={wizardKey} />;
}
