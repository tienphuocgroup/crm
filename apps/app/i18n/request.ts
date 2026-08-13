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
import viAgentPanel from "../messages/vi/agent-panel.json";
import viCommon from "../messages/vi/common.json";
import viCompanies from "../messages/vi/companies.json";
import viContacts from "../messages/vi/contacts.json";
import viDashboard from "../messages/vi/dashboard.json";
import viDeals from "../messages/vi/deals.json";
import viLanding from "../messages/vi/landing.json";
import viNav from "../messages/vi/nav.json";
import viSettings from "../messages/vi/settings.json";
import viUi from "../messages/vi/ui.json";
import {
	type ActiveLocale,
	PSEUDO_LOCALE,
	type SupportedLocale,
} from "./locale";
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

const VI_MESSAGES: typeof EN_MESSAGES = {
	"agent-panel": viAgentPanel,
	common: viCommon,
	companies: viCompanies,
	contacts: viContacts,
	dashboard: viDashboard,
	deals: viDeals,
	landing: viLanding,
	nav: viNav,
	settings: viSettings,
	ui: viUi,
};

const CATALOGS: Record<SupportedLocale, typeof EN_MESSAGES> = {
	en: EN_MESSAGES,
	vi: VI_MESSAGES,
};

type Namespace = keyof typeof EN_MESSAGES;

async function loadMessages(locale: ActiveLocale): Promise<typeof EN_MESSAGES> {
	if (locale !== PSEUDO_LOCALE) return CATALOGS[locale];
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
