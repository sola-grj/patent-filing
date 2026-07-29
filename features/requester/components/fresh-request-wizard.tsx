import { NewRequestWizard } from "./new-request-wizard";
import { getRequesterDictionaries } from "../queries";

export async function FreshRequestWizard({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; q?: string }>;
}) {
  const params = await searchParams;
  const fresh = params.fresh;
  const wizardKey = fresh ? `fresh-${fresh}` : "default";
  const dictionaries = await getRequesterDictionaries();
  const patentQuery = params.q?.trim();

  return (
    <NewRequestWizard
      key={wizardKey}
      dictionaries={dictionaries}
      initialPayload={
        patentQuery
          ? {
              sourceMode: "patent_search",
              patentQuery,
              lastStep: "Source",
            }
          : undefined
      }
    />
  );
}
