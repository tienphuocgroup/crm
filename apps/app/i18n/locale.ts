export const SUPPORTED_LOCALES = ["en", "vi"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export const PSEUDO_LOCALE = "pseudo";

export type ActiveLocale = SupportedLocale | typeof PSEUDO_LOCALE;

const INTL_LOCALES: Record<SupportedLocale, string> = {
	en: "en-US",
	vi: "vi-VN",
};

export const DEFAULT_INTL_LOCALE = INTL_LOCALES[DEFAULT_LOCALE];

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isSupportedLocale(value: string): value is SupportedLocale {
	return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isPseudoLocaleEnabled(): boolean {
	return process.env.NODE_ENV !== "production";
}

export function isActiveLocale(value: string): value is ActiveLocale {
	if (isSupportedLocale(value)) return true;
	return value === PSEUDO_LOCALE && isPseudoLocaleEnabled();
}

export function intlLocale(value: string): string {
	return isSupportedLocale(value) ? INTL_LOCALES[value] : DEFAULT_INTL_LOCALE;
}
