"use server";

import { type ActionResult } from "@/lib/validators/requester";
import { getRequesterRequests } from "@/features/requester/queries";
import { buildFreshRequestHref } from "@/features/requester/requester-routes";
import { toErrorMessage } from "../server-utils";

export async function resolveDashboardSearchDestination(
  query: string,
): Promise<ActionResult<{ href: string }>> {
  try {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error("Enter a patent or Request number to search.");

    const result = await getRequesterRequests({ q: normalizedQuery, page: 1, scope: "mine" });
    if (!result.organization) {
      throw new Error("Create a requester workspace from the dashboard first.");
    }

    return {
      success: true,
      data: {
        href: result.totalCount > 0
          ? `/requester/requests/${result.requests[0].id}`
          : buildFreshRequestHref(Date.now(), normalizedQuery, "configure"),
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
