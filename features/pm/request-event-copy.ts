type RequestEventPayload = Record<string, unknown> | null | undefined;

const workflowStageLabels: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  file_selection: "File Selection",
  parsing: "Parsing",
  configured: "Configured",
  quoted: "Quoted",
  negotiation: "Negotiation",
  order_pending: "Order Pending",
  production: "Production",
  completed: "Completed",
  closed: "Closed",
};

type RequestEventTitleContext = {
  payload?: RequestEventPayload;
};

const requestEventTitles: Record<
  string,
  string | ((context: RequestEventTitleContext) => string)
> = {
  "request.created": "Requester created a draft request",
  "request.draft.saved": "Requester saved the draft request",
  "request.submitted.from_wizard": "Requester submitted the request",
  "patent.search.mocked": "Patent source files were prepared",
  "files.parse.mocked": "Files were sent for parsing",
  "request.configured": "Translation requirements were configured",
  "quote.generated.pm": "PM generated a quote",
  "quote.accepted.requester_preview": "Preview quote was created and accepted",
  "quote.accepted": "Requester accepted the quote",
  "quote.negotiation.started": "Requester started a negotiation",
  "quote.negotiation.started.pm": "PM started a negotiation",
  "quote.negotiation.responded.pm": ({ payload }) =>
    payload?.decision === "accept"
      ? "PM accepted the negotiation"
      : "PM responded with a counteroffer",
  "quote.negotiation.accepted.requester": "Requester accepted the PM negotiation quote",
  "quote.rejected": "Requester rejected the quote",
  "request.closed.pm": "PM closed the request",
  "order.confirmed.pm": "PM confirmed the order",
  "order.started.pm": "PM started production",
  "deliverables.submitted.pm": "PM submitted the final deliverables",
};

export function formatRequestEventTitle(
  eventType: string,
  payload?: RequestEventPayload,
) {
  const entry = requestEventTitles[eventType];

  if (!entry) {
    return humanizeFallback(eventType);
  }

  return typeof entry === "function" ? entry({ payload }) : entry;
}

export function formatRequestEventTransition(
  fromStatus?: string | null,
  toStatus?: string | null,
) {
  const fromLabel = fromStatus ? workflowStageLabels[fromStatus] ?? humanizeFallback(fromStatus) : null;
  const toLabel = toStatus ? workflowStageLabels[toStatus] ?? humanizeFallback(toStatus) : null;

  if (fromLabel && toLabel) {
    if (fromLabel === toLabel) {
      return `Stage remains ${toLabel}`;
    }

    return `Stage changed from ${fromLabel} to ${toLabel}`;
  }

  if (toLabel) {
    return `Stage changed to ${toLabel}`;
  }

  if (fromLabel) {
    return `Stage changed from ${fromLabel}`;
  }

  return "Stage not recorded";
}

function humanizeFallback(value: string) {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
