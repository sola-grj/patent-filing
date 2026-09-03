import assert from "node:assert/strict";
import test from "node:test";

import { toPmNotificationItem } from "./notifications.ts";

const base = {
  id: "notification-1",
  read_at: null,
  created_at: "2026-09-03T10:00:00.000Z",
};

test("PM notification presentation uses only safe PM request links", () => {
  const item = toPmNotificationItem({
    ...base,
    type: "pm_quote_confirmed",
    payload: {
      requestId: "b26e0931-1c20-4e22-9ea0-53ec62cd5aa4",
      requestNo: "REQ-001",
      matter: "EP1234567",
      customerName: "Acme",
      quoteVersion: 2,
      href: "/requester/messages",
    },
  });

  assert.deepEqual(item && {
    title: item.title,
    detail: item.detail,
    meta: item.meta,
    href: item.href,
  }, {
    title: "Quotation confirmed",
    detail: "Acme · EP1234567",
    meta: "Quotation v2",
    href: "/pm/b26e0931-1c20-4e22-9ea0-53ec62cd5aa4",
  });
});

test("PM signed-document notification reports returned file count", () => {
  const item = toPmNotificationItem({
    ...base,
    type: "pm_signed_documents_received",
    payload: { requestNo: "REQ-002", matter: "EP7654321", fileCount: 2, href: "/pm/5c983a1c-5fd2-4f51-becf-c4475408a7dc#signature-documents" },
  });

  assert.equal(item?.title, "Signed documents received");
  assert.equal(item?.meta, "2 files");
  assert.equal(item?.href, "/pm/5c983a1c-5fd2-4f51-becf-c4475408a7dc#signature-documents");
});
