import { NewRequestWizard } from "./new-request-wizard";

export async function FreshRequestWizard({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string }>;
}) {
  const params = await searchParams;
  const fresh = params.fresh;
  const wizardKey = fresh ? `fresh-${fresh}` : "default";

  return <NewRequestWizard key={wizardKey} />;
}
