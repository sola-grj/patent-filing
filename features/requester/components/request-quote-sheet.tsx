import { Pencil } from "lucide-react";
import { Table } from "@radix-ui/themes";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildEstimateRowsForConfig,
  hasTranslationPricingForServiceTypes,
} from "@/features/requester/components/new-request-quote-pricing";
import {
  channelOptions,
  entityTypeOptions,
  epvTypeOptions,
  filingApplicationTypeOptions,
  filingTypeOptions,
  jurisdictionOptions,
  serviceTypeOptions,
} from "@/features/requester/options";
import type { WizardConfig, WizardDictionaries } from "@/features/requester/wizard-types";

const estimateDictionaries: WizardDictionaries = {
  channels: channelOptions,
  serviceTypes: serviceTypeOptions,
  filingTypes: filingTypeOptions,
  applicationTypes: filingApplicationTypeOptions,
  entityTypes: entityTypeOptions,
  epvTypes: epvTypeOptions,
  jurisdictions: jurisdictionOptions,
};

export function RequestQuoteSheet({
  config,
  translationWordCount,
}: {
  config: WizardConfig;
  translationWordCount: number;
}) {
  const rows = buildEstimateRowsForConfig(
    config,
    estimateDictionaries,
    translationWordCount,
  );
  const includeTranslation = hasTranslationPricingForServiceTypes(config.serviceTypes);
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 border-b">
        <div>
          <CardTitle>Quotation</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Estimate submitted with the request · {formatCurrency(total)}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled
          aria-label="Edit quotation amounts"
          title="Quotation editing will be available later"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? (
          <div className="overflow-x-auto">
            <Table.Root
              size="2"
              variant="ghost"
              layout="fixed"
              className={includeTranslation
                ? "min-w-[780px] table-fixed text-xs [&_td]:!px-2 [&_th]:!px-2"
                : "min-w-[560px]"}
            >
              <Table.Header>
                <Table.Row className="hover:bg-transparent">
                  <Table.ColumnHeaderCell>Jurisdiction</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patent Language</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">Filing Fee</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell justify="end">Official Fee</Table.ColumnHeaderCell>
                  {includeTranslation ? (
                    <>
                      <Table.ColumnHeaderCell justify="center">
                        Translation Requirement
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        Translation Words
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">Unit Price</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end">
                        Translation Fee
                      </Table.ColumnHeaderCell>
                    </>
                  ) : null}
                  <Table.ColumnHeaderCell justify="end">Total</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row key={row.jurisdiction}>
                    <Table.RowHeaderCell className="font-medium">
                      {row.jurisdiction}
                    </Table.RowHeaderCell>
                    <Table.Cell>{row.sourceLanguage}</Table.Cell>
                    <Table.Cell justify="end">{formatCurrency(row.filingFee)}</Table.Cell>
                    <Table.Cell justify="end">{formatCurrency(row.officialFee)}</Table.Cell>
                    {includeTranslation ? (
                      <>
                        <Table.Cell justify="center">{row.translationRequirement}</Table.Cell>
                        <Table.Cell justify="center">
                          {row.translationWords.toLocaleString()}
                        </Table.Cell>
                        <Table.Cell justify="end">
                          {formatUnitPrice(row.translationUnitPrice)}
                        </Table.Cell>
                        <Table.Cell justify="end">
                          {formatCurrency(row.translationFee)}
                        </Table.Cell>
                      </>
                    ) : null}
                    <Table.Cell justify="end" className="font-semibold">
                      {formatCurrency(row.total)}
                    </Table.Cell>
                  </Table.Row>
                ))}
                <Table.Row className="bg-muted/20 [--table-row-box-shadow:none]">
                  <Table.Cell
                    colSpan={includeTranslation ? 8 : 4}
                    justify="end"
                    className="text-sm font-semibold"
                  >
                    Estimated Total
                  </Table.Cell>
                  <Table.Cell justify="end" className="text-base font-semibold">
                    {formatCurrency(total)}
                  </Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </div>
        ) : (
          <div className="px-6 py-10 text-sm text-muted-foreground">
            No estimate rows were saved for this request.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatUnitPrice(value: number) {
  return value ? `${formatCurrency(value)}/word` : "-";
}
