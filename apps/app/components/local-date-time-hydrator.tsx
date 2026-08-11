import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale } from "@/i18n/locale";
import {
	buildLocalDateTimeScript,
	localDateTimeLabels,
} from "@/lib/local-date-time-script";
import { InlineScript } from "./inline-script";

export async function LocalDateTimeHydrator() {
	const locale = await getLocale();
	const t = await getTranslations("common");
	const labels = localDateTimeLabels((key) => t.raw(key) as string);

	return (
		<InlineScript html={buildLocalDateTimeScript(intlLocale(locale), labels)} />
	);
}
