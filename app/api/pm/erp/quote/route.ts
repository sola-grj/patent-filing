import type { ErpPriceRequest } from "@/lib/eci-erp/types";
import { executeErpQuote, publicQuote } from "@/lib/eci-erp/pricing";
import { digestReceiptValue } from "@/features/requester/actions/quote-receipt-core";
import { verifyPreparedPmErpQuote } from "@/features/pm/erp-quote-receipt";
import { requirePmContext, toPmErrorMessage } from "@/features/pm/server-utils";

export async function POST(request: Request) {
  const startedAt = performance.now();
  try {
    const preparedReceipt = request.headers.get("x-pat-erp-request-receipt")?.trim();
    if (!preparedReceipt) {
      return Response.json(
        { success: false, error: "The prepared pricing request receipt is missing." },
        { status: 400 },
      );
    }
    const erpRequest = await request.json() as ErpPriceRequest;
    const context = await requirePmContext();
    if (context.denied || !context.organization) {
      return Response.json(
        { success: false, error: "You do not have permission to access the PM workspace." },
        { status: 403 },
      );
    }
    const claims = verifyPreparedPmErpQuote({
      receipt: preparedReceipt,
      request: erpRequest,
      userId: context.userId,
      supplierOrganizationId: context.organization.id,
    });
    const { data: trackedRequest, error: requestError } = await context.supabase
      .from("translation_requests")
      .select("id")
      .eq("id", claims.requestId)
      .eq("supplier_organization_id", context.organization.id)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!trackedRequest) throw new Error("This Request is no longer available in the PM workspace.");

    const erpStartedAt = performance.now();
    const quote = await executeErpQuote({
      request: erpRequest,
      currency: claims.currency,
      customerName: claims.customerName,
      translationRequired: claims.translationRequired,
    });
    const erpDuration = performance.now() - erpStartedAt;
    console.info(JSON.stringify({
      event: "pm_erp_quote_proxy",
      requestId: claims.requestId,
      categoryId: erpRequest.categoryId,
      requestHash: digestReceiptValue(erpRequest),
      erpMs: Number(erpDuration.toFixed(1)),
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
    }));
    return Response.json(
      { success: true, data: publicQuote(quote) },
      { headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": serverTiming(erpDuration, performance.now() - startedAt),
      } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: toPmErrorMessage(error) },
      { status: 400, headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `total;dur=${(performance.now() - startedAt).toFixed(1)}`,
      } },
    );
  }
}

function serverTiming(erpDuration: number, totalDuration: number) {
  return [
    `erp;dur=${erpDuration.toFixed(1)}`,
    `total;dur=${totalDuration.toFixed(1)}`,
  ].join(", ");
}
