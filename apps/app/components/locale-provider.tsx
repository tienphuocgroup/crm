import { UiStringsProvider } from "@crm/ui/components/ui-strings-provider";
import type { UiStrings } from "@crm/ui/lib/ui-strings";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { intlLocale } from "@/i18n/locale";
import { resolveLocale } from "@/i18n/resolve-locale";

export async function LocaleProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await resolveLocale();
	const messages = await getMessages();

	return (
		<NextIntlClientProvider locale={locale}>
			<UiStringsProvider
				strings={messages.ui as Partial<UiStrings>}
				locale={intlLocale(locale)}
			>
				{children}
			</UiStringsProvider>
		</NextIntlClientProvider>
	);
}
