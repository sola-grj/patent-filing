"use client";

import { preparePmQuotation } from "./actions";
import type { ErpActionResult, ErpQuotePreview } from "@/lib/eci-erp/types";

export async function requestPmQuotation(
  formData: FormData,
): Promise<ErpActionResult<ErpQuotePreview>> {
  const prepared = await preparePmQuotation(formData);
  if (!prepared.success) return prepared;

  const response = await fetch("/api/pm/erp/quote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pat-ERP-Request-Receipt": prepared.data.receipt,
    },
    body: JSON.stringify(prepared.data.request),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as ErpActionResult<ErpQuotePreview> | null;
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
