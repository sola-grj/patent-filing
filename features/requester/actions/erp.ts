"use server";

import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";
import {
  availableErpCountries,
  publicQuote,
  quoteForOrganization,
} from "@/lib/eci-erp/pricing";
import type { ErpActionResult, ErpCountry, ErpQuotePreview } from "@/lib/eci-erp/types";

import { getRequesterOrganization, toErrorMessage } from "../server-utils";

export async function loadErpCountriesForWizard(
  config: Pick<WizardConfig, "channelCode" | "serviceTypes" | "epvType" | "epServiceType">,
): Promise<ErpActionResult<ErpCountry[]>> {
  await getRequesterOrganization();
  return availableErpCountries(config);
}

export async function generateErpEstimate(
  payload: WizardPayload,
): Promise<ErpActionResult<ErpQuotePreview>> {
  try {
    const { organization, userId } = await getRequesterOrganization();
    if (!organization) throw new Error("Your account is not linked to a customer organization.");
    const result = await quoteForOrganization(payload, organization.id, userId);
    return { success: true, data: publicQuote(result) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
