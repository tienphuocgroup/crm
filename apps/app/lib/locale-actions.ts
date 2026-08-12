"use server";

import { cookies } from "next/headers";
import {
	isSupportedLocale,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
} from "@/i18n/locale";

export async function seedLocaleCookie(locale: string): Promise<void> {
	if (!isSupportedLocale(locale)) return;

	const store = await cookies();
	store.set(LOCALE_COOKIE, locale, {
		path: "/",
		sameSite: "lax",
		maxAge: LOCALE_COOKIE_MAX_AGE,
	});
}
