import type { PmQuoteRevisionRow } from "@/features/pm/actions";

type RevisionTotals = {
  baseFee: number;
  translationBeforeDiscount: number;
  translationFee: number;
  discount: number;
  total: number;
};

export function PmEpGrantingQuoteRevisionTable({
  currency,
  rows,
  totals,
  onBaseFeeChange,
  onTranslationFeeChange,
}: {
  currency: string;
  rows: PmQuoteRevisionRow[];
  totals: RevisionTotals;
  onBaseFeeChange: (
    countryId: number,
    key: "officialFee" | "serviceFee",
    value: string,
  ) => void;
  onTranslationFeeChange: (countryId: number, languageId: number, value: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left">
          <tr>
            <th className="p-3">Fee Category</th>
            <th className="p-3">Fee Item</th>
            <th className="p-3">Language / Scope</th>
            <th className="p-3">Pricing Method</th>
            <th className="p-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => [
            <FeeRow
              key={`${row.countryId}-service`}
              category="Base Fee"
              item="Professional Service Fee"
              scope="EP Granting"
              pricingMethod="Fixed Fee"
              inputName={`serviceFee-${row.countryId}`}
              value={row.serviceFee}
              onChange={(value) => onBaseFeeChange(row.countryId, "serviceFee", value)}
            />,
            <FeeRow
              key={`${row.countryId}-official`}
              category="Base Fee"
              item="EPO Official Fee"
              scope="European Patent Office"
              pricingMethod="Disbursement"
              inputName={`officialFee-${row.countryId}`}
              value={row.officialFee}
              onChange={(value) => onBaseFeeChange(row.countryId, "officialFee", value)}
            />,
            ...row.translationFeeDetails.map((fee) => (
              <FeeRow
                key={`${row.countryId}-translation-${fee.languageId}`}
                category="Translation Fee"
                item="Claims Translation"
                scope={shortLanguageName(fee.languageName)}
                pricingMethod="Per Language"
                inputName={`translationFee-${row.countryId}-${fee.languageId}`}
                value={fee.amount}
                onChange={(value) => onTranslationFeeChange(row.countryId, fee.languageId, value)}
              />
            )),
          ])}
        </tbody>
        <tfoot className="border-t font-semibold">
          <tr>
            <td colSpan={5} className="p-0">
              <div className="ml-auto grid w-fit grid-cols-[minmax(15rem,1fr)_max-content] items-center gap-x-6 gap-y-3 px-3 py-4">
                <SummaryLine label="Base Fee Subtotal" value={formatAmount(totals.baseFee)} />
                <SummaryLine
                  label={(
                    <span className="flex items-center gap-2">
                      Translation Fee Subtotal
                      {totals.discount > 0 ? <DiscountBadge value={totals.discount} /> : null}
                    </span>
                  )}
                  value={totals.discount > 0 ? (
                    <span className="flex justify-end gap-2">
                      <span className="text-muted-foreground line-through">
                        {formatAmount(totals.translationBeforeDiscount)}
                      </span>
                      {formatAmount(totals.translationFee)}
                    </span>
                  ) : formatAmount(totals.translationFee)}
                />
                <SummaryLine
                  label="Quotation Total"
                  value={`${currencySymbol(currency)}${formatAmount(totals.total)}`}
                  final
                />
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FeeRow({
  category,
  item,
  scope,
  pricingMethod,
  inputName,
  value,
  onChange,
}: {
  category: string;
  item: string;
  scope: string;
  pricingMethod: string;
  inputName: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <tr className="border-t">
      <th scope="row" className="p-3 text-left font-medium">{category}</th>
      <td className="p-3">{item}</td>
      <td className="p-3">{scope}</td>
      <td className="p-3">{pricingMethod}</td>
      <td className="p-3 text-right">
        <input
          aria-label={`${scope} amount`}
          className="h-9 w-28 rounded-md border bg-background px-2 text-right"
          name={inputName}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
      </td>
    </tr>
  );
}

function SummaryLine({ label, value, final = false }: {
  label: React.ReactNode;
  value: React.ReactNode;
  final?: boolean;
}) {
  return (
    <>
      <div className={final ? "text-base" : undefined}>{label}</div>
      <div className={final ? "whitespace-nowrap text-right text-base" : "whitespace-nowrap text-right"}>{value}</div>
    </>
  );
}

function DiscountBadge({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
      {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}% discount
    </span>
  );
}

function shortLanguageName(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim() || value;
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySymbol(currency: string) {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "CNY") return "¥";
  return `${currency} `;
}
