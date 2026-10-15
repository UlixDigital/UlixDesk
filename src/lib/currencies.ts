/**
 * ISO 4217 codes UlixDesk can bill in, with the minor-unit exponent from the standard.
 * JPY has 0 decimal places. USD has 2. BHD has 3. Amounts are never stored as floats.
 */
export const CURRENCIES = [
  { code: "AED", minorDigits: 2, name: "UAE Dirham" },
  { code: "ARS", minorDigits: 2, name: "Argentine Peso" },
  { code: "AUD", minorDigits: 2, name: "Australian Dollar" },
  { code: "BDT", minorDigits: 2, name: "Bangladeshi Taka" },
  { code: "BGN", minorDigits: 2, name: "Bulgarian Lev" },
  { code: "BHD", minorDigits: 3, name: "Bahraini Dinar" },
  { code: "BIF", minorDigits: 0, name: "Burundian Franc" },
  { code: "BRL", minorDigits: 2, name: "Brazilian Real" },
  { code: "CAD", minorDigits: 2, name: "Canadian Dollar" },
  { code: "CHF", minorDigits: 2, name: "Swiss Franc" },
  { code: "CLP", minorDigits: 0, name: "Chilean Peso" },
  { code: "CNY", minorDigits: 2, name: "Chinese Yuan" },
  { code: "COP", minorDigits: 2, name: "Colombian Peso" },
  { code: "CRC", minorDigits: 2, name: "Costa Rican Colon" },
  { code: "CZK", minorDigits: 2, name: "Czech Koruna" },
  { code: "DJF", minorDigits: 0, name: "Djiboutian Franc" },
  { code: "DKK", minorDigits: 2, name: "Danish Krone" },
  { code: "DOP", minorDigits: 2, name: "Dominican Peso" },
  { code: "EGP", minorDigits: 2, name: "Egyptian Pound" },
  { code: "EUR", minorDigits: 2, name: "Euro" },
  { code: "GBP", minorDigits: 2, name: "British Pound" },
  { code: "GEL", minorDigits: 2, name: "Georgian Lari" },
  { code: "GHS", minorDigits: 2, name: "Ghanaian Cedi" },
  { code: "GNF", minorDigits: 0, name: "Guinean Franc" },
  { code: "HKD", minorDigits: 2, name: "Hong Kong Dollar" },
  { code: "HUF", minorDigits: 2, name: "Hungarian Forint" },
  { code: "IDR", minorDigits: 2, name: "Indonesian Rupiah" },
  { code: "ILS", minorDigits: 2, name: "Israeli Shekel" },
  { code: "INR", minorDigits: 2, name: "Indian Rupee" },
  { code: "IQD", minorDigits: 3, name: "Iraqi Dinar" },
  { code: "ISK", minorDigits: 0, name: "Icelandic Krona" },
  { code: "JOD", minorDigits: 3, name: "Jordanian Dinar" },
  { code: "JPY", minorDigits: 0, name: "Japanese Yen" },
  { code: "KES", minorDigits: 2, name: "Kenyan Shilling" },
  { code: "KMF", minorDigits: 0, name: "Comorian Franc" },
  { code: "KRW", minorDigits: 0, name: "South Korean Won" },
  { code: "KWD", minorDigits: 3, name: "Kuwaiti Dinar" },
  { code: "LKR", minorDigits: 2, name: "Sri Lankan Rupee" },
  { code: "LYD", minorDigits: 3, name: "Libyan Dinar" },
  { code: "MAD", minorDigits: 2, name: "Moroccan Dirham" },
  { code: "MXN", minorDigits: 2, name: "Mexican Peso" },
  { code: "MYR", minorDigits: 2, name: "Malaysian Ringgit" },
  { code: "NGN", minorDigits: 2, name: "Nigerian Naira" },
  { code: "NOK", minorDigits: 2, name: "Norwegian Krone" },
  { code: "NPR", minorDigits: 2, name: "Nepalese Rupee" },
  { code: "NZD", minorDigits: 2, name: "New Zealand Dollar" },
  { code: "OMR", minorDigits: 3, name: "Omani Rial" },
  { code: "PEN", minorDigits: 2, name: "Peruvian Sol" },
  { code: "PHP", minorDigits: 2, name: "Philippine Peso" },
  { code: "PKR", minorDigits: 2, name: "Pakistani Rupee" },
  { code: "PLN", minorDigits: 2, name: "Polish Zloty" },
  { code: "PYG", minorDigits: 0, name: "Paraguayan Guarani" },
  { code: "QAR", minorDigits: 2, name: "Qatari Riyal" },
  { code: "RON", minorDigits: 2, name: "Romanian Leu" },
  { code: "RWF", minorDigits: 0, name: "Rwandan Franc" },
  { code: "SAR", minorDigits: 2, name: "Saudi Riyal" },
  { code: "SEK", minorDigits: 2, name: "Swedish Krona" },
  { code: "SGD", minorDigits: 2, name: "Singapore Dollar" },
  { code: "THB", minorDigits: 2, name: "Thai Baht" },
  { code: "TND", minorDigits: 3, name: "Tunisian Dinar" },
  { code: "TRY", minorDigits: 2, name: "Turkish Lira" },
  { code: "TWD", minorDigits: 2, name: "New Taiwan Dollar" },
  { code: "UAH", minorDigits: 2, name: "Ukrainian Hryvnia" },
  { code: "UGX", minorDigits: 0, name: "Ugandan Shilling" },
  { code: "USD", minorDigits: 2, name: "US Dollar" },
  { code: "VND", minorDigits: 0, name: "Vietnamese Dong" },
  { code: "VUV", minorDigits: 0, name: "Vanuatu Vatu" },
  { code: "XAF", minorDigits: 0, name: "Central African CFA Franc" },
  { code: "XOF", minorDigits: 0, name: "West African CFA Franc" },
  { code: "XPF", minorDigits: 0, name: "CFP Franc" },
  { code: "ZAR", minorDigits: 2, name: "South African Rand" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const BY_CODE = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/** Largest hourly rate that fits in a 32-bit signed integer of minor units. */
export const MAX_RATE_MINOR = 2_147_483_647;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return BY_CODE.has(value as CurrencyCode);
}

export function minorDigits(currency: string) {
  return BY_CODE.get(currency as CurrencyCode)?.minorDigits ?? null;
}

export function currencyOptionLabel(currency: (typeof CURRENCIES)[number]) {
  return `${currency.code} — ${currency.name}`;
}
