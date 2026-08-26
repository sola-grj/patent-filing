"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ERP_QUOTE_CURRENCIES,
  isErpQuoteCurrencyCode,
  type ErpQuoteCurrencyCode,
} from "@/lib/eci-erp/types";

export function QuoteCurrencySelect({
  value,
  onChange,
}: {
  value: ErpQuoteCurrencyCode;
  onChange: (value: ErpQuoteCurrencyCode) => void;
}) {
  const selected = ERP_QUOTE_CURRENCIES.find((option) => option.code === value)!;

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (isErpQuoteCurrencyCode(nextValue)) onChange(nextValue);
      }}
    >
      <SelectTrigger
        className="w-auto min-w-[112px] gap-2 border-0 bg-transparent px-2 shadow-none hover:bg-muted/50 focus:ring-0"
        aria-label="Quote currency"
      >
        <SelectValue>
          <span className="font-medium">{selected.symbol} {selected.code}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {ERP_QUOTE_CURRENCIES.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.symbol} {option.code} — {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
