"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import { isSupportedLocale } from "@/i18n/locale";

export function HtmlLangSync() {
	const locale = useLocale();

	useEffect(() => {
		if (isSupportedLocale(locale) && document.documentElement.lang !== locale) {
			document.documentElement.lang = locale;
		}
	}, [locale]);

	return null;
}
