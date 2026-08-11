import { cookies } from "next/headers";
import {
	type ActiveLocale,
	DEFAULT_LOCALE,
	isActiveLocale,
	LOCALE_COOKIE,
} from "./locale";

export async function resolveLocale(): Promise<ActiveLocale> {
	const store = await cookies();
	const value = store.get(LOCALE_COOKIE)?.value;
	if (value && isActiveLocale(value)) {
		return value;
	}
	return DEFAULT_LOCALE;
}
