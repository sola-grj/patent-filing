export type DeliveryStatus = string | null | undefined;

export type DeliveryProgressItem = {
  id: string;
  jurisdiction_code?: string | null;
  status?: DeliveryStatus;
  version_no?: number | null;
  created_at?: string | null;
};

const publishedStatuses = new Set(["submitted", "accepted"]);

export function isPublishedDeliverable(status: DeliveryStatus) {
  return Boolean(status && publishedStatuses.has(status));
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
    if (!deliverable.jurisdiction_code) {
      general.push(deliverable);
      continue;
    }
    if (!latestByJurisdiction.has(deliverable.jurisdiction_code)) {
      latestByJurisdiction.set(deliverable.jurisdiction_code, deliverable);
    }
  }

  return [...latestByJurisdiction.values(), ...general].sort(compareNewest);
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
