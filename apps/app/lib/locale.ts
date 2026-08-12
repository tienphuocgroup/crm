import {
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	type SupportedLocale,
} from "@/i18n/locale";

export function writeLocaleCookie(locale: SupportedLocale): void {
	document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
