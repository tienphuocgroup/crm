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
import { resolveLocale } from "./resolve-locale";

export default getRequestConfig(async () => {
	const locale = await resolveLocale();
	return {
		locale,
		messages: {
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
		},
		timeZone: "UTC",
	};
});
