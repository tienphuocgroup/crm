import { cookies } from "next/headers";
import {
	DEFAULT_LOCALE,
	isSupportedLocale,
	LOCALE_COOKIE,
	type SupportedLocale,
} from "./locale";

export async function resolveLocale(): Promise<SupportedLocale> {
	const store = await cookies();
	const value = store.get(LOCALE_COOKIE)?.value;
	if (value && isSupportedLocale(value)) {
		return value;
	}
	return DEFAULT_LOCALE;
}
