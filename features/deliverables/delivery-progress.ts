export type DeliveryStatus = string | null | undefined;

export type DeliveryProgressItem = {
  id: string;
  ep_country_id?: number | null;
  jurisdiction_code?: string | null;
  status?: DeliveryStatus;
  version_no?: number | null;
  created_at?: string | null;
};

const publishedStatuses = new Set(["submitted", "accepted"]);

export function isPublishedDeliverable(status: DeliveryStatus) {
  return Boolean(status && publishedStatuses.has(status));
}

export function buildEpDeliverySubmissionPlan(
  configuredCountryIds: number[],
  deliverables: DeliveryProgressItem[],
) {
  const configured = normalizeCountryIds(configuredCountryIds);
  const configuredSet = new Set(configured);
  const draftDeliverables = deliverables.filter(
    (deliverable) => deliverable.status === "draft"
      && deliverable.ep_country_id
      && configuredSet.has(deliverable.ep_country_id),
  );
  const deliveredCountryIds = new Set(
    deliverables
      .filter((deliverable) => isPublishedDeliverable(deliverable.status))
      .map((deliverable) => deliverable.ep_country_id)
      .filter((id): id is number => Number.isInteger(id) && configuredSet.has(id as number)),
  );
  for (const deliverable of draftDeliverables) {
    deliveredCountryIds.add(deliverable.ep_country_id as number);
  }

  const missingCountryIds = configured.filter((id) => !deliveredCountryIds.has(id));
  return {
    draftDeliverableIds: draftDeliverables.map((deliverable) => deliverable.id),
    newlyDeliveredCountryIds: normalizeCountryIds(
      draftDeliverables.map((deliverable) => deliverable.ep_country_id as number),
    ),
    deliveredCountryIds: configured.filter((id) => deliveredCountryIds.has(id)),
    missingCountryIds,
    completesRequest: configured.length > 0 && missingCountryIds.length === 0,
  };
}

export function buildDeliverySubmissionPlan(
  configuredJurisdictions: string[],
  deliverables: DeliveryProgressItem[],
) {
  const configured = normalizeJurisdictions(configuredJurisdictions);
  const configuredSet = new Set(configured);
  const draftDeliverables = deliverables.filter(
    (deliverable) => deliverable.status === "draft"
      && deliverable.jurisdiction_code
      && configuredSet.has(deliverable.jurisdiction_code),
  );
  const deliveredJurisdictions = new Set(
    deliverables
      .filter((deliverable) => isPublishedDeliverable(deliverable.status))
      .map((deliverable) => deliverable.jurisdiction_code)
      .filter((code): code is string =>
        typeof code === "string" && configuredSet.has(code)),
  );

  for (const deliverable of draftDeliverables) {
    deliveredJurisdictions.add(deliverable.jurisdiction_code as string);
  }

  const deliveredJurisdictionCodes = configured.filter((code) =>
    deliveredJurisdictions.has(code));
  const missingJurisdictionCodes = configured.filter((code) =>
    !deliveredJurisdictions.has(code));

  return {
    draftDeliverableIds: draftDeliverables.map((deliverable) => deliverable.id),
    newlyDeliveredJurisdictionCodes: normalizeJurisdictions(
      draftDeliverables.map((deliverable) => deliverable.jurisdiction_code as string),
    ),
    deliveredJurisdictionCodes,
    missingJurisdictionCodes,
    completesRequest: configured.length > 0 && missingJurisdictionCodes.length === 0,
  };
}

export function latestPublishedDeliverables<T extends DeliveryProgressItem>(
  deliverables: T[],
) {
  const latestByJurisdiction = new Map<string, T>();
  const general: T[] = [];

  for (const deliverable of deliverables
    .filter((item) => isPublishedDeliverable(item.status))
    .sort(compareNewest)) {
    const destinationKey = deliverable.ep_country_id
      ? `ep:${deliverable.ep_country_id}`
      : deliverable.jurisdiction_code
        ? `legacy:${deliverable.jurisdiction_code}`
        : null;
    if (!destinationKey) {
      general.push(deliverable);
      continue;
    }
    if (!latestByJurisdiction.has(destinationKey)) {
      latestByJurisdiction.set(destinationKey, deliverable);
    }
  }

  return [...latestByJurisdiction.values(), ...general].sort(compareNewest);
}

function normalizeCountryIds(values: number[]) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function normalizeJurisdictions(values: string[]) {
  return [...new Set(
    values
      .map((value) => value.trim().toUpperCase())
      .filter((value) => /^[A-Z]{2}$/.test(value)),
  )];
}

function compareNewest(
  left: DeliveryProgressItem,
  right: DeliveryProgressItem,
) {
  const versionDifference = Number(right.version_no ?? 0)
    - Number(left.version_no ?? 0);
  if (versionDifference) return versionDifference;
  return new Date(right.created_at ?? 0).getTime()
    - new Date(left.created_at ?? 0).getTime();
}
