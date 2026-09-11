import assert from "node:assert/strict";
import test from "node:test";

import {
  adjustedWordCount,
  revisionRows,
  revisionTotals,
  updateRevisionTranslationFee,
} from "./quote-revision-model.ts";

const quote = {
  pricing_snapshot: {
    response: [{
      countryId: 1001,
      countryName: "Europe",
      officialFee: 63.78,
      serviceFee: 1.16,
      translationFee: 250.6,
      translationFeeDetails: [
        { languageId: 15, languageName: "French (France)", amount: 136.69 },
        { languageId: 17, languageName: "German (Germany)", amount: 113.91 },
      ],
    }],
    revision: {
      adjustedClaimWords: 476,
      adjustedDescriptionWords: 900,
    },
  },
};

test("uses adjusted claim words for an EP Granting revision", () => {
  assert.equal(adjustedWordCount(quote, 400, true), 476);
  assert.equal(adjustedWordCount(quote, 800, false), 900);
});

test("keeps EP Granting language rows editable and updates its totals", () => {
  const rows = revisionRows(quote);
  const updated = updateRevisionTranslationFee(rows, 1001, 15, "140");
  const totals = revisionTotals(updated, "0");

  assert.equal(updated[0].translationFeeDetails[0].amount, 140);
  assert.equal(updated[0].translationFee, 253.91);
  assert.equal(totals.officialFee + totals.serviceFee, 64.94);
  assert.equal(totals.translationFee, 253.91);
  assert.equal(totals.total, 318.85);
});

test("changes only the translation subtotal when a PM changes the discount", () => {
  const rows = revisionRows(quote);
  const totals = revisionTotals(rows, "10");

  assert.deepEqual(rows[0].translationFeeDetails.map((fee) => fee.amount), [136.69, 113.91]);
  assert.equal(totals.translationBeforeDiscount, 250.6);
  assert.equal(totals.translationFee, 225.54);
  assert.equal(totals.total, 290.48);
});

test("restores legacy discounted details before applying a new discount", () => {
  const rows = revisionRows({
    pricing_snapshot: {
      response: [{
        countryId: 1001,
        countryName: "Europe",
        officialFee: 63.78,
        serviceFee: 1.16,
        translationFee: 225.54,
        translationFeeDetails: [
          { languageId: 15, languageName: "French", amount: 123.02 },
          { languageId: 17, languageName: "German", amount: 102.52 },
        ],
      }],
      revision: {
        translationDiscountPercent: 10,
        translationFeeBeforeDiscount: 250.6,
      },
    },
  });

  assert.deepEqual(rows[0].translationFeeDetails.map((fee) => fee.amount), [136.69, 113.91]);
  assert.equal(revisionTotals(rows, "20").translationFee, 200.48);
});
