import { NewRequestWizard } from "./new-request-wizard";
import { getRequesterDictionaries } from "../queries";

export async function FreshRequestWizard({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string }>;
}) {
  const params = await searchParams;
  const fresh = params.fresh;
  const wizardKey = fresh ? `fresh-${fresh}` : "default";
  const dictionaries = await getRequesterDictionaries();

  return <NewRequestWizard key={wizardKey} dictionaries={dictionaries} />;
}
