import type { ErpPriceRequest } from "@/lib/eci-erp/types";
import { executeErpQuote, publicQuote } from "@/lib/eci-erp/pricing";
import { getRequesterOrganization, toErrorMessage } from "@/features/requester/server-utils";
import { verifyPreparedErpEstimate } from "@/features/requester/actions/erp-request-receipt";
import { signQuoteEstimateFromPayloadHash } from "@/features/requester/actions/quote-receipt";
import { digestReceiptValue } from "@/features/requester/actions/quote-receipt-core";

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
    const { organization, userId } = await getRequesterOrganization();
    if (!organization) {
      return Response.json(
        { success: false, error: "Your account is not linked to a customer organization." },
        { status: 403 },
      );
    }
    const claims = verifyPreparedErpEstimate({
      receipt: preparedReceipt,
      request: erpRequest,
      userId,
      organizationId: organization.id,
    });
    const erpStartedAt = performance.now();
    const result = await executeErpQuote({
      request: erpRequest,
      currency: claims.currency,
      customerName: claims.customerName,
      translationRequired: claims.translationRequired,
      validUntil: claims.validUntil,
    });
    const erpDuration = performance.now() - erpStartedAt;
    const estimate = signQuoteEstimateFromPayloadHash({
      userId,
      organizationId: organization.id,
      payloadHash: claims.payloadHash,
      quote: publicQuote(result),
    });
    console.info(JSON.stringify({
      event: "erp_quote_proxy",
      categoryId: erpRequest.categoryId,
      requestHash: digestReceiptValue(erpRequest),
      erpMs: Number(erpDuration.toFixed(1)),
      totalMs: Number((performance.now() - startedAt).toFixed(1)),
    }));
    return Response.json(
      { success: true, data: estimate },
      { headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": serverTiming(erpDuration, performance.now() - startedAt),
      } },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: toErrorMessage(error) },
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
