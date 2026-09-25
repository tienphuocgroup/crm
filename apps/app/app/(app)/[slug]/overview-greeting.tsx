"use client";

import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { PageShellDescription, PageShellTitle } from "@/components/page-shell";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { overviewParsers } from "./overview-search-params";

export function OverviewGreetingFallback() {
	const t = useTranslations("dashboard");

	return (
		<>
			<PageShellTitle>{t("greetingTitle")}</PageShellTitle>
			<PageShellDescription>
				{t("greetingDescription", { scope: "me" })}
			</PageShellDescription>
		</>
	);
}

export function OverviewGreeting() {
	const t = useTranslations("dashboard");
	const [scope] = useQueryState(
		SEARCH_PARAM.overview.scope,
		overviewParsers[SEARCH_PARAM.overview.scope],
	);

	return (
		<>
			<PageShellTitle>{t("greetingTitle")}</PageShellTitle>
			<PageShellDescription>
				{t("greetingDescription", { scope })}
			</PageShellDescription>
		</>
	);
}
