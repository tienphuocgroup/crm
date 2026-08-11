export const DEFAULT_FORMAT_LOCALE = "en-US";

const WELL_FORMED_CURRENCY_CODE = /^[A-Za-z]{3}$/;

const PERCENT_OPTIONS: Intl.NumberFormatOptions = {
	style: "percent",
	maximumFractionDigits: 0,
};

const DAY_OPTIONS: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	year: "numeric",
};

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(
	locale: string,
	options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
	const key = `${locale}|${options ? JSON.stringify(options) : ""}`;
	const cached = numberFormats.get(key);
	if (cached) return cached;

	const formatter = new Intl.NumberFormat(locale, options);
	numberFormats.set(key, formatter);
	return formatter;
}

export function dateTimeFormat(
	locale: string,
	options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	const key = `${locale}|${options ? JSON.stringify(options) : ""}`;
	const cached = dateTimeFormats.get(key);
	if (cached) return cached;

	const formatter = new Intl.DateTimeFormat(locale, options);
	dateTimeFormats.set(key, formatter);
	return formatter;
}

function displayCurrencyCode(currency: string): string {
	return WELL_FORMED_CURRENCY_CODE.test(currency)
		? currency.toUpperCase()
		: "USD";
}

const currencyDigits = new Map<string, number>();

function fractionDigits(code: string): number {
	const cached = currencyDigits.get(code);
	if (cached !== undefined) return cached;

	const digits =
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: code,
		}).resolvedOptions().maximumFractionDigits ?? 2;

	currencyDigits.set(code, digits);
	return digits;
}

export function formatMoney(
	cents: number,
	currency = "usd",
	locale = DEFAULT_FORMAT_LOCALE,
): string {
	const code = displayCurrencyCode(currency);
	const whole = cents % 100 === 0;
	const digits = fractionDigits(code);

	return numberFormat(locale, {
		style: "currency",
		currency: code,
		minimumFractionDigits: whole ? 0 : Math.min(2, digits),
		maximumFractionDigits: whole ? 0 : digits,
	}).format(cents / 100);
}

export function formatMoneyCompact(
	cents: number,
	currency = "usd",
	locale = DEFAULT_FORMAT_LOCALE,
): string {
	return numberFormat(locale, {
		style: "currency",
		currency: displayCurrencyCode(currency),
		notation: "compact",
		maximumFractionDigits: cents % 100_000 === 0 ? 0 : 1,
	}).format(cents / 100);
}

export function formatPercent(
	rate: number,
	locale = DEFAULT_FORMAT_LOCALE,
): string {
	return numberFormat(locale, PERCENT_OPTIONS).format(rate);
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function toDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDay(value: string | null | undefined): Date | undefined {
	if (!value) return undefined;
	const [year, month, day] = value.slice(0, 10).split("-").map(Number);
	if (!year || !month || !day) return undefined;
	const date = new Date(year, month - 1, day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDay(
	value: string | null | undefined,
	locale = DEFAULT_FORMAT_LOCALE,
): string {
	const date = fromDay(value);
	return date
		? dateTimeFormat(locale, DAY_OPTIONS).format(date)
		: (value ?? "—");
}

export function initialsFromName(name: string | null | undefined): string {
	const parts = (name ?? "").split(/\s+/).filter(Boolean);
	const first = parts[0];
	if (!first) return "?";
	if (parts.length === 1) return first.slice(0, 2).toUpperCase();
	const last = parts[parts.length - 1] ?? first;
	return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
