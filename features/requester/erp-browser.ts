import type { WizardPayload } from "./wizard-types";
import { prepareErpEstimate } from "./actions/erp";
import type { ErpActionResult, SignedQuoteEstimate } from "@/lib/eci-erp/types";

export async function requestErpEstimate(
  payload: WizardPayload,
): Promise<ErpActionResult<SignedQuoteEstimate>> {
  const prepared = await prepareErpEstimate(payload);
  if (!prepared.success) return prepared;

  const response = await fetch("/api/requester/erp/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pat-ERP-Request-Receipt": prepared.data.receipt,
    },
    body: JSON.stringify(prepared.data.request),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as
    | ErpActionResult<SignedQuoteEstimate>
    | null;
  if (!response.ok || !result) {
    return {
      success: false,
      error: result && !result.success
        ? result.error
        : `The pricing service request failed (${response.status}).`,
    };
  }
  return result;
}
