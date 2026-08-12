import { NewRequestWizard } from "./new-request-wizard";
import { getRequesterDictionaries } from "../queries";
import { parseRequestPath } from "../requester-routes";

export async function FreshRequestWizard({
  searchParams,
}: {
  searchParams: Promise<{ fresh?: string; q?: string; path?: string }>;
}) {
  const params = await searchParams;
  const fresh = params.fresh;
  const wizardKey = fresh ? `fresh-${fresh}` : "default";
  const dictionaries = await getRequesterDictionaries();
  const patentQuery = params.q?.trim();
  const initialPath = parseRequestPath(params.path);

  return (
    <NewRequestWizard
      key={wizardKey}
      dictionaries={dictionaries}
      initialPath={initialPath}
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
