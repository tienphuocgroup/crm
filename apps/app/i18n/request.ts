import { getRequestConfig } from "next-intl/server";
import agentPanel from "../messages/en/agent-panel.json";
import common from "../messages/en/common.json";
import companies from "../messages/en/companies.json";
import contacts from "../messages/en/contacts.json";
import dashboard from "../messages/en/dashboard.json";
import deals from "../messages/en/deals.json";
import landing from "../messages/en/landing.json";
import nav from "../messages/en/nav.json";
import settings from "../messages/en/settings.json";
import ui from "../messages/en/ui.json";
import { type ActiveLocale, PSEUDO_LOCALE } from "./locale";
import { resolveLocale } from "./resolve-locale";

const EN_MESSAGES = {
	"agent-panel": agentPanel,
	common,
	companies,
	contacts,
	dashboard,
	deals,
	landing,
	nav,
	settings,
	ui,
};

type Namespace = keyof typeof EN_MESSAGES;

async function loadMessages(locale: ActiveLocale): Promise<typeof EN_MESSAGES> {
	if (locale !== PSEUDO_LOCALE) return EN_MESSAGES;
	const namespaces = Object.keys(EN_MESSAGES) as Namespace[];
	const entries = await Promise.all(
		namespaces.map(async (namespace) => {
			try {
				const catalog = await import(`../messages/${locale}/${namespace}.json`);
				return [namespace, catalog.default] as const;
			} catch {
				return [namespace, EN_MESSAGES[namespace]] as const;
			}
		}),
	);
	return Object.fromEntries(entries) as typeof EN_MESSAGES;
}

export default getRequestConfig(async () => {
	const locale = await resolveLocale();
	return {
		locale,
		messages: await loadMessages(locale),
		timeZone: "UTC",
	};
});
