import { NextIntlClientProvider } from "next-intl";
import { resolveLocale } from "@/i18n/locale";

export async function LocaleProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await resolveLocale();
	return (
		<NextIntlClientProvider locale={locale}>{children}</NextIntlClientProvider>
	);
}
