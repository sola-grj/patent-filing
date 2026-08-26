export const ERP_QUOTE_CURRENCIES = [
  { id: 1, code: "CNY", label: "Chinese Yuan" },
  { id: 2, code: "USD", label: "US Dollar" },
  { id: 3, code: "EUR", label: "Euro" },
  { id: 4, code: "GBP", label: "British Pound" },
  { id: 5, code: "HKD", label: "Hong Kong Dollar" },
] as const;

export type ErpQuoteCurrencyCode = (typeof ERP_QUOTE_CURRENCIES)[number]["code"];

export function erpQuoteCurrency(value?: string | null) {
  if (!value) {
    return ERP_QUOTE_CURRENCIES.find((currency) => currency.code === "USD")!;
  }
  const currency = ERP_QUOTE_CURRENCIES.find((option) => option.code === value);
  if (!currency) throw new Error("The selected quote currency is not supported by the pricing service.");
  return currency;
}

export function isErpQuoteCurrencyCode(value: unknown): value is ErpQuoteCurrencyCode {
  return typeof value === "string"
    && ERP_QUOTE_CURRENCIES.some((currency) => currency.code === value);
}

export type ErpCustomer = {
  clientId: number;
  clientName: string;
  companyName: string;
  isBlack: boolean;
};

export type ErpCountry = {
  id: number;
  name: string;
  cname: string;
  isDistinguishEntry?: boolean;
  officialCurrency?: number;
};

export type ErpPriceRequest = {
  categoryId: number;
  sourceLangId: number;
  countryIdList?: number[];
  targetLangIds?: number[];
  optType?: 1 | 2 | 3 | 4;
  countryOptMap?: Record<string, true>;
  patFilingTypeId: number;
  clientId: number;
  priceCurrencyId: number;
  patClaims: number;
  patTotalPages?: number;
  patTotalWords?: number;
  patClaimWords: number;
};

export type ErpPriceRow = {
  countryId: number;
  officialFee: number;
  serviceFee: number;
  translationFees: Record<string, number>;
};

export type ErpQuoteRow = ErpPriceRow & {
  countryName: string;
  translationFee: number;
  translationFeeDetails: Array<{
    languageId: number;
    languageName: string;
    amount: number;
  }>;
  total: number;
};

export type ErpQuotePreview = {
  source: "eci_erp";
  currency: ErpQuoteCurrencyCode;
  quotedAt: string;
  rows: ErpQuoteRow[];
  total: number;
};

export type ErpQuoteResult = ErpQuotePreview & {
  request: ErpPriceRequest;
};

export type ErpActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
