import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@/components/page-shell";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { companiesSearchParams } from "./companies-search-params";
import { CompaniesTable } from "./companies-table";
import { CreateCompanySheet } from "./create-company-sheet";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("companies");
	return { title: t("metaTitle") };
}

export default async function CompaniesPage({
	searchParams,
}: PageProps<"/[slug]/companies">) {
	const t = await getTranslations("companies");

	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("metaTitle")}</PageShellTitle>
					<PageShellDescription>{t("pageDescription")}</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<CreateCompanySheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading />}>
					<Companies searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Companies({
	searchParams,
}: Pick<PageProps<"/[slug]/companies">, "searchParams">) {
	const [, values] = await Promise.all([
		requireSession(),
		companiesSearchParams.load(searchParams),
	]);

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.companies.list.queryOptions(companiesSearchParams.toInput(values)),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
	]);

	return (
		<HydrateClient>
			<CompaniesTable />
		</HydrateClient>
	);
}
