"use client";

import { useMountEffect } from "@crm/ui/hooks/use-mount-effect";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { SupportedLocale } from "@/i18n/locale";
import { seedLocaleCookie } from "@/lib/locale-actions";

export function LocaleCookieSync({ locale }: { locale: SupportedLocale }) {
	const router = useRouter();
	const active = useLocale();

	useMountEffect(() => {
		void seedLocaleCookie(locale).then(() => {
			if (locale !== active) router.refresh();
		});
	});

	return null;
}
